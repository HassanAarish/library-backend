import Book from "../models/Book.Model.js";
import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const createBookRequest = async (bookData, userId, session = null) => {
  const { categoryId } = bookData;

  // 1. Validate Category exists and is approved
  const category = await Category.findById(categoryId).session(session);
  if (!category || category.status !== "approved") {
    throw new ErrorResponse("Invalid or unapproved category selected.", 400);
  }

  // 2. Create the Book
  const book = new Book({
    ...bookData,
    uploader: userId,
    category: categoryId,
    status: "pending", // Explicitly setting it, though it's the default
  });

  return await book.save({ session });
};

export const getMyBooks = async (req) => {
  // Force the filter to only show books belonging to the logged-in user
  // req.query.uploader = req.userID;

  const options = {
    sort: { createdAt: -1 },
    searchFields: ["title"],
    populate: { path: "category", select: "name slug" },
  };

  return await helper.paginate(Book, req, options);
};

export const getAllBooks = async (req) => {
  const options = {
    sort: { createdAt: -1 },
    searchFields: ["title", "author"],
    populate: [
      { path: "category", select: "name slug" },
      { path: "uploader", select: "name email" },
    ],
  };

  // If the requester is NOT an admin, we force strict visibility filters
  // if (req.role !== "admin") {
  //   req.query.status = "approved";
  //   req.query.isAvailable = true;
  // }

  // Use your generic helper to handle pagination, searching, and filtering
  return await helper.paginate(Book, req, options);
};

export const reviewBook = async (
  bookId,
  status,
  reason = "",
  session = null
) => {
  const book = await Book.findById(bookId).session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);

  book.status = status;
  if (status === "rejected") {
    book.rejectionReason = reason;
  }

  // If approved, we increment the category's book count
  if (status === "approved") {
    await Category.findByIdAndUpdate(
      book.category,
      { $inc: { bookCount: 1 } },
      { session }
    );
  }

  return await book.save({ session });
};
