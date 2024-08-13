import express from "express";
import {
  getAllbooks,
  getByCategory,
  getById,
  searchBook,
} from "../controller/BooksController.js";
import { login, createUser } from "../controller/UserController.js";
import { createOrder, getUserOrders } from "../controller/OrderController.js";

const router = express.Router();

router.get("/all", getAllbooks);
router.get("/search", searchBook);
router.get("/genre/:category", getByCategory);
router.get("/user-order", getUserOrders);
router.post("/new-order", createOrder);
router.post("/signup", createUser);
router.post("/login", login);
router.get("/:id", getById);
export default router;
