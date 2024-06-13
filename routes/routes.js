import express, { Router } from "express";
import {
  getAllbooks,
  getByCategory,
  addBook,
  updateBook,
  deleteBook,
  deleteAll,
} from "../controller/BooksController.js";

import { login, createUser } from "../controller/UserController.js";
import { createOrder, getUserOrders } from "../controller/OrderController.js";

const route = express.Router();

route.get("/all", getAllbooks);
// route.get("/:title", getBook);
route.get("/category", getByCategory);
route.post("/add-new-book", addBook);
route.put("/:id", updateBook);
route.delete("/:id", deleteBook);
route.post("/new-order", createOrder);
route.post("/delete-all", deleteAll);
route.post("/signup", createUser);
route.post("/login", login);
route.get("/user-order", getUserOrders);

export default route;
