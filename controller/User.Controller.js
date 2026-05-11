import User from "../models/User.Model.js";
import bcrypt from "bcryptjs";
import cloudinary from "cloudinary";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import * as userService from "../services/User.Service.js";
import helper from "../utils/helper.js";

// get User's profile
export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await userService.getUserProfile(req.userID);
  return res.status(201).json({
    success: true,
    message: "User fetched successfully.",
    data: user,
  });
});

// Update user's profile.
export const updateProfile = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const userId = req.userID;

  const body = { userId, ...req.body };

  await userService.updateProfile(body, session);

  return res.status(201).json({
    success: true,
    message: "Profile updated successfully.",
  });
});

// Update password
export const updatePassword = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const userId = req.userID;

  // Validation
  helper.checkMandatoryFields(req.body, ["currentPassword", "newPassword"]);

  await userService.updatePassword(userId, req.body, session);

  return res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});

// Add profile Picture
export const addOrUpdateProfilePicture = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const userId = req.userID;

  helper.checkMandatoryFields(req.body, ["profilePicture"]);

  const body = { userId, ...req.body };

  await userService.addOrUpdateProfilePicture(body, session);

  return res.status(200).json({
    success: true,
    message: "Profile picture updated successfully.",
  });
});

// Remove profile Picture
export const removeProfilePicture = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const userId = req.userID;

  await userService.removeProfilePicture(userId, session);

  return res.status(200).json({
    success: true,
    message: "Profile picture removed successfully.",
  });
});

// Controller to enable 2FA and generate a QR code

const generateBase32Secret = () => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  try {
    for (let i = 0; i < 32; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      secret += charset[randomIndex];
    }
  } catch (error) {
    return error;
  }
  return secret;
};

export const enableTwoFactorAuth = asyncHandler(async (req, res, next) => {
  const userId = req.userID;

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Generate a Base32 secret
    const base32_secret = generateBase32Secret();

    // Create TOTP instance
    const totp = new OTPAuth.TOTP({
      issuer: "EFTS",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(base32_secret),
    });

    const otpauth_url = totp.toString();

    // Generate QR code as base64
    const qr_svg = qr.imageSync(otpauth_url, { type: "png" });
    const qrCodeBase64 = `data:image/png;base64,${qr_svg.toString("base64")}`;

    user.twoFactorSecret = base32_secret;
    user.twoFactorAuthentication = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "QR code generated and 2FA enabled. Scan the QR code with your app.",
      qrCodeUrl: qrCodeBase64,
    });
  } catch (error) {
    return next(error);
  }
});

// Controller to disable 2FA from the account

export const disableTwoFactorAuth = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  const { otp } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (!user.twoFactorAuthentication || !user.twoFactorSecret) {
      return next(
        new ErrorResponse("2FA is not enabled for this account", 400)
      );
    }

    // Create TOTP instance with the user's secret for validation
    const totp = new OTPAuth.TOTP({
      issuer: "EFTS",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    });

    // Adjust the window to account for time drift
    const validOTP = totp.validate({ token: otp, window: 0 });

    if (validOTP === null) {
      return next(new ErrorResponse("Invalid 2FA code", 401));
    }

    // Clear the secret and disable 2FA
    user.twoFactorSecret = undefined;
    user.twoFactorAuthentication = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Two-factor authentication has been turned off. Please remove the old entry from your authenticator app. If you turn 2FA back on, you’ll scan a new QR code.`,
    });
  } catch (error) {
    return next(error);
  }
});
