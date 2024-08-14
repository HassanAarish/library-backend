import express from "express";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import verifyUserRole from "../middlewares/verifyUserRole.js";
import {
  addBook,
  deleteAll,
  deleteBook,
  forgotPassword,
  getAllUserProfiles,
  resetPassword,
  updateBook,
} from "../controller/adminController.js";

const router = express.Router();

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/add-new-book", verifyUserToken, verifyUserRole("admin"), addBook);
router.get(
  "/all-users",
  verifyUserToken,
  verifyUserRole("admin"),
  getAllUserProfiles
);
router.post("/delete-all", verifyUserToken, verifyUserRole("admin"), deleteAll);
router.put("/:id", verifyUserToken, verifyUserRole("admin"), updateBook);
router.delete("/:id", verifyUserToken, verifyUserRole("admin"), deleteBook);

export default router;
