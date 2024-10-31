import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Book from "../models/Books.Model.js";

export const getAllbooks = asyncHandler(async (req, res, next) => {
  try {
    const books = await Book.find({
      isRented: false,
    }).sort({
      createdAt: -1,
    });
    return res.status(200).json({
      success: true,
      message: "All books fetched successfully",
      data: books,
    });
  } catch (error) {
    return next(error);
  }
});

export const getByCategory = asyncHandler(async (req, res, next) => {
  try {
    const { category } = req.body;

    const books = await Book.find({ category });

    if (books.length === 0) {
      return next(
        new ErrorResponse(`No books found for your category: ${category}`, 301)
      );
    }
    return res.status(200).json({ success: true, data: books });
  } catch (error) {
    console.log(error);
    return next(error);
  }
});

export const getBookById = asyncHandler(async (req, res, next) => {
  const { bookId } = req.params;
  try {
    const books = await Book.findById(bookId);
    if (!books) {
      return next(new ErrorResponse("No Book found", 404));
    }
    return res.status(200).json({
      success: true,
      message: `Book found with the title: ${books.title}`,
      data: books,
    });
  } catch (error) {
    console.log(error);
  }
});

export const searchBook = asyncHandler(async (req, res, next) => {
  const { input } = req.body;
  const searchLower = input.toLowerCase();
  try {
    const books = await Book.find({});

    const filtered = books.filter(
      (book) =>
        book.title.toLowerCase().includes(searchLower) ||
        book.author.toLowerCase().includes(searchLower) ||
        book.category.some((category) =>
          category.toLowerCase().includes(searchLower)
        )
    );
    res.status(200).json({
      books: filtered,
    });
  } catch (error) {
    console.error(error);
    res.status(404);
  }
});
