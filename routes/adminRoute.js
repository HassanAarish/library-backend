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

router.post("/add-new-book", verifyToken, verifyRole("admin"), addBook);

router.get("/all-users", verifyToken, verifyRole("admin"), getAllUserProfiles);

router.put("/:bookId", verifyToken, verifyRole("admin"), updateBook);

router.delete("/:bookId", verifyToken, verifyRole("admin"), deleteBook);

export default router;
