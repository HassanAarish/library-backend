import crypto from "crypto";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { generateToken, generatePendingToken } from "../utils/generateTokens.js";
import { sendOtp, passwordResetEmail } from "../utils/emailClient.js";
import { verifySocialToken } from "../utils/socialVerify.js";
import { uploadFromUrl, removeFiles } from "./Common.Service.js";
import { getEnv } from "../config/dotenv.js";
import { audit } from "../utils/audit.js";
import { afterCommit } from "../utils/requestContext.js";
import { disconnectStaleSessions } from "../realtime/socket.js";
import { cancelDeletionOnSignIn } from "./AccountDeletion.Service.js";
import helper from "../utils/helper.js";

// Maps a social provider to the User field that stores its account id.
const PROVIDER_ID_FIELD = {
  google: "googleId",
  facebook: "facebookId",
};

const sanitizeUser = (user) => {
  const obj = user.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.resetPassword;
  if (obj.twoFactor) delete obj.twoFactor.secret;
  return obj;
};

/**
 * Final step of EVERY login door (email + social): if the account has 2FA on,
 * hand back a short-lived pending token instead of a real access token, so the
 * caller is forced through the /twofactor/verify challenge. This is what keeps
 * social / linked accounts from bypassing 2FA.
 */
const issueSession = async (user, method, session = null) => {
  const auditDetails = {
    actor: user._id,
    actorEmail: user.email,
    metadata: { method },
  };

  if (user.twoFactor?.enabled) {
    audit("auth.login.2fa_challenge", auditDetails);
    return { twoFactorRequired: true, pendingToken: generatePendingToken(user) };
  }

  audit("auth.login", auditDetails);
  // Signing in keeps an account that was waiting to be deleted.
  const deletionCancelled = await cancelDeletionOnSignIn(user, session);
  return { user: sanitizeUser(user), token: generateToken(user), deletionCancelled };
};

// Records a failed login attempt. `user` is undefined for unknown emails.
const auditLoginFailure = (reason, { user, email, method = "email" }) => {
  audit("auth.login", {
    outcome: "failure",
    actor: user?._id,
    actorEmail: user?.email || email,
    metadata: { method, reason, email },
  });
};

// Where the password-reset link points (the frontend). Overridable via env.
const CLIENT_URL = getEnv("CLIENT_URL");

const OTP_TTL_MS = 5 * 60 * 1000; // verification codes are valid for 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // minimum gap between OTP (re)issues
const MAX_OTP_ATTEMPTS = 5; // wrong guesses allowed per issued code

// Cryptographically secure 6-digit code.
const generateOTP = () => crypto.randomInt(100000, 1000000);

export const register = async (body, session = null) => {
  // `role` is intentionally NOT read from the body — every signup is a "user".
  const { name, email, password, authType } = body;

  if (authType === "email") {
    const lowerEmail = helper.lowercaseEmail(email);

    // 1. Check if user exists (Pass the session!)
    const userExist = await User.findOne({ email: lowerEmail }).session(session);

    if (userExist) {
      throw new ErrorResponse("User with the same email already exists", 401);
    }

    // 2. Generate OTP
    const otp = generateOTP();
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    // 3. Create user
    const user = new User({
      name,
      email: lowerEmail,
      password,
      authType,
      role: "user",
      otp: { code: otp, expiry: expiry, attempts: 0 },
      isVerified: false,
    });
    await user.save({ session });

    // 4. Create User Preferences
    const preferences = new Preferences({ userId: user._id });

    await preferences.save({ session });

    // 5. Email the OTP. If this fails the whole registration is rolled back
    // (inTransaction aborts on a non-2xx response) so the user can retry cleanly.
    try {
      await sendOtp(user.email, otp);
    } catch (err) {
      console.error("Failed to send OTP email:", err);
      throw new ErrorResponse("We couldn't send your verification email. Please try again.", 500);
    }

    audit("auth.register", {
      actor: user._id,
      actorEmail: user.email,
      target: { type: "User", id: user._id },
      metadata: { method: "email" },
    });

    return true;
  }

  // Redirect to Google or Facebook for social login
  // Handle Social Auth
  if (authType === "google" || authType === "facebook") {
    throw new ErrorResponse("Redirect to Social Provider", 302);
  }
  throw new ErrorResponse("Invalid authentication type", 400);
};

export const verifyOtp = async (body, session = null) => {
  const { email, otp } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session);

  if (!user || user.isVerified || !user.otp?.code) {
    audit("auth.otp.verify", {
      outcome: "failure",
      actor: user?._id,
      actorEmail: lowerEmail,
      metadata: { reason: !user ? "unknown_email" : "no_pending_code" },
    });
    throw new ErrorResponse("Invalid or expired verification code.", 400);
  }

  const auditBase = { actor: user._id, actorEmail: user.email };

  // Check if the OTP has expired
  if (user.otp.expiry < new Date()) {
    throw new ErrorResponse("OTP expired", 400);
  }

  // Lock the code after too many wrong guesses (per account, not just per IP).
  if ((user.otp.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    audit("auth.otp.locked", { ...auditBase, outcome: "failure" });
    throw new ErrorResponse("Too many incorrect attempts. Please request a new code.", 429);
  }

  if (user.otp.code !== Number(otp)) {
    // Written outside the request transaction — it's aborted on this 400, and
    // the attempt counter must survive that.
    await User.updateOne({ _id: user._id }, { $inc: { "otp.attempts": 1 } });
    audit("auth.otp.verify", {
      ...auditBase,
      outcome: "failure",
      metadata: { reason: "wrong_code", attempt: (user.otp.attempts || 0) + 1 },
    });
    throw new ErrorResponse("Invalid OTP", 400);
  }

  // Clear OTP after successful verification and mark user as verified
  user.otp = undefined;
  user.isVerified = true;
  await user.save({ session });

  audit("auth.otp.verify", auditBase);
};

export const resendOtp = async (body, session = null) => {
  const { email } = body;
  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session);

  // Enumeration-resistant: only act for a real, still-unverified account.
  // Everything else falls through to the same generic controller response.
  if (!user || user.isVerified) {
    return;
  }

  // Lightweight anti-spam: if a code was issued within the cooldown window, keep
  // the existing one instead of firing another email (prevents inbox flooding).
  if (user.otp?.expiry) {
    const issuedAt = new Date(user.otp.expiry).getTime() - OTP_TTL_MS;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
      return;
    }
  }

  // Issue a fresh code (invalidating the previous one) and email it.
  const otp = generateOTP();
  user.otp = { code: otp, expiry: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
  await user.save({ session });

  audit("auth.otp.resend", { actor: user._id, actorEmail: user.email });

  // Fire-and-forget for the same timing/uniformity reasons as forgotPassword.
  sendOtp(user.email, otp).catch((err) => console.error("Failed to resend OTP email:", err));
};

export const login = async (body, session = null) => {
  const { email, password } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session).select("+password");

  if (!user) {
    auditLoginFailure("unknown_email", { email: lowerEmail });
    throw new ErrorResponse("Invalid credentials", 401);
  }

  if (user.isBlocked) {
    auditLoginFailure("blocked", { user, email: lowerEmail });
    throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
  }

  // This endpoint is email/password ONLY. Accounts created via a social
  // provider have no password and must use POST /auth/social — this also closes
  // the previous bypass where any social authType skipped the password check.
  if (!user.password) {
    auditLoginFailure("social_account", { user, email: lowerEmail });
    throw new ErrorResponse(
      "This account uses social sign-in. Please continue with Google or Facebook.",
      400,
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    auditLoginFailure("wrong_password", { user, email: lowerEmail });
    throw new ErrorResponse("Invalid credentials", 401);
  }

  if (!user.isVerified) {
    auditLoginFailure("unverified", { user, email: lowerEmail });
    throw new ErrorResponse("Please verify your email before logging in.", 403);
  }

  return issueSession(user, "email", session);
};

export const forgotPassword = async (body, session = null) => {
  const { email } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session);

  // Logged either way — the response stays generic, but repeated requests for
  // unknown emails are an enumeration signal worth seeing.
  audit("auth.password.reset_requested", {
    actor: user?._id,
    actorEmail: lowerEmail,
    metadata: { accountExists: Boolean(user) },
  });

  // Enumeration-resistant: never reveal whether an email is registered. Unknown
  // accounts silently no-op; the controller returns the same generic message
  // either way.
  if (!user) {
    return;
  }

  const resetToken = crypto.randomBytes(20).toString("hex");

  user.resetPassword.token = resetToken;
  user.resetPassword.expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({ session });

  const resetUrl = `${CLIENT_URL}/reset-password/${resetToken}`;

  // Fire-and-forget (no await): sending mail is the slowest, most variable step,
  // so awaiting it would make the "real account" path measurably slower than the
  // unknown-account no-op and leak existence via timing. Decoupling it keeps the
  // response time uniform. Failures are logged, never surfaced; the token simply
  // expires unused if delivery fails.
  passwordResetEmail(user.email, resetUrl).catch((err) =>
    console.error("Failed to send password reset email:", err),
  );
};

export const resetPassword = async (body, session = null) => {
  const { token, password } = body;
  const user = await User.findOne({
    "resetPassword.token": String(token),
    "resetPassword.expiry": { $gt: Date.now() },
  }).session(session);

  if (!user) {
    audit("auth.password.reset", { outcome: "failure", metadata: { reason: "invalid_token" } });
    throw new ErrorResponse("Invalid or Expired Link", 400);
  }

  user.password = password;

  user.resetPassword = undefined;

  await user.save({ session });

  audit("auth.password.reset", { actor: user._id, actorEmail: user.email });

  afterCommit(() => disconnectStaleSessions(user._id, user.passwordChangedAt));
  return true;
};

/**
 * Unified social sign-in for google | facebook.
 * Flow: verify provider token → log in existing provider user → else handle an
 * existing same-email (password) account via the ask-to-link handshake → else
 * create a fresh social user. Returns { user, token } or { linkRequired, email }.
 */
export const socialLogin = async (body, session = null) => {
  const { provider, token, name, link = false } = body;

  const idField = PROVIDER_ID_FIELD[provider];
  if (!idField) {
    throw new ErrorResponse("Unsupported social provider", 400);
  }

  // 1. Verify the provider token → normalized identity.
  let identity;
  try {
    identity = await verifySocialToken(provider, token);
  } catch (err) {
    auditLoginFailure("invalid_provider_token", { method: provider });
    throw err;
  }
  const { providerId, email, emailVerified, name: providerName, picture } = identity;

  // 2. Returning provider user (matched by their provider id) → straight login.
  const byProvider = await User.findOne({ [idField]: providerId }).session(session);
  if (byProvider) {
    if (byProvider.isBlocked) {
      auditLoginFailure("blocked", { user: byProvider, method: provider });
      throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
    }
    return issueSession(byProvider, provider, session);
  }

  // Beyond this point we need an email to match or create an account.
  if (!email) {
    throw new ErrorResponse(
      provider === "facebook"
        ? "Email permission is required to sign in with Facebook."
        : "Your social account did not provide an email address.",
      400,
    );
  }

  // 3. An account already exists for this email → ask-to-link handshake.
  const byEmail = await User.findOne({ email }).session(session);
  if (byEmail) {
    if (byEmail.isBlocked) {
      auditLoginFailure("blocked", { user: byEmail, method: provider });
      throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
    }

    // Only ever link when the provider vouches for the email.
    if (!emailVerified) {
      auditLoginFailure("unverified_provider_email", { user: byEmail, method: provider });
      throw new ErrorResponse(
        "An account with this email already exists. Please sign in with your password.",
        409,
      );
    }

    // Require explicit consent before attaching the provider to the account.
    if (!link) {
      return { linkRequired: true, email };
    }

    byEmail[idField] = providerId;
    if (!byEmail.isVerified) byEmail.isVerified = true;
    await byEmail.save({ session });

    audit("auth.social.linked", {
      actor: byEmail._id,
      actorEmail: byEmail.email,
      metadata: { provider },
    });

    // If the linked account has no avatar yet, adopt the provider's (stored on
    // Cloudinary). Best-effort — never block the link on an avatar issue.
    if (picture) {
      try {
        const prefs = await Preferences.findOne({ userId: byEmail._id }).session(session);
        if (prefs && !prefs.profilePicture?.url) {
          prefs.profilePicture = await uploadFromUrl(picture);
          await prefs.save({ session });
        }
      } catch (err) {
        console.error("Failed to store social avatar on link:", err);
      }
    }

    return issueSession(byEmail, provider, session);
  }

  // 4. Brand-new social user — require a verified email to create one.
  if (!emailVerified) {
    throw new ErrorResponse("Your social account email could not be verified.", 400);
  }

  // Persist the provider avatar on Cloudinary so it never expires. Non-fatal:
  // if the upload fails we still create the account, just without an avatar.
  let avatar = {};
  if (picture) {
    try {
      avatar = await uploadFromUrl(picture);
    } catch (err) {
      console.error("Failed to store social avatar:", err);
    }
  }

  try {
    const newUser = new User({
      name: name || providerName || "User",
      email,
      authType: provider,
      [idField]: providerId,
      isVerified: true,
    });
    await newUser.save({ session });

    // Mirror the email-register flow: every user gets a Preferences doc.
    const preferences = new Preferences({
      userId: newUser._id,
      profilePicture: avatar,
    });
    await preferences.save({ session });

    audit("auth.register", {
      actor: newUser._id,
      actorEmail: newUser.email,
      target: { type: "User", id: newUser._id },
      metadata: { method: provider },
    });

    return issueSession(newUser, provider, session);
  } catch (err) {
    // DB write failed after the upload — remove the orphaned Cloudinary asset.
    if (avatar.public_id) await removeFiles(avatar.public_id).catch(() => {});
    throw err;
  }
};
