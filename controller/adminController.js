import Book from "../models/Books.Model.js";
import User from "../models/User.Model.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";

export const addBook = asyncHandler(async (req, res, next) => {
  const { title, category, author, price } = req.body;
  const userId = req.userID;
  try {
    if (!title || !category || !author || !price) {
      return next(new ErrorResponse("Please provide all the feilds", 404));
    }
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role === "admin") {
      const book = await Book.create(req.body);

      return res.status(200).json({
        success: true,
        message: "Book added successfully !",
        data: book,
      });
    }
    return next(new ErrorResponse("User not Authorized", 403));
  } catch (error) {
    return next(error);
  }
});

export const updateBook = asyncHandler(async (req, res, next) => {
  const { bookId } = req.params;
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role !== "admin") {
      return next(new ErrorResponse("Not authorized to update books", 403));
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return next(new ErrorResponse("Book not found", 404));
    }

    const updatedBook = await Book.findByIdAndUpdate(bookId, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      data: updatedBook,
    });
  } catch (error) {
    return next(error);
  }
});

export const deleteBook = asyncHandler(async (req, res, next) => {
  const { bookId } = req.params;
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role !== "admin") {
      return next(new ErrorResponse("Not authorized to update books", 403));
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return next(new ErrorResponse("Book not found", 404));
    }

    await book.remove();

    return res.status(200).json({
      success: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
});

export const getAllUserProfiles = asyncHandler(async (req, res, next) => {
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role === "admin") {
      const users = await User.find({ role: "user" });
      return res.status(200).json({
        success: true,
        message: "All users deleted successfully!",
        data: users,
      });
    } else {
      return next(
        new ErrorResponse("User unauthorized for this request!", 403)
      );
    }
  } catch (error) {
    return next(error);
  }
});
