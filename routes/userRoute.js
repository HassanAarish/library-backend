import express from "express";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import {
  addProfilePicture,
  forgotPassword,
  getUserOrders,
  getUserProfile,
  resetPassword,
  updatePassword,
  updateProfilePicture,
  updateUserProfile,
} from "../controller/UserController.js";

const router = express.Router();

router.get("/orders", verifyUserToken, getUserOrders);
router.get("/profile", verifyUserToken, getUserProfile);
router.put("/update-profile", verifyUserToken, updateUserProfile);
router.post("/forgot-password", verifyUserToken, forgotPassword);
router.post("/reset-password", verifyUserToken, resetPassword);
router.put("/update-password", verifyUserToken, updatePassword);
router.post("/add-avatar", verifyUserToken, addProfilePicture);
router.put("/update-avatar", verifyUserToken, updateProfilePicture);

export default router;
