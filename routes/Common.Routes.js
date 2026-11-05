import express from "express";
import * as commonController from "../controller/Common.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import { imageUpload } from "../middlewares/upload.js";
import validate from "../middlewares/validate.js";
import { removeFiles } from "../validators/Community.Validator.js";

const router = express.Router();

// Images only (covers, profile pictures). Book PDFs go through the admin-only
// POST /book/upload-file, which stores them privately.
// Every upload is recorded as an Asset owned by the uploader.
router.post("/upload", verifyToken, imageUpload.array("files"), commonController.upload);

// Users can only delete their own uploads (admins: any).
// Body: { public_id } or { publicIds: [...] }
router.post("/remove", verifyToken, validate(removeFiles), commonController.remove);

export default router;
