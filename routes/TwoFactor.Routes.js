import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/Auth.Validator.js";
import * as twoFactorController from "../controller/TwoFactor.Controller.js";

const router = express.Router();

// Authenticated account management (from the profile screen).
router.post("/setup", verifyToken, inTransaction, twoFactorController.setup);

router.post(
  "/enable",
  verifyToken,
  authLimiter,
  validate(schemas.twoFactorCode),
  inTransaction,
  twoFactorController.enable,
);

router.post(
  "/disable",
  verifyToken,
  authLimiter,
  validate(schemas.twoFactorCode),
  inTransaction,
  twoFactorController.disable,
);

// Login challenge — uses the short-lived pending token, not a full session.
router.post("/verify", authLimiter, validate(schemas.twoFactorLogin), twoFactorController.verify);

export default router;
