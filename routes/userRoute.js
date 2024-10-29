import express from "express";

import { login, createUser } from "../controller/UserController.js";
import { createOrder, getUserOrders } from "../controller/OrderController.js";

const router = express.Router();

router.get("/user-order", getUserOrders);
router.post("/new-order", createOrder);
router.post("/signup", createUser);
router.post("/login", login);

export default router;
