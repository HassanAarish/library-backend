import express from "express";
import {
  adminRegister,
  forgotPassword,
  login,
  register,
  removeTwoFactor,
  resetPassword,
  verifyOtp,
  verifyOtpAndRemoveTwoFactor,
  verifyTwoFactorAuth,
} from "../controller/AuthController.js";

const router = express.Router();

router.post("/register", register);

router.post("/verify-otp", verifyOtp);

router.post("/login", login);

router.post("/verify-login", verifyTwoFactorAuth);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password/:token", resetPassword);

router.post("/admin-register", adminRegister);

router.post("/remove-2Fa/:userId", removeTwoFactor);

router.post("/verify-2Fa-removal/:userId", verifyOtpAndRemoveTwoFactor);

export default router;
