import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import { inTransaction } from "../middlewares/transaction.js";
import * as packageController from "../controller/Package.Controller.js";

const router = express.Router();

const admin = [verifyToken, verifyRole("admin")];

// Public: what packages are on sale.
router.get("/plans", packageController.getPlans);

// --- Admin

router.get("/admin/plans", ...admin, packageController.getAllPlans);

router.post("/admin/plans", ...admin, inTransaction, packageController.createPlan);

router.patch("/admin/plans/:planId", ...admin, inTransaction, packageController.updatePlan);

router.get("/admin/purchases", ...admin, packageController.getAdminPackages);

// --- User

// Body: { planId, method? }
router.post("/purchase", verifyToken, inTransaction, packageController.purchase);

router.get("/mine", verifyToken, packageController.getMyPackages);

router.post("/:userPackageId/cancel", verifyToken, inTransaction, packageController.cancelPurchase);

export default router;
