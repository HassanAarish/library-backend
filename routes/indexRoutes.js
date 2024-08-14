import express from "express";
import adminRoute from "./adminRoute.js";
import userRoute from "./userRoute.js";
import authRoute from "./authRoute.js";
import shopRoute from "./shopRoute.js";

const router = express.Router();

router.use("/user", userRoute);
router.use("/admin", adminRoute);
router.use("/auth", authRoute);
router.use("/shop", shopRoute);

export default router;
