import express from "express";
import * as userController from "../controller/User.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.get("/profile", verifyToken, userController.getUserProfile);

// router.put(
//   "/update-password",
//   verifyToken,
//   verifyRole("user", "admin"),
//   updatePassword
// );

// router.put(
//   "/profile-update",
//   verifyToken,
//   verifyRole("user", "admin"),
//   updateProfile
// );

// router.put(
//   "/profile-picture",
//   verifyToken,
//   verifyRole("user", "admin"),
//   addOrUpdateProfilePicture
// );

// router.delete(
//   "/remove-profile-picture",
//   verifyToken,
//   verifyRole("user", "admin"),
//   removeProfilePicture
// );

// router.post(
//   "/enable-2fa",
//   verifyToken,
//   verifyRole("user", "admin"),
//   enableTwoFactorAuth
// );

// router.post(
//   "/disable-2fa",
//   verifyToken,
//   verifyRole("user", "admin"),
//   disableTwoFactorAuth
// );

export default router;
