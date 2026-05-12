import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import * as bookService from "../services/Book.Service.js";

export const createBookRequest = asyncHandler(async (req, res) => {
  const session = req.transaction;

  // Mandatory fields check
  const required = [
    "title",
    "author",
    "price",
    "categoryId",
    "file",
    "coverImage",
  ];
  helper.checkMandatoryFields(req.body, required);

  const book = await bookService.createBookRequest(
    req.body,
    req.userID,
    session
  );

  return res.status(201).json({
    success: true,
    message: "Book uploaded and sent for admin approval.",
    data: book,
  });
});

export const getMyBooks = asyncHandler(async (req, res) => {
  const result = await bookService.getMyBooks(req);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export const getAllBooks = asyncHandler(async (req, res) => {
  const result = await bookService.getAllBooks(req);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export const reviewBook = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { status, rejectionReason } = req.body;
  const session = req.transaction;

  if (!["approved", "rejected"].includes(status)) {
    throw new ErrorResponse("Invalid status update.", 400);
  }

  const book = await bookService.reviewBook(
    bookId,
    status,
    rejectionReason,
    session
  );

  return res.status(200).json({
    success: true,
    message: `Book has been ${status}.`,
    data: book,
  });
});
