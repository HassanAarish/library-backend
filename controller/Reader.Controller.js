import asyncHandler from "../middlewares/asyncHandler.js";
import * as readerService from "../services/Reader.Service.js";

const readerFrom = (req) => ({
  userId: req.userID,
  role: req.role,
  email: req.userEmail,
  ip: req.ip,
});

export const openBook = asyncHandler(async (req, res) => {
  const data = await readerService.openBook(readerFrom(req), req.params.bookId);

  return res.status(200).json({
    success: true,
    data, // { bookId, title, author, pageCount, accessUntil }
  });
});

export const getPage = asyncHandler(async (req, res) => {
  const image = await readerService.getPage(readerFrom(req), req.params.bookId, req.params.page);

  // Watermarked per reader: never cache it anywhere, never offer it as a download.
  res.set({
    "Content-Type": "image/jpeg",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  });

  return res.status(200).send(image);
});
