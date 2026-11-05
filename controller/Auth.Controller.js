import asyncHandler from "../middlewares/asyncHandler.js";
import helper from "../utils/helper.js";
import * as authService from "../services/Auth.Service.js";

// Request bodies are validated by the zod schemas in validators/Auth.Validator.js.

// Registration

export const register = asyncHandler(async (req, res) => {
  await authService.register(req.body, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Registration successful. Verify your email to continue.",
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  await authService.verifyOtp(req.body, req.transaction);

  return res.status(201).json({
    success: true,
    message: "Email verified successfully. Please login to continue!",
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  await authService.resendOtp(req.body, req.transaction);

  // Generic response — never reveals whether the account exists or its state.
  return res.status(200).json({
    success: true,
    message: "If your account needs verification, a new code has been sent.",
  });
});

// Login (with or without 2FA)

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req.transaction);

  if (result.twoFactorRequired) {
    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      pendingToken: result.pendingToken,
      message: "Enter the code from your authenticator app.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    token: result.token,
  });
});

// Password reset

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body, req.transaction);

  return res.status(200).json({
    success: true,
    message: "If an account exists for that email, a password reset link has been sent.",
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  // The token comes from the emailed link (?token=…) or the body.
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const fields = { ...req.body, token: req.body.token ?? queryToken };

  helper.checkMandatoryFields(fields, ["token"]);

  await authService.resetPassword(fields, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Password reset successfully. Please login to continue.",
  });
});

// Unified social sign-in: google | facebook
export const socialLogin = asyncHandler(async (req, res) => {
  const result = await authService.socialLogin(req.body, req.transaction);

  // Same-email account exists and the user hasn't consented to linking yet —
  // tell the frontend to prompt (link, or sign in with the password instead).
  if (result.linkRequired) {
    return res.status(200).json({
      success: true,
      linkRequired: true,
      email: result.email,
      message:
        "An account with this email already exists. Link your social account to continue, or sign in with your password.",
    });
  }

  if (result.twoFactorRequired) {
    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      pendingToken: result.pendingToken,
      message: "Enter the code from your authenticator app.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    token: result.token,
  });
});
