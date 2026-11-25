import Review from "../models/Review.Model.js";
import Book from "../models/Book.Model.js";
import Rental from "../models/Rental.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { audit } from "../utils/audit.js";

export const createReview = async (bookId, userId, data, session = null) => {
  const { rating, comment } = data;

  // 1. Verify book exists and is published
  const book = await Book.findOne({ _id: bookId, status: "published" }).session(session);
  if (!book) throw new ErrorResponse("Book not found or not available for review", 404);

  // 2. Only readers who actually rented the book may review it
  const hasRented = await Rental.exists({
    bookId,
    renterId: userId,
    status: { $in: ["active", "completed"] },
  }).session(session);

  if (!hasRented) {
    throw new ErrorResponse("You can only review books you have rented.", 403);
  }

  // 3. Create review (Unique index in model prevents duplicates)
  const review = new Review({
    bookId,
    userId,
    rating,
    comment,
  });

  const saved = await review.save({ session });

  audit("review.create", {
    target: { type: "Book", id: bookId },
    metadata: { rating, reviewId: saved._id },
  });

  return saved;
};
