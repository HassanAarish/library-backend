import express from "express";
import {
  createProduct,
  createSubscription,
  editProductPrice,
  getAllProducts,
  getCanceledSubscriptions,
  initiateSubscription,
  userSubscription,
} from "../controller/SubscriptionController.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

router.post("/initiate-subscription", verifyToken, initiateSubscription);

router.post("/create-subscription", verifyToken, createSubscription);

router.get("/my-subscription", verifyToken, userSubscription);

router.get("/canceled-subs", verifyToken, getCanceledSubscriptions);

router.post("/create-product", verifyToken, createProduct);

router.get("/all-products", verifyToken, getAllProducts);

router.patch("/edit-products", verifyToken, editProductPrice);

export default router;
