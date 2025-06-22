import User from "../models/User.Model.js";
import bcrypt from "bcryptjs";
import cloudinary from "cloudinary";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";

// get User's profile
export const getUserProfile = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.userID).select("-password");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    return res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
});

// Update user's profile.
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, phoneNumber, dob, gender } = req.body;
  const userId = req.userID;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    user.name = name || user.name;
    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.dob = dob || user.dob;
    user.gender = gender || user.gender;

    await user.save();

    return res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
});

// Update password
export const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.userID).select("+password");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return next(new ErrorResponse("Invalid password", 401));
    }

    const isOldPassword = await bcrypt.compare(newPassword, user.password);

    if (isOldPassword) {
      return next(
        new ErrorResponse(
          "New password cannot be the same as the old password.",
          400
        )
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    return res.status(201).json({
      success: true,
      data: "Password updated successfully",
    });
  } catch (error) {
    return next(error);
  }
});

// Add profile Picture
export const addOrUpdateProfilePicture = asyncHandler(
  async (req, res, next) => {
    const { profilePicture } = req.body;
    // Find the user by ID
    const user = await User.findById(req.userID);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    try {
      // If a previous profile picture exists, delete it (update case)
      if (user.profilePicture && user.profilePicture.public_id) {
        await cloudinary.v2.uploader.destroy(user.profilePicture.public_id);
      }

      // Upload the new profile picture to Cloudinary
      const uploadImage = await cloudinary.v2.uploader.upload(profilePicture, {
        folder: "Library/profile-pictures",
      });

      // Initialize profilePicture object if it doesn't exist
      if (!user.profilePicture) {
        user.profilePicture = {};
      }

      // Update the profilePicture with new image data
      user.profilePicture.url = uploadImage.secure_url;
      user.profilePicture.public_id = uploadImage.public_id;

      // Save the updated user document
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Image uploaded/updated successfully",
        data: user.profilePicture,
      });
    } catch (error) {
      console.error(error);
      return next(new ErrorResponse("Image upload/update failed", 500));
    }
  }
);

// Remove profile Picture
export const removeProfilePicture = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.userID);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (!user.profilePicture || !user.profilePicture.public_id) {
      return next(
        new ErrorResponse(
          "No profile picture found to remove or have already been removed",
          400
        )
      );
    }

    await cloudinary.v2.uploader.destroy(user.profilePicture.public_id);

    user.profilePicture = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile picture removed successfully",
    });
  } catch (error) {
    console.error("Error removing profile picture from Cloudinary:", error);
    return next(new ErrorResponse("Profile picture removal failed", 500));
  }
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
