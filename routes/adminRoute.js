import express, { Router } from "express";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import {
  addBook,
  deleteAll,
  deleteBook,
  getAllUserProfiles,
  updateBook,
} from "../controller/adminController.js";
import { adminUser } from "../controller/UserController.js";

const route = express.Router();

route.post("/add-new-book", verifyUserToken, addBook);
route.get("/all-users", verifyUserToken, getAllUserProfiles);
route.post("/delete-all", deleteAll);
route.post("/admin-signup", verifyUserToken, adminUser);
route.put("/:id", verifyUserToken, updateBook);
route.delete("/:id", verifyUserToken, deleteBook);

export default route;
