import express from "express";
// import verifyUserToken from "../middlewares/verifyUserToken.js";
import * as shopController from "../controller/Shop.Controller.js";

const router = express.Router();

// router.post("/create-order", verifyUserToken, shopController.createOrder);
// router.get("/books", verifyUserToken, shopController.getAllbooks);
// router.get(
//   "/books/genre/:category",
//   verifyUserToken,
//   shopController.getByCategory
// );
// router.get("/books/:id", verifyUserToken, shopController.getBookById);
// router.get("/search", verifyUserToken, shopController.searchBook);

export default router;
