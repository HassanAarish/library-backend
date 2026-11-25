import asyncHandler from "../middlewares/asyncHandler.js";
import * as twoFactorService from "../services/TwoFactor.Service.js";

export const setup = asyncHandler(async (req, res) => {
  const data = await twoFactorService.setup(req.userID, req.userEmail, req.transaction);
  return res.status(200).json({ success: true, data }); // { qrCode, otpauthUrl }
});

export const enable = asyncHandler(async (req, res) => {
  await twoFactorService.enable(req.userID, req.body.code, req.transaction);
  return res.status(200).json({
    success: true,
    message: "Two-factor authentication enabled.",
  });
});

export const disable = asyncHandler(async (req, res) => {
  await twoFactorService.disable(req.userID, req.body.code, req.transaction);
  return res.status(200).json({
    success: true,
    message: "Two-factor authentication disabled.",
  });
});

// Login challenge — exchanges a pending token + code for a real access token.
export const verify = asyncHandler(async (req, res) => {
  const { token, deletionCancelled } = await twoFactorService.verifyLogin(req.body);
  return res.status(200).json({
    success: true,
    message: deletionCancelled
      ? "Welcome back! Your account will not be deleted."
      : "Logged in successfully",
    token,
    ...(deletionCancelled && { deletionCancelled: true }),
  });
});
