import asyncHandler from "../middlewares/asyncHandler.js";
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

/*
 * 2FA (TOTP) controllers — disabled. The routes in User.Routes.js are commented
 * out and this code depends on packages that are not installed (`otpauth` for
 * `OTPAuth`, `qr-image` for `qr`). To re-enable: install those packages, import
 * them here, and uncomment both this block and the matching routes.
 *
 * export const enableTwoFactorAuth = asyncHandler(async (req, res, next) => { ... });
 * export const disableTwoFactorAuth = asyncHandler(async (req, res, next) => { ... });
 */
