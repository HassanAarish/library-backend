import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import * as twoFactorController from "../controller/TwoFactor.Controller.js";

const router = express.Router();

// Authenticated account management (from the profile screen).
router.post("/setup", verifyToken, inTransaction, twoFactorController.setup);

router.post("/enable", verifyToken, authLimiter, inTransaction, twoFactorController.enable);

router.post("/disable", verifyToken, authLimiter, inTransaction, twoFactorController.disable);

// Login challenge — uses the short-lived pending token, not a full session.
router.post("/verify", authLimiter, twoFactorController.verify);

export default router;
