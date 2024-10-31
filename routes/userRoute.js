import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import {
  addOrUpdateProfilePicture,
  getUserProfile,
  removeProfilePicture,
  updatePassword,
  updateProfile,
} from "../controller/UserController.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.put(
  "/update-password",
  verifyToken,
  verifyRole("user", "admin"),
  updatePassword
);

router.get(
  "/profile",
  verifyToken,
  verifyRole("user", "admin"),
  getUserProfile
);

router.put(
  "/profile-update",
  verifyToken,
  verifyRole("user", "admin"),
  updateProfile
);

router.put(
  "/profile-picture",
  verifyToken,
  verifyRole("user", "admin"),
  addOrUpdateProfilePicture
);

router.delete(
  "/remove-profile-picture",
  verifyToken,
  verifyRole("user", "admin"),
  removeProfilePicture
);

export default router;
