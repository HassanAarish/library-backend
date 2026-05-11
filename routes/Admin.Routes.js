import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
// import * as adminController from "../controller/Admin.Controller.js";

const router = express.Router();

// router.post(
//   "/add-new-book",
//   verifyToken,
//   verifyRole("admin"),
//   adminController.addBook
// );

// router.get(
//   "/all-users",
//   verifyToken,
//   verifyRole("admin"),
//   adminController.getAllUserProfiles
// );

// router.put(
//   "/:bookId",
//   verifyToken,
//   verifyRole("admin"),
//   adminController.updateBook
// );

// router.delete(
//   "/:bookId",
//   verifyToken,
//   verifyRole("admin"),
//   adminController.deleteBook
// );

export default router;
