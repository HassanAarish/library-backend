import express from "express";
import {
  createOrder,
  createPaymentIntent,
} from "../controller/OrderController.js";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

router.post("/create", verifyToken, verifyRole("user", "admin"), createOrder);

router.post(
  "/create-payment-intent",
  verifyToken,
  verifyRole("user", "admin"),
  createPaymentIntent
);

export default router;
