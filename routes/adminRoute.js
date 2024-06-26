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

const router = express.Router();

router.post("/add-new-book", verifyUserToken, addBook);
router.get("/all-users", verifyUserToken, getAllUserProfiles);
router.post("/delete-all", verifyUserToken, deleteAll);
router.post("/admin-signup", verifyUserToken, adminUser);
router.put("/:id", verifyUserToken, updateBook);
router.delete("/:id", verifyUserToken, deleteBook);

export default router;
