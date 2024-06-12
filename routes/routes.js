import express, { Router } from "express";
import {
  getAllbooks,
  getBook,
  getByCategory,
  addBook,
  updateBook,
  deleteBook,
  createUser,
  login,
} from "../controller/controller.js";

const route = express.Router();

route.get("/", getAllbooks);
route.get("/:title", getBook);
route.get("/:category", getByCategory);
route.post("/add-new-book", addBook);
route.put("/:id", updateBook);
route.delete("/:id", deleteBook);
route.post("/add-user", createUser);
route.post("/login", login);

export default route;
