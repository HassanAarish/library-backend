import Book from "../models/Book.Model.js";
import Rental from "../models/Rental.Model.js";
import { notify } from "./Notification.Service.js";

/**
 * Slot maths for a book's single copy, shared by the rental and payment
 * services and the lifecycle cron.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

// Don't offer the same booking an early start more than once in this window.
const EARLY_START_RENOTIFY_MS = 6 * 60 * 60 * 1000;

/**
 * Mongo filter for rentals that currently hold their slot. An unpaid booking
 * only holds it until its hold expires — even before the cron job tidies up.
 */
export const slotHoldingFilter = (now = new Date()) => ({
  $or: [
    { status: { $in: ["payment_review", "scheduled", "active"] } },
    { status: "pending_payment", holdExpiresAt: { $gt: now } },
  ],
});

export const formatDate = (date) =>
  new Date(date).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

/** Every booking of a book that hasn't ended yet, earliest first. */
export const getBookings = (bookId, now, session, excludeRentalId) =>
  Rental.find({
    bookId,
    endDate: { $gt: now },
    ...slotHoldingFilter(now),
    ...(excludeRentalId && { _id: { $ne: excludeRentalId } }),
  })
    .sort({ startDate: 1 })
    .select("startDate endDate days renterId status earlyStartOfferedAt")
    .session(session)
    .lean();

export const overlaps = (bookings, start, end) =>
  bookings.some((b) => b.startDate < end && b.endDate > start);

/** Earliest start ≥ `from` with a free gap of `days` days. */
export const earliestStart = (bookings, from, days) => {
  let candidate = new Date(from);
  for (const b of bookings) {
    if (candidate.getTime() + days * DAY_MS <= b.startDate.getTime()) break;
    if (b.endDate > candidate) candidate = new Date(b.endDate);
  }
  return candidate;
};

export const isLive = (rental, now) => rental.startDate <= now && rental.endDate > now;

/**
 * The book just freed up (early return, cancellation, expired hold, rejected
 * payment, …). If the next confirmed booking could now start straight away,
 * tell its reader they may "start now" instead of waiting.
 */
export const offerEarlyStart = async (bookId, session = null) => {
  const now = new Date();
  const bookings = await getBookings(bookId, now, session);

  if (bookings.some((b) => isLive(b, now))) return; // someone is reading it

  const next = bookings.find((b) => b.startDate > now);
  if (!next || next.status !== "scheduled") return;
  if (next.earlyStartOfferedAt && now - next.earlyStartOfferedAt < EARLY_START_RENOTIFY_MS) return;

  const others = bookings.filter((b) => !b._id.equals(next._id));
  if (overlaps(others, now, new Date(now.getTime() + next.days * DAY_MS))) return;

  await Rental.updateOne({ _id: next._id }, { $set: { earlyStartOfferedAt: now } }, { session });

  const book = await Book.findById(bookId).select("title").session(session).lean();

  notify(next.renterId, {
    type: "rental.can_start_early",
    title: `"${book?.title}" is free now`,
    message: `The book you booked for ${formatDate(next.startDate)} is free now. Open your booking and choose "Start now" to begin reading today.`,
    data: { rentalId: next._id, bookId },
  });
};
