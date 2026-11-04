import ErrorResponse from "./errorResponse.js";

// Magic bytes for every type the API accepts. The browser-declared mimetype is
// just a label the client chooses; these check what the bytes actually are.
const SIGNATURES = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) =>
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
};

/**
 * Throw unless the file's content matches its declared mimetype.
 *
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }} file - a multer file
 */
export const assertFileSignature = (file) => {
  const matches = SIGNATURES[file.mimetype];

  if (!matches || !file.buffer || file.buffer.length < 12 || !matches(file.buffer)) {
    throw new ErrorResponse(
      `"${file.originalname}" is not a valid ${file.mimetype || "file"}. Please upload the original file.`,
      400,
    );
  }
};
