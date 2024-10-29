import express, { Router } from "express";
import {
  addBook,
  deleteAll,
  deleteBook,
  getAllUserProfiles,
  updateBook,
} from "../controller/adminController.js";
import { adminUser } from "../controller/UserController.js";

const router = express.Router();

router.post("/add-new-book", addBook);
router.get("/all-users", getAllUserProfiles);
router.post("/delete-all", deleteAll);
router.post("/admin-signup", adminUser);
router.put("/:id", updateBook);
router.delete("/:id", deleteBook);

export default router;
