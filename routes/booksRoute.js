import express from "express";
import {
  getAllbooks,
  getByCategory,
  getBookById,
  searchBook,
} from "../controller/BooksController.js";

const router = express.Router();

router.get("/all", getAllbooks);

router.post("/search", searchBook);

router.get("/genre", getByCategory);

router.get("/:bookId", getBookById);

export default router;
