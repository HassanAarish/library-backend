import multer from "multer";
import ErrorResponse from "../utils/errorResponse.js";

const MB = 1024 * 1024;

const onlyTypes = (allowed) => (req, file, cb) => {
  if (allowed.has(file.mimetype)) return cb(null, true);
  cb(new ErrorResponse(`File type not allowed: ${file.mimetype}`, 400));
};

// Covers and profile pictures. Contents are re-checked by magic bytes later.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * MB, files: 10 },
  fileFilter: onlyTypes(new Set(["image/jpeg", "image/png", "image/webp"])),
});

// Book PDFs (admin only). Larger limit; note Cloudinary's own per-file limit
// depends on your plan.
export const bookFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * MB, files: 1 },
  fileFilter: onlyTypes(new Set(["application/pdf"])),
});
