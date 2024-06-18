import express, { Router } from "express";
import { getAllbooks, getByCategory } from "../controller/booksController.js";
import {
  addBook,
  deleteAll,
  deleteBook,
  updateBook,
} from "../controller/adminController.js";
import {
  login,
  createUser,
  adminUser,
  getAllUserProfiles,
  loggedInUser,
} from "../controller/userController.js";
import { createOrder, getUserOrders } from "../controller/orderController.js";
import verifyUserToken from "../middlewares/verifyUserToken.js";

const route = express.Router();

route.get("/all", getAllbooks);
route.get("/:category", getByCategory);
route.post("/add-new-book", addBook);
route.put("/:id", updateBook);
route.delete("/:id", deleteBook);
route.post("/new-order", createOrder);
route.post("/delete-all", deleteAll);
route.post("/signup", createUser);
route.post("/login", login);
route.get("/user-order", getUserOrders);
route.post("/admin-signup", verifyUserToken, adminUser);
route.get("/user-profile/:id", verifyUserToken, getAllUserProfiles);
route.get("/logged-in", verifyUserToken, loggedInUser)

export default route;
