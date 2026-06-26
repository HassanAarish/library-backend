import moment from "moment";
import Book from "../models/Book.Model.js";
import Rental from "../models/Rental.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const createRentalBooking = async (body, session = null) => {
  const { bookId, renterId, amountPaid, paymentIntentId, durationDays } = body;

  const book = await Book.findOne({ _id: bookId, status: "approved" }).session(session);

  if (!book) throw new ErrorResponse("Book not found", 404);

  if (!book.isAvailable) {
    throw new ErrorResponse("Book is already rented by someone else", 400);
  }

  const expiryDate = moment().add(durationDays, "days").toDate();

  const rentalData = {
    bookId,
    renterId,
    ownerId: book.uploader,
    amountPaid,
    paymentIntentId,
    duration: durationDays,
    expiryDate,
    status: "active",
  };

  const rental = new Rental(rentalData);

  // 4. Update Book Availability
  book.isAvailable = false;
  await book.save({ session });

  return await rental.save({ session });
};
