import express from "express";
// import { inTransaction } from "../middlewares/transaction.js";
// import * as rentalController from "../controller/Rental.Controller.js";
// import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

// Disabled: this endpoint trusted the client's `amountPaid` / `paymentIntentId`,
// so anyone could rent any book without paying. It is replaced in Phase 2 by
// the reservation + payment-verification flow.
// router.post("/", verifyToken, inTransaction, rentalController.createRentalBooking);

export default router;
