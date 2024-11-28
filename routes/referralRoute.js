import express from "express";
import {
  generateReferral,
  redirectToReferral,
  getReferral,
} from "../controller/ReferralController.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

router.get("/redirect-referral", redirectToReferral);

router.get("/get-referral", verifyToken, getReferral);

router.post("/generate-referral", verifyToken, generateReferral);

export default router;
