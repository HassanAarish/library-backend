import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Books from "../models/Book.Model.js";

export const getAllbooks = asyncHandler(async (req, res, next) => {
  try {
    const books = await Books.find({
      isRented: false,
    }).sort({
      createdAt: -1,
    });
    return res.status(200).json({
      success: true,
      data: books,
    });
  } catch (error) {
    return next(error);
  }
});

export const getByCategory = asyncHandler(async (req, res, next) => {
  try {
    const category = req.params["category"];

    const books = await Books.find({ category });
    console.log("books: ", books);
    if (books.length === 0) {
      return next(new ErrorResponse("Nothing found", 301));
    }
    res.status(200).send(books);
  } catch (error) {
    return next(error);
  }
});

export const getById = asyncHandler(async (req, res, next) => {
  try {
    const bookId = req.params.id;

    const books = await Books.find({ bookId });
    if (books.length === 0) {
      return next(new ErrorResponse("Nothing found", 301));
    }
    return res.status(200).json({
      success: true,
      message: `Book found with the id: ${bookId}`,
      data: books,
    });
  } catch (error) {
    return next(error);
  }
});

export const searchBook = asyncHandler(async (req, res, next) => {
  const { input } = req.body;
  const searchLower = input.toLowerCase();
  try {
    const books = await Books.find({});

    const filtered = books.filter(
      (book) =>
        book.title.toLowerCase().includes(searchLower) ||
        book.author.toLowerCase().includes(searchLower) ||
        book.category.some((category) =>
          category.toLowerCase().includes(searchLower)
        )
    );
    return res.status(200).json({
      success: true,
      data: filtered,
    });
  } catch (error) {
    return next(error);
  }
});
