import asyncHandler from "../middlewares/asyncHandler.js";
import Books from "../models/Book.Model.js";
import Order from "../models/Order.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const createOrder = asyncHandler(async (req, res, next) => {
  const { rentedBooks } = req.body;

  try {
    for (i = 0; i < rentedBooks.lenght; i++) {
      const book = await Books.findById(rentedBooks[i].bookId);

      if (!book || book.isRented === false) {
        // Updating the book to rented when placing the order
        book.isRented = true;
        await book.save();
      } else {
        return next(new ErrorResponse("Book is not available", 400));
      }
    }
    const newOrder = await Order.create(req.body);

    const foundOrder = await Order.findById(newOrder._id).populate(
      "rentedBooks.bookId"
    );
    return res.status(200).json({
      foundOrder,
      success: true,
      message: "Your order have been placed successfully !",
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const getAllbooks = asyncHandler(async (req, res, next) => {
  try {
    const books = await Books.find({
      isRented: false,
    })
      .sort({
        createdAt: -1,
      })
      .populate(books);
    return res.status(200).json({
      success: true,
      data: books,
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const getByCategory = asyncHandler(async (req, res, next) => {
  try {
    const category = req.params["category"];

    const books = await Books.find({ category });

    if (books.length === 0) {
      return next(new ErrorResponse("Nothing found", 301));
    }
    return res.status(200).json({ success: true, data: books });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const getBookById = asyncHandler(async (req, res, next) => {
  try {
    const bookId = req.params.id;

    const books = await Books.findById({ bookId });

    if (books.length === 0) {
      return next(new ErrorResponse("Nothing found", 301));
    }
    return res.status(200).json({
      success: true,
      message: `Book found with the id: ${bookId}`,
      data: books,
    });
  } catch (error) {
    console.error(error);
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
    console.error(error);
    return next(error);
  }
});
