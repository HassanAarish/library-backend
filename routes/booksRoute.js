import express from "express";
import {
  getAllbooks,
  getByCategory,
  getById,
  searchBook,
} from "../controller/BooksController.js";

const router = express.Router();

router.get("/all", getAllbooks);

router.get("/search", searchBook);

router.get("/genre/:category", getByCategory);

router.get("/:id", getById);

export default router;
