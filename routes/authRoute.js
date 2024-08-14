import express from "express";
import {
  userLogin,
  userRegister,
  userVerifyOtp,
  adminLogin,
  adminRegister,
  adminVerifyOtp,
} from "../controller/AuthController.js";

const router = express.Router();

// All Auth Routes for User
router.post("/register", userRegister);
router.post("/verify-otp", userVerifyOtp);
router.post("/login", userLogin);

// All Auth Routes for Admin
router.post("/register", adminRegister);
router.post("/verify-otp", adminVerifyOtp);
router.post("/login", adminLogin);

export default router;
