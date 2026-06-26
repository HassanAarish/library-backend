import jwt from "jsonwebtoken";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { getEnv } from "../config/dotenv.js";
import { generateToken } from "../utils/generateTokens.js";
import { generateTwoFactorSecret, verifyTwoFactorCode } from "../utils/twoFactor.js";

const SECRET_KEY = getEnv("SECRET_KEY");

// Start setup: generate + store a (not-yet-enabled) secret, return the QR to scan.
export const setup = async (userId, email, session = null) => {
  const user = await User.findById(userId).session(session);
  if (!user) throw new ErrorResponse("User not found", 404);
  if (user.twoFactor?.enabled) {
    throw new ErrorResponse("Two-factor authentication is already enabled.", 400);
  }

  const { secret, otpauthUrl, qrCode } = await generateTwoFactorSecret(email || user.email);

  user.twoFactor = { enabled: false, secret };
  await user.save({ session });

  return { qrCode, otpauthUrl };
};

// Confirm setup: verify the first code, then flip 2FA on.
export const enable = async (userId, code, session = null) => {
  const user = await User.findById(userId).session(session);
  if (!user) throw new ErrorResponse("User not found", 404);
  if (user.twoFactor?.enabled) {
    throw new ErrorResponse("Two-factor authentication is already enabled.", 400);
  }
  if (!user.twoFactor?.secret) {
    throw new ErrorResponse("Start 2FA setup before enabling it.", 400);
  }
  if (!verifyTwoFactorCode(user.twoFactor.secret, code)) {
    throw new ErrorResponse("Invalid code. Please try again.", 400);
  }

  user.twoFactor.enabled = true;
  await user.save({ session });
  return true;
};

// Turn 2FA off — requires a valid current code so a hijacked session can't disable it.
export const disable = async (userId, code, session = null) => {
  const user = await User.findById(userId).session(session);
  if (!user) throw new ErrorResponse("User not found", 404);
  if (!user.twoFactor?.enabled) {
    throw new ErrorResponse("Two-factor authentication is not enabled.", 400);
  }
  if (!verifyTwoFactorCode(user.twoFactor.secret, code)) {
    throw new ErrorResponse("Invalid code. Please try again.", 400);
  }

  user.twoFactor = { enabled: false, secret: undefined };
  await user.save({ session });
  return true;
};

// Login challenge: exchange a valid pending token + code for a real access token.
export const verifyLogin = async (body) => {
  const { pendingToken, code } = body;

  let decoded;
  try {
    decoded = jwt.verify(pendingToken, SECRET_KEY);
  } catch {
    throw new ErrorResponse("Your verification session has expired. Please sign in again.", 401);
  }
  if (!decoded?.twoFactorPending || !decoded?.userID) {
    throw new ErrorResponse("Invalid verification session.", 401);
  }

  const user = await User.findById(decoded.userID);
  if (!user) throw new ErrorResponse("User no longer exists.", 404);
  if (user.isBlocked) {
    throw new ErrorResponse("Your account has been suspended. Please contact support.", 403);
  }
  if (!user.twoFactor?.enabled) {
    throw new ErrorResponse("Two-factor authentication is not enabled for this account.", 400);
  }
  if (!verifyTwoFactorCode(user.twoFactor.secret, code)) {
    throw new ErrorResponse("Invalid code. Please try again.", 401);
  }

  return { token: generateToken(user) };
};
