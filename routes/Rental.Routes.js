import { inTransaction } from "../middlewares/transaction.js";
import express from "express";
import * as rentalController from "../controller/Rental.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

router.post(
  "/",
  verifyToken,
  inTransaction,
  rentalController.createRentalBooking
);

export default router;
