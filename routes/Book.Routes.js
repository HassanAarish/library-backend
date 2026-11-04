import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import { inTransaction } from "../middlewares/transaction.js";
import { bookFileUpload } from "../middlewares/upload.js";
import * as bookController from "../controller/Book.Controller.js";

const router = express.Router();

const admin = [verifyToken, verifyRole("admin")];

// --- Admin (declared before "/:bookId" so these paths aren't read as ids)

router.get("/admin", ...admin, bookController.getAdminBooks);

router.get("/admin/:bookId", ...admin, bookController.getAdminBook);

// Multipart field "file": a PDF, stored privately on Cloudinary.
router.post("/upload-file", ...admin, bookFileUpload.single("file"), bookController.uploadFile);

router.post("/", ...admin, inTransaction, bookController.createBook);

router.patch("/:bookId", ...admin, inTransaction, bookController.updateBook);

router.patch("/:bookId/status", ...admin, inTransaction, bookController.setBookStatus);

// --- Public catalogue (no login needed to browse covers and details)

router.get("/", bookController.getCatalog);

router.get("/:bookId", bookController.getBook);

export default router;
