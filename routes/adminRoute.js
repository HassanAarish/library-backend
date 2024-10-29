import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import {
  addBook,
  deleteBook,
  getAllUserProfiles,
  updateBook,
} from "../controller/adminController.js";

const router = express.Router();

router.post("/add-new-book", verifyToken, verifyRole, addBook);

router.get("/all-users", verifyToken, verifyRole, getAllUserProfiles);

router.put("/:bookId", verifyToken, verifyRole, updateBook);

router.delete("/:bookId", verifyToken, verifyRole, deleteBook);

export default router;
