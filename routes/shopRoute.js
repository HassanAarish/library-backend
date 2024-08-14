import express from "express";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import {
  createOrder,
  getAllbooks,
  getByCategory,
  getBookById,
  searchBook,
} from "../controller/ShopController.js";

const router = express.Router();

router.post("/create-order", verifyUserToken, createOrder);
router.get("/books", verifyUserToken, getAllbooks);
router.get("/books/genre/:category", verifyUserToken, getByCategory);
router.get("/books/:id", verifyUserToken, getBookById);
router.get("/search", verifyUserToken, searchBook);

export default router;
