import express from "express";
// import * as orderController from "../controller/Order.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";

const router = express.Router();

// router.post(
//   "/create",
//   verifyToken,
//   verifyRole("user", "admin"),
//   orderController.createOrder
// );

// router.post(
//   "/create-payment-intent",
//   verifyToken,
//   verifyRole("user", "admin"),
//   orderController.createPaymentIntent
// );

export default router;
