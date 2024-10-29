import express from "express";
import {
  adminRegister,
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyOtp,
} from "../controller/AuthController.js";

const router = express.Router();

router.post("/register", register);

router.post("/verify-otp", verifyOtp);

router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password/:token", resetPassword);

router.post("/instructor-register", adminRegister);

export default router;
