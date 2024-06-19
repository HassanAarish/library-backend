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
} from "../controller/UserController.js";
import { createOrder, getUserOrders } from "../controller/orderController.js";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import verifyUserRole from "../middlewares/verifyUserRole.js";

const route = express.Router();

route.get("/all", getAllbooks);
route.get("/genre/:category", getByCategory);
route.post("/add-new-book", verifyUserToken, addBook);
route.put("/:id", verifyUserToken, updateBook);
route.delete("/:id", verifyUserToken, deleteBook);
route.post("/new-order", createOrder);
route.post("/delete-all", deleteAll);
route.post("/signup", createUser);
route.post("/login", login);
route.get("/user-order", getUserOrders);
route.post("/admin-signup", verifyUserToken, adminUser);
route.get("/user-profile", verifyUserToken, getAllUserProfiles);

export default route;
