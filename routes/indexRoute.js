import express from "express";
import authRoute from "./authRoute.js";
import userRoute from "./userRoute.js";
import bookRoute from "./booksRoute.js";
import adminRoute from "./adminRoute.js";
import orderRoute from "./orderRoute.js";
import chatRoute from "./chatRoute.js";

const router = express.Router();

router.use("/auth", authRoute);

router.use("/user", userRoute);

router.use("/book", bookRoute);

router.use("/order", orderRoute);

router.use("/admin", adminRoute);

router.use("/chat", chatRoute);

export default router;
