import express from "express";
import * as userController from "../controller/User.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/User.Validator.js";

const router = express.Router();

router.get("/profile", verifyToken, userController.getUserProfile);

// Body: { name?, prefData?: { alternativeEmail, phoneNumber, bio, dob, gender, notifications, addresses } }
router.put(
  "/profile-update",
  verifyToken,
  validate(schemas.updateProfile),
  inTransaction,
  userController.updateProfile,
);

router.patch(
  "/password-update",
  verifyToken,
  validate(schemas.updatePassword),
  inTransaction,
  userController.updatePassword,
);

router.patch(
  "/profile-picture",
  verifyToken,
  validate(schemas.profilePicture),
  inTransaction,
  userController.addOrUpdateProfilePicture,
);

router.delete(
  "/remove-profile-picture",
  verifyToken,
  inTransaction,
  userController.removeProfilePicture,
);

export default router;
