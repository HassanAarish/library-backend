import express from "express";
import { inTransaction } from "../middlewares/transaction.js";
import verifyToken from "../middlewares/verifyToken.js";
import * as categoryController from "../controller/Category.Controller.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.post("/", verifyToken, inTransaction, categoryController.createCategory);

router.get("/", verifyToken, categoryController.getCategories);

router.patch(
  "/:categoryId",
  verifyToken,
  verifyRole("admin"),
  inTransaction,
  categoryController.updateCategory,
);

router.delete(
  "/:categoryId",
  verifyToken,
  verifyRole("admin"),
  inTransaction,
  categoryController.deleteCategory,
);

export default router;
