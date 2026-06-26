import crypto from "crypto";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { generateToken, generatePendingToken } from "../utils/generateTokens.js";
import { sendOtp, passwordResetEmail } from "../utils/emailClient.js";
import { verifySocialToken } from "../utils/socialVerify.js";
import { uploadFromUrl, removeFiles } from "./Common.Service.js";
import { getEnv } from "../config/dotenv.js";
import helper from "../utils/helper.js";

// Maps a social provider to the User field that stores its account id.
const PROVIDER_ID_FIELD = {
  google: "googleId",
  apple: "appleId",
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
const issueSession = (user) => {
  if (user.twoFactor?.enabled) {
    return { twoFactorRequired: true, pendingToken: generatePendingToken(user) };
  }
  return { user: sanitizeUser(user), token: generateToken(user) };
};

// Where the password-reset link points (the frontend). Overridable via env.
const CLIENT_URL = getEnv("CLIENT_URL");

const OTP_TTL_MS = 5 * 60 * 1000; // verification codes are valid for 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // minimum gap between OTP (re)issues

function generateOTP() {
  const uniqueNumber = Math.floor(100000 + Math.random() * 900000);
  return uniqueNumber;
}

export const register = async (body, session = null) => {
  const { name, email, password, profilePicture, role, authType } = body;

  if (authType === "email") {
    // 1. Check if user exists (Pass the session!)
    const userExist = await User.findOne({ email }).session(session);

    if (userExist) {
      throw new ErrorResponse("User with the same email already exists", 401);
    }

    // 2. Generate OTP
    const otp = generateOTP();
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    // 3. Create user
    const user = new User({
      name,
      email: helper.lowercaseEmail(email),
      password,
      authType,
      role: role || "user",
      otp: { code: otp, expiry: expiry },
      isVerified: false,
    });
    await user.save({ session });

    // 4. Create User Preferences
    // We link it via user._id and save the profilePicture object from Cloudinary
    const preferences = new Preferences({
      userId: user._id,
      profilePicture: profilePicture || {}, // Save the {name, url, public_id} object
    });

    await preferences.save({ session });

    // 5. Email the OTP. If this fails the whole registration is rolled back
    // (inTransaction aborts on a non-2xx response) so the user can retry cleanly.
    try {
      await sendOtp(user.email, otp);
    } catch (err) {
      console.error("Failed to send OTP email:", err);
      throw new ErrorResponse("We couldn't send your verification email. Please try again.", 500);
    }

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

  const user = await User.findOne({
    email: lowerEmail,
    "otp.code": otp,
  }).session(session);

  if (!user) {
    throw new ErrorResponse("User not found or have been deleted.", 404);
  }

  // Validate OTP existence and matching
  if (user?.otp?.code != otp) {
    throw new ErrorResponse("Invalid OTP", 400);
  }

  // Check if the OTP has expired
  if (user.otp.expiry < new Date()) {
    throw new ErrorResponse("OTP expired", 400);
  }

  // Clear OTP after successful verification and mark user as verified
  user.otp = undefined;
  user.isVerified = true;
  await user.save({ session });
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
  user.otp = { code: otp, expiry: new Date(Date.now() + OTP_TTL_MS) };
  await user.save({ session });

  // Fire-and-forget for the same timing/uniformity reasons as forgotPassword.
  sendOtp(user.email, otp).catch((err) => console.error("Failed to resend OTP email:", err));
};

export const login = async (body, session = null) => {
  const { email, password } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session).select("+password");

  if (!user) {
    throw new ErrorResponse("Invalid credentials", 401);
  }

  if (user.isBlocked) {
    throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
  }

  // This endpoint is email/password ONLY. Accounts created via a social
  // provider have no password and must use POST /auth/social — this also closes
  // the previous bypass where any social authType skipped the password check.
  if (!user.password) {
    throw new ErrorResponse(
      "This account uses social sign-in. Please continue with Google, Apple, or Facebook.",
      400,
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ErrorResponse("Invalid credentials", 401);
  }

  if (!user.isVerified) {
    throw new ErrorResponse("Please verify your email before logging in.", 403);
  }

  return issueSession(user);
};

export const forgotPassword = async (body, session = null) => {
  const { email } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session);

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
    "resetPassword.token": token,
    "resetPassword.expiry": { $gt: Date.now() },
  }).session(session);

  if (!user) {
    throw new ErrorResponse("Invalid or Expired Link", 400);
  }

  user.password = password;

  user.resetPassword = undefined;

  await user.save({ session });
  return true;
};

/**
 * Unified social sign-in for google | apple | facebook.
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
  const identity = await verifySocialToken(provider, token);
  const { providerId, email, emailVerified, name: providerName, picture } = identity;

  // 2. Returning provider user (matched by their provider id) → straight login.
  const byProvider = await User.findOne({ [idField]: providerId }).session(session);
  if (byProvider) {
    if (byProvider.isBlocked) {
      throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
    }
    return issueSession(byProvider);
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
      throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
    }

    // Only ever link when the provider vouches for the email.
    if (!emailVerified) {
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

    return issueSession(byEmail);
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

    return issueSession(newUser);
  } catch (err) {
    // DB write failed after the upload — remove the orphaned Cloudinary asset.
    if (avatar.public_id) await removeFiles(avatar.public_id).catch(() => {});
    throw err;
  }
};
