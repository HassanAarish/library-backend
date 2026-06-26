import express from "express";
import * as authController from "../controller/Auth.Controller.js";
import { inTransaction } from "../middlewares/transaction.js";
import { authLimiter, emailLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

// emailLimiter (5 / 15min): endpoints that send mail — guards against inbox flooding.
router.post("/register", emailLimiter, inTransaction, authController.register);

// authLimiter (10 / 15min): credential/token checks — brute-force protection.
router.post("/verify-otp", authLimiter, inTransaction, authController.verifyOtp);

router.post("/resend-otp", emailLimiter, inTransaction, authController.resendOtp);

router.post("/login", authLimiter, inTransaction, authController.login);

router.post("/forgot-password", emailLimiter, inTransaction, authController.forgotPassword);

router.post("/reset-password", authLimiter, inTransaction, authController.resetPassword);

// Unified social sign-in (google | apple | facebook). Body: { provider, token, name?, link? }
router.post("/social", authLimiter, inTransaction, authController.socialLogin);

// router.post("/verify-login", inTransaction, authController.verifyTwoFactorAuth);

// router.post("/admin-register", inTransaction, authController.adminRegister);

// router.post("/admin-register", inTransaction, authController.adminRegister);

// router.post(
//   "/remove-2Fa/:userId",
//   inTransaction,
//   authController.removeTwoFactor
// );

// router.post(
//   "/verify-2Fa-removal/:userId",
//   inTransaction,
//   authController.verifyOtpAndRemoveTwoFactor
// );

export default router;
