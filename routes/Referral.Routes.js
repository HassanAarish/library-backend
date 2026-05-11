import express from "express";
// import * as referralController from "../controller/Referral.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

// router.get("/redirect-referral", referralController.redirectToReferral);

// router.get("/get-referral", verifyToken, referralController.getReferral);

// router.post(
//   "/generate-referral",
//   verifyToken,
//   referralController.generateReferral
// );

export default router;
