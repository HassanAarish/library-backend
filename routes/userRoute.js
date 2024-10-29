import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import {
  addOrUpdateProfilePicture,
  getUserProfile,
  removeProfilePicture,
  updatePassword,
  updateUserProfile,
} from "../controller/UserController.js";

const router = express.Router();

router.put("/update-password", verifyToken, updatePassword);

router.get("/profile", verifyToken, getUserProfile);

router.put("/profile-update", verifyToken, updateUserProfile);

router.put("/profile-picture", verifyToken, addOrUpdateProfilePicture);

router.delete("/remove-profile-picture", verifyToken, removeProfilePicture);

export default router;
