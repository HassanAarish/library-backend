import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { getEnv } from "../config/dotenv.js";

const ISSUER = getEnv("TWO_FA_ISSUER") || "LibraryHub";

const buildTotp = (label, secret) =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

/**
 * Create a fresh TOTP secret for a user and the QR code (data URL) they scan
 * into an authenticator app. The raw base32 secret is stored server-side; the
 * QR/otpauth URL is the only thing the client ever sees.
 */
export const generateTwoFactorSecret = async (email) => {
  const secret = new OTPAuth.Secret({ size: 20 });
  const otpauthUrl = buildTotp(email, secret).toString();
  const qrCode = await QRCode.toDataURL(otpauthUrl);
  return { secret: secret.base32, otpauthUrl, qrCode };
};

/**
 * Validate a 6-digit code against a stored base32 secret.
 * window: 1 tolerates ±1 time-step (30s) of clock drift.
 */
export const verifyTwoFactorCode = (base32Secret, code) => {
  if (!base32Secret || !code) return false;
  const totp = buildTotp(undefined, OTPAuth.Secret.fromBase32(base32Secret));
  return totp.validate({ token: String(code).trim(), window: 1 }) !== null;
};
