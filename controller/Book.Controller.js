import asyncHandler from "../middlewares/asyncHandler.js";
import helper from "../utils/helper.js";
import * as bookService from "../services/Book.Service.js";
import { uploadBookFile } from "../services/Common.Service.js";

// --- Public catalogue

export const getCatalog = asyncHandler(async (req, res) => {
  const result = await bookService.getCatalog(req);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export const getBook = asyncHandler(async (req, res) => {
  const data = await bookService.getBook(req.params.bookId);

  return res.status(200).json({
    success: true,
    data,
  });
});

// --- Admin

export const uploadFile = asyncHandler(async (req, res) => {
  const data = await uploadBookFile(req.file, req.userID);

  return res.status(200).json({
    success: true,
    message: "Book file uploaded privately.",
    data, // { public_id, name, pages, bytes } — pass public_id as `file` when creating the book
  });
});

export const createBook = asyncHandler(async (req, res) => {
  const session = req.transaction;

  const required = ["title", "author", "description", "price", "categoryId", "file", "coverImage"];
  helper.checkMandatoryFields(req.body, required);

  const book = await bookService.createBook(req.body, req.userID, session);

  return res.status(201).json({
    success: true,
    message: book.status === "published" ? "Book published." : "Book saved as draft.",
    data: { _id: book._id, status: book.status },
  });
});

export const updateBook = asyncHandler(async (req, res) => {
  await bookService.updateBook(req.params.bookId, req.body, req.userID, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Book updated.",
  });
});

export const setBookStatus = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["status"]);

  const book = await bookService.setBookStatus(req.params.bookId, req.body.status, req.transaction);

  return res.status(200).json({
    success: true,
    message: `Book is now ${book.status}.`,
  });
});

export const getAdminBooks = asyncHandler(async (req, res) => {
  const data = await bookService.getAdminBooks(req);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getAdminBook = asyncHandler(async (req, res) => {
  const data = await bookService.getAdminBook(req.params.bookId);

  return res.status(200).json({
    success: true,
    data,
  });
});
