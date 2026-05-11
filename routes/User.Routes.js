import express from "express";
import * as userController from "../controller/User.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.get("/profile", verifyToken, userController.getUserProfile);

router.put("/profile-update", verifyToken, userController.updateProfile);

router.patch("/password-update", verifyToken, userController.updatePassword);

router.patch(
  "/profile-picture",
  verifyToken,
  userController.addOrUpdateProfilePicture
);

router.delete(
  "/remove-profile-picture",
  verifyToken,
  userController.removeProfilePicture
);

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
