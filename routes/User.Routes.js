import express from "express";
import * as userController from "../controller/User.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";

const router = express.Router();

router.get("/profile", verifyToken, userController.getUserProfile);

router.put("/profile-update", verifyToken, inTransaction, userController.updateProfile);

router.patch("/password-update", verifyToken, inTransaction, userController.updatePassword);

router.patch(
  "/profile-picture",
  verifyToken,
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
