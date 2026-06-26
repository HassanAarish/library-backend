import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { inTransaction } from "../middlewares/transaction.js";
import * as bookController from "../controller/Book.Controller.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.post("/", verifyToken, inTransaction, bookController.createBookRequest);

router.get("/my-books", verifyToken, bookController.getMyBooks);

router.get("/", verifyToken, bookController.getAllBooks);

router.patch(
  "/:bookId/status",
  verifyToken,
  verifyRole("admin"),
  inTransaction,
  bookController.reviewBook,
);

export default router;
