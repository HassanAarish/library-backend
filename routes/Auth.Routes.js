import express from "express";
import * as authController from "../controller/Auth.Controller.js";
import { inTransaction } from "../middlewares/transaction.js";

const router = express.Router();

router.post("/register", inTransaction, authController.register);

router.post("/verify-otp", inTransaction, authController.verifyOtp);

router.post("/login", inTransaction, authController.login);

// router.post("/verify-login", inTransaction, authController.verifyTwoFactorAuth);

router.post("/forgot-password", inTransaction, authController.forgotPassword);

router.post("/reset-password", inTransaction, authController.resetPassword);

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
