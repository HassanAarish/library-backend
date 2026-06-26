import express from "express";
import { inTransaction } from "../middlewares/transaction.js";
import verifyToken from "../middlewares/verifyToken.js";
import * as reviewController from "../controller/Review.Controller.js";

const router = express.Router();

router.post("/", verifyToken, inTransaction, reviewController.createReview);

export default router;
