import express from "express";
import * as authController from "../controller/Auth.Controller.js";
import { inTransaction } from "../middlewares/transaction.js";
import { authLimiter, emailLimiter } from "../middlewares/rateLimiter.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/Auth.Validator.js";

const router = express.Router();

// emailLimiter (5 / 15min): endpoints that send mail — guards against inbox flooding.
router.post(
  "/register",
  emailLimiter,
  validate(schemas.register),
  inTransaction,
  authController.register,
);

// authLimiter (10 / 15min): credential/token checks — brute-force protection.
router.post(
  "/verify-otp",
  authLimiter,
  validate(schemas.verifyOtp),
  inTransaction,
  authController.verifyOtp,
);

router.post(
  "/resend-otp",
  emailLimiter,
  validate(schemas.emailOnly),
  inTransaction,
  authController.resendOtp,
);

router.post("/login", authLimiter, validate(schemas.login), inTransaction, authController.login);

router.post(
  "/forgot-password",
  emailLimiter,
  validate(schemas.emailOnly),
  inTransaction,
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  authLimiter,
  validate(schemas.resetPassword),
  inTransaction,
  authController.resetPassword,
);

// Unified social sign-in (google | facebook). Body: { provider, token, name?, link? }
router.post(
  "/social",
  authLimiter,
  validate(schemas.social),
  inTransaction,
  authController.socialLogin,
);

export default router;
