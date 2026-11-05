import Book from "../models/Book.Model.js";
import Payment from "../models/Payment.Model.js";
import Rental from "../models/Rental.Model.js";
import UserPackage from "../models/UserPackage.Model.js";
import policy from "../config/rentalPolicy.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { createPayment, getInstructions } from "./Payment.Service.js";
import { availabilityChanged, notifyAdmins } from "./Notification.Service.js";
import {
  DAY_MS,
  earliestStart,
  formatDate,
  getBookings,
  isLive,
  offerEarlyStart,
  overlaps,
  slotHoldingFilter,
} from "./rentalSlots.js";

// A start date this far in the past is treated as "now" (clock skew, slow forms).
const START_GRACE_MS = 5 * 60 * 1000;

const BOOK_SUMMARY = "title author coverImage rentalDays price";

/**
 * Serialize bookings of one book: every booking transaction bumps the same
 * document, so two concurrent bookings conflict and one is retried by the
 * client instead of both claiming the slot.
 */
const lockBook = (bookId, session) =>
  Book.updateOne({ _id: bookId }, { $inc: { bookingVersion: 1 } }, { session });

/**
 * Public availability of a book's single copy. For a logged-in user it also
 * shows their own booking and place in line.
 */
export const getAvailability = async (bookId, userId) => {
  const book = await Book.findOne({ _id: bookId, status: "published" })
    .select("rentalDays price")
    .lean();
  if (!book) throw new ErrorResponse("Book not found", 404);

  const now = new Date();
  const bookings = await getBookings(book._id, now);

  const current = bookings.find((b) => isLive(b, now));
  const upcoming = bookings.filter((b) => b.startDate > now);
  const nextAvailableStart = earliestStart(bookings, now, book.rentalDays);

  let myBooking = null;
  if (userId) {
    const mine = bookings.find((b) => String(b.renterId) === String(userId));
    if (mine) {
      myBooking = {
        rentalId: mine._id,
        status: mine.status,
        startDate: mine.startDate,
        endDate: mine.endDate,
        // 0 = you're reading it now; 1 = you're next; …
        placeInLine: isLive(mine, now) ? 0 : upcoming.findIndex((b) => b._id.equals(mine._id)) + 1,
      };
    }
  }

  return {
    bookId: book._id,
    rentalDays: book.rentalDays,
    price: book.price,
    availableNow: nextAvailableStart <= now,
    isRentedNow: Boolean(current),
    currentRentalEndsAt: current?.endDate ?? null,
    // Bookings a new reader would have to wait for.
    peopleAhead: bookings.filter((b) => b.startDate < nextAvailableStart).length,
    queueLength: upcoming.length,
    nextAvailableStart,
    bookedSlots: bookings.map((b) => ({ start: b.startDate, end: b.endDate })),
    myBooking,
  };
};

const assertFairUse = async (userId, start, now, session) => {
  const mine = await Rental.find({
    renterId: userId,
    endDate: { $gt: now },
    ...slotHoldingFilter(now),
  })
    .select("startDate")
    .session(session)
    .lean();

  if (start <= now) {
    const active = mine.filter((r) => r.startDate <= now).length;
    if (active >= policy.maxActiveRentals) {
      throw new ErrorResponse(
        `You can read up to ${policy.maxActiveRentals} books at a time. Return one or book this for later.`,
        400,
      );
    }
  } else {
    const upcoming = mine.filter((r) => r.startDate > now).length;
    if (upcoming >= policy.maxUpcomingRentals) {
      throw new ErrorResponse(
        `You can have up to ${policy.maxUpcomingRentals} upcoming bookings at a time.`,
        400,
      );
    }
  }
};

const resolveStart = (startDate, bookings, now, days) => {
  if (!startDate) return earliestStart(bookings, now, days);

  const requested = new Date(startDate);
  if (Number.isNaN(requested.getTime())) throw new ErrorResponse("Invalid start date.", 400);
  if (requested.getTime() < now.getTime() - START_GRACE_MS) {
    throw new ErrorResponse("The start date can't be in the past.", 400);
  }
  return requested < now ? now : requested;
};

/**
 * Book a slot of a book's single copy.
 * Body: { bookId, startDate?, paymentMethod: "single" | "credit", method? }
 *  - no startDate → the earliest free slot (now, if the book is free)
 *  - "single" → held for `paymentHoldMinutes` while the user pays
 *  - "credit" → uses one package credit (soonest-expiring first), confirmed at once
 */
export const createRental = async (body, userId, session = null) => {
  const { bookId, startDate, paymentMethod = "single", method } = body;

  if (!["single", "credit"].includes(paymentMethod)) {
    throw new ErrorResponse('paymentMethod must be "single" or "credit".', 400);
  }

  const book = await Book.findOne({ _id: bookId, status: "published" }).session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);

  await lockBook(book._id, session);

  const now = new Date();
  const bookings = await getBookings(book._id, now, session);

  if (bookings.some((b) => String(b.renterId) === String(userId))) {
    throw new ErrorResponse("You already have a booking for this book.", 409);
  }

  const days = book.rentalDays;
  const start = resolveStart(startDate, bookings, now, days);
  const end = new Date(start.getTime() + days * DAY_MS);

  if (start.getTime() > now.getTime() + policy.maxAdvanceDays * DAY_MS) {
    throw new ErrorResponse(`Bookings can start at most ${policy.maxAdvanceDays} days ahead.`, 400);
  }

  if (overlaps(bookings, start, end)) {
    const next = earliestStart(bookings, start, days);
    throw new ErrorResponse(
      `That period is already booked. The earliest available start is ${formatDate(next)}.`,
      409,
    );
  }

  await assertFairUse(userId, start, now, session);

  const startsNow = start <= now;
  const base = { bookId: book._id, renterId: userId, startDate: start, endDate: end, days };
  let rental;
  let payment = null;

  if (paymentMethod === "credit") {
    // Soonest-expiring package that is still valid on the start date.
    const pkg = await UserPackage.findOneAndUpdate(
      {
        user: userId,
        status: "active",
        expiresAt: { $gt: start },
        $expr: { $lt: ["$creditsUsed", "$creditsTotal"] },
      },
      { $inc: { creditsUsed: 1 } },
      { sort: { expiresAt: 1 }, session, returnDocument: "after" },
    );

    if (!pkg) {
      throw new ErrorResponse("You have no package credits valid for that start date.", 400);
    }

    rental = new Rental({
      ...base,
      status: startsNow ? "active" : "scheduled",
      paymentMethod: "credit",
      price: 0,
      userPackage: pkg._id,
    });
    await rental.save({ session });
  } else if (book.price === 0) {
    // Free book: nothing to pay.
    rental = new Rental({
      ...base,
      status: startsNow ? "active" : "scheduled",
      paymentMethod: "single",
      price: 0,
    });
    await rental.save({ session });
  } else {
    const holdExpiresAt = new Date(now.getTime() + policy.paymentHoldMinutes * 60 * 1000);

    rental = new Rental({
      ...base,
      status: "pending_payment",
      paymentMethod: "single",
      price: book.price,
      currency: book.currency,
      holdExpiresAt,
    });

    payment = await createPayment(
      {
        userId,
        purpose: "rental",
        rentalId: rental._id,
        amount: book.price,
        method,
        expiresAt: holdExpiresAt,
      },
      session,
    );

    rental.payment = payment._id;
    await rental.save({ session });
  }

  audit("rental.create", {
    target: { type: "Rental", id: rental._id },
    metadata: {
      bookId: book._id,
      title: book.title,
      paymentMethod,
      price: rental.price,
      startDate: start,
      endDate: end,
      userPackage: rental.userPackage,
      paymentReference: payment?.reference,
    },
  });

  availabilityChanged(book._id);

  return {
    rental,
    payment: payment && {
      _id: payment._id,
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      instructions: getInstructions(payment),
    },
  };
};

const getOwnRental = async (rentalId, userId, session) => {
  const rental = await Rental.findOne({ _id: rentalId, renterId: userId }).session(session);
  if (!rental) throw new ErrorResponse("Rental not found", 404);
  return rental;
};

/**
 * Cancel a booking that hasn't started. A package credit comes back if the
 * package is still valid; a paid booking is marked for a manual refund.
 */
export const cancelRental = async (rentalId, userId, session = null) => {
  const rental = await getOwnRental(rentalId, userId, session);
  const now = new Date();

  const notStartedYet =
    ["pending_payment", "payment_review"].includes(rental.status) ||
    (rental.status === "scheduled" && rental.startDate > now);

  if (!notStartedYet) {
    throw new ErrorResponse(
      rental.status === "active" || rental.status === "scheduled"
        ? "This rental has already started, so it can't be cancelled. You can return the book instead."
        : `This rental is already ${rental.status.replace("_", " ")}.`,
      400,
    );
  }

  const previousStatus = rental.status;
  rental.status = "cancelled";
  rental.cancelReason = "user_cancelled";
  rental.cancelledAt = now;
  rental.holdExpiresAt = undefined;
  await rental.save({ session });

  let creditReturned = false;
  let refundRequested = false;

  if (rental.paymentMethod === "credit" && rental.userPackage) {
    const { modifiedCount } = await UserPackage.updateOne(
      {
        _id: rental.userPackage,
        status: "active",
        expiresAt: { $gt: now },
        creditsUsed: { $gt: 0 },
      },
      { $inc: { creditsUsed: -1 } },
      { session },
    );
    creditReturned = modifiedCount === 1;
  }

  if (rental.payment) {
    const payment = await Payment.findById(rental.payment).session(session);

    if (payment?.status === "awaiting_proof") {
      payment.status = "cancelled";
    } else if (payment && ["submitted", "approved"].includes(payment.status)) {
      // The user may already have sent money — the admin settles it manually.
      if (payment.status === "submitted") payment.status = "cancelled";
      payment.refund = { status: "requested", requestedAt: now };
      refundRequested = true;
    }

    if (payment) await payment.save({ session });
  }

  audit("rental.cancel", {
    target: { type: "Rental", id: rental._id },
    metadata: { bookId: rental.bookId, previousStatus, creditReturned, refundRequested },
  });

  if (refundRequested) {
    notifyAdmins({
      type: "refund.requested",
      title: "Refund requested",
      message: `A paid booking was cancelled (Rs ${rental.price}). Send the refund via Easypaisa, then mark it on the payment.`,
      data: { rentalId: rental._id, paymentId: rental.payment },
    });
  }

  availabilityChanged(rental.bookId);
  await offerEarlyStart(rental.bookId, session);

  return { creditReturned, refundRequested };
};

/** One free extension, only when nobody is booked right after this rental. */
export const extendRental = async (rentalId, userId, session = null) => {
  const rental = await getOwnRental(rentalId, userId, session);
  const now = new Date();

  if (!["scheduled", "active"].includes(rental.status) || !isLive(rental, now)) {
    throw new ErrorResponse("Only a rental you're currently reading can be extended.", 400);
  }
  if (rental.extended) {
    throw new ErrorResponse("This rental has already been extended once.", 400);
  }

  await lockBook(rental.bookId, session);

  const newEnd = new Date(rental.endDate.getTime() + policy.extensionDays * DAY_MS);
  const others = await getBookings(rental.bookId, now, session, rental._id);

  if (overlaps(others, rental.endDate, newEnd)) {
    throw new ErrorResponse(
      "Another reader has booked this book right after you, so it can't be extended.",
      409,
    );
  }

  const previousEnd = rental.endDate;
  rental.endDate = newEnd;
  rental.days += policy.extensionDays;
  rental.extended = true;
  rental.status = "active";
  await rental.save({ session });

  audit("rental.extend", {
    target: { type: "Rental", id: rental._id },
    metadata: { bookId: rental.bookId, previousEnd, newEnd },
  });

  availabilityChanged(rental.bookId);

  return rental;
};

/** Finish early: frees the book for the next reader straight away. */
export const returnRental = async (rentalId, userId, session = null) => {
  const rental = await getOwnRental(rentalId, userId, session);
  const now = new Date();

  if (!["scheduled", "active"].includes(rental.status) || !isLive(rental, now)) {
    throw new ErrorResponse("Only a rental you're currently reading can be returned.", 400);
  }

  const scheduledEnd = rental.endDate;
  rental.status = "completed";
  rental.returnedAt = now;
  rental.endDate = now;
  await rental.save({ session });

  audit("rental.return", {
    target: { type: "Rental", id: rental._id },
    metadata: { bookId: rental.bookId, scheduledEnd, returnedAt: now },
  });

  availabilityChanged(rental.bookId);
  await offerEarlyStart(rental.bookId, session);

  return rental;
};

/**
 * Move a future booking to start right now (e.g. the previous reader returned
 * early). The rental keeps its full length.
 */
export const startRentalNow = async (rentalId, userId, session = null) => {
  const rental = await getOwnRental(rentalId, userId, session);
  const now = new Date();

  if (rental.status !== "scheduled" || rental.startDate <= now) {
    throw new ErrorResponse(
      "Only a confirmed booking that hasn't started can be moved to now.",
      400,
    );
  }

  await lockBook(rental.bookId, session);

  const newEnd = new Date(now.getTime() + rental.days * DAY_MS);
  const others = await getBookings(rental.bookId, now, session, rental._id);

  if (overlaps(others, now, newEnd)) {
    const next = earliestStart(others, now, rental.days);
    throw new ErrorResponse(
      `The book isn't free for your whole rental yet. It's next free from ${formatDate(next)}.`,
      409,
    );
  }

  await assertFairUse(userId, now, now, session);

  const previousStart = rental.startDate;
  rental.startDate = now;
  rental.endDate = newEnd;
  rental.status = "active";
  await rental.save({ session });

  audit("rental.start_now", {
    target: { type: "Rental", id: rental._id },
    metadata: { bookId: rental.bookId, previousStart, newStart: now },
  });

  availabilityChanged(rental.bookId);

  return rental;
};

export const getMyRentals = async (req, userId) =>
  helper.paginate(Rental, req, {
    sort: { startDate: -1 },
    filterFields: ["status", "paymentMethod"],
    filters: { renterId: userId },
    populate: { path: "bookId", select: BOOK_SUMMARY },
  });

export const getMyRental = async (rentalId, userId) => {
  const rental = await Rental.findOne({ _id: rentalId, renterId: userId })
    .populate({ path: "bookId", select: BOOK_SUMMARY })
    .populate({
      path: "payment",
      select: "reference amount currency status method expiresAt rejectionReason refund",
    })
    .lean();
  if (!rental) throw new ErrorResponse("Rental not found", 404);

  if (rental.status === "pending_payment" && rental.payment?.status === "awaiting_proof") {
    rental.payment.instructions = getInstructions(rental.payment);
  }
  return rental;
};

export const getAdminRentals = async (req) =>
  helper.paginate(Rental, req, {
    sort: { createdAt: -1 },
    filterFields: ["status", "paymentMethod", "bookId", "renterId"],
    filters: helper.dateRangeFilter(req.query.from, req.query.to, "startDate"),
    populate: [
      { path: "bookId", select: "title author" },
      { path: "renterId", select: "name email" },
      { path: "payment", select: "reference amount status" },
    ],
  });
