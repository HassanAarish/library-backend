import express from "express";
import * as userController from "../controller/User.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";
import validate from "../middlewares/validate.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
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

// --- Deleting your own account (services/AccountDeletion.Service.js)

// Wrong passwords count here, so guessing is slow.
const deletionLimiter = createLimiter({
  keyPrefix: "rl_account_deletion",
  points: 5,
  duration: 60 * 60,
  key: (req) => String(req.userID),
});

// What still stops deletion: { canDelete, blockers, credits, graceDays }
router.get("/deletion", verifyToken, userController.getDeletionStatus);

// Body: { confirm: true, password? (accounts with one), giveUpCredits? }
router.post(
  "/deletion",
  verifyToken,
  deletionLimiter,
  validate(schemas.requestDeletion),
  inTransaction,
  userController.requestDeletion,
);

export default router;
