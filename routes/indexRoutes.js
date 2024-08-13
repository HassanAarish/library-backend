import express from "express";
import adminRoute from "./adminRoute.js";
import userRoute from "./userRoute.js";

const router = express.Router();

router.use("/user", userRoute);
router.use("/admin", adminRoute);

export default router;
