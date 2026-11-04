import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import { inTransaction } from "../middlewares/transaction.js";
import * as rentalController from "../controller/Rental.Controller.js";

const router = express.Router();

// Public: is the book free, when is it next free, how many people are ahead.
// Logged-in users also see their own booking and place in line.
router.get("/availability/:bookId", optionalAuth, rentalController.getAvailability);

// Admin
router.get("/admin", verifyToken, verifyRole("admin"), rentalController.getAdminRentals);

// Body: { bookId, startDate?, paymentMethod: "single" | "credit", method? }
router.post("/", verifyToken, inTransaction, rentalController.createRental);

router.get("/mine", verifyToken, rentalController.getMyRentals);

router.get("/:rentalId", verifyToken, rentalController.getMyRental);

router.post("/:rentalId/cancel", verifyToken, inTransaction, rentalController.cancelRental);

router.post("/:rentalId/extend", verifyToken, inTransaction, rentalController.extendRental);

router.post("/:rentalId/return", verifyToken, inTransaction, rentalController.returnRental);

router.post("/:rentalId/start-now", verifyToken, inTransaction, rentalController.startRentalNow);

export default router;
