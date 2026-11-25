import express from "express";
import { inTransaction } from "../middlewares/transaction.js";
import verifyToken from "../middlewares/verifyToken.js";
import validate from "../middlewares/validate.js";
import { createReview } from "../validators/Rental.Validator.js";
import * as reviewController from "../controller/Review.Controller.js";

const router = express.Router();

// Body: { rating: 1-5, comment? }
router.post(
  "/:bookId",
  verifyToken,
  validate(createReview),
  inTransaction,
  reviewController.createReview,
);

export default router;
