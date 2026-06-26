import Review from "../models/Review.Model.js";
import Book from "../models/Book.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const createReview = async (bookId, userId, data, session = null) => {
  const { rating, comment } = data;

  // 1. Verify book exists and is approved
  const book = await Book.findOne({ _id: bookId, status: "approved" });
  if (!book) throw new ErrorResponse("Book not found or not available for review", 404);

  // 2. Create review (Unique index in model prevents duplicates)
  const review = new Review({
    bookId,
    userId,
    rating,
    comment,
  });

  return await review.save({ session });
};
