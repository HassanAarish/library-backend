import express from "express";
import authRoute from "./authRoute.js";
import userRoute from "./userRoute.js";
import bookRoutes from "./booksRoute.js";
import adminRoute from "./adminRoute.js";

const router = express.Router();

router.use("/auth", authRoute);

router.use("/user", userRoute);

router.use("/book", bookRoutes);

router.use("/admin", adminRoute);

export default router;
