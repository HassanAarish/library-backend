import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import * as adminController from "../controller/Admin.Controller.js";
import { inTransaction } from "../middlewares/transaction.js";

const router = express.Router();

router.get("/users", verifyToken, verifyRole("admin"), adminController.getUserLists);

router.get("/user/:userId", verifyToken, verifyRole("admin"), adminController.getUserData);

// Activity logs (read-only — there is deliberately no endpoint to edit or delete them).
router.get("/audit-logs", verifyToken, verifyRole("admin"), adminController.getAuditLogs);

router.get("/request-logs", verifyToken, verifyRole("admin"), adminController.getRequestLogs);

router.patch(
  "/toggle-user-block/:userId",
  verifyToken,
  verifyRole("admin"),
  inTransaction,
  adminController.toggleUserBlock,
);

export default router;
