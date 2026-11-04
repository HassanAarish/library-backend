import express from "express";
import multer from "multer";
import * as commonController from "../controller/Common.Controller.js";
import verifyToken from "../middlewares/verifyToken.js";
import ErrorResponse from "../utils/errorResponse.js";

const router = express.Router();

// Only what the library actually needs: cover/profile images and book files.
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new ErrorResponse(`File type not allowed: ${file.mimetype}`, 400));
  },
});

// Authenticated: every upload is recorded as an Asset owned by the uploader.
router.post("/upload", verifyToken, upload.array("files"), commonController.upload);

// Users can only delete their own uploads (admins: any).
router.post("/remove", verifyToken, commonController.remove);

export default router;
