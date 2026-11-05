import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import { inTransaction } from "../middlewares/transaction.js";
import { imageUpload } from "../middlewares/upload.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/Payment.Validator.js";
import * as paymentController from "../controller/Payment.Controller.js";

const router = express.Router();

const admin = [verifyToken, verifyRole("admin")];

router.get("/methods", paymentController.getMethods);

// --- Admin (declared before "/:paymentId")

router.get("/admin", ...admin, paymentController.getAdminPayments);

router.patch(
  "/admin/:paymentId/approve",
  ...admin,
  inTransaction,
  paymentController.approvePayment,
);

router.patch(
  "/admin/:paymentId/reject",
  ...admin,
  validate(schemas.rejectPayment),
  inTransaction,
  paymentController.rejectPayment,
);

router.patch(
  "/admin/:paymentId/refund",
  ...admin,
  validate(schemas.resolveRefund),
  inTransaction,
  paymentController.resolveRefund,
);

// --- User

// Multipart field "file": the Easypaisa receipt screenshot (stored privately).
router.post(
  "/proof-upload",
  verifyToken,
  imageUpload.single("file"),
  paymentController.uploadProof,
);

router.get("/mine", verifyToken, paymentController.getMyPayments);

router.get("/:paymentId", verifyToken, paymentController.getMyPayment);

// Body: { transactionId, senderNumber, senderName?, screenshot: { public_id } }
// authLimiter: guessing transaction ids is brute-forcing.
router.post(
  "/:paymentId/proof",
  verifyToken,
  authLimiter,
  validate(schemas.submitProof),
  inTransaction,
  paymentController.submitProof,
);

export default router;
