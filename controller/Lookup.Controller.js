import asyncHandler from "../middlewares/asyncHandler.js";
import * as lookupService from "../services/Lookup.Service.js";

export const searchBooks = asyncHandler(async (req, res) => {
  const data = await lookupService.searchBooks({
    q: req.query.q,
    isbn: req.query.isbn,
    limit: req.query.limit,
  });

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getWork = asyncHandler(async (req, res) => {
  const data = await lookupService.getWork(req.params.workKey);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const importCover = asyncHandler(async (req, res) => {
  const data = await lookupService.importCover(req.body.coverId, req.userID);

  return res.status(201).json({
    success: true,
    message: "Cover imported. Use it as the book's coverImage.",
    data, // { name, url, public_id }
  });
});
