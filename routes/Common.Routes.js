import express from "express";
import * as commonController from "../controller/Common.Controller.js";
import { inTransaction } from "../middlewares/transaction.js";
import multer from "multer";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post(
  "/upload",
  upload.array("files"),
  inTransaction,
  commonController.upload
);

export default router;
