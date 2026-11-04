import mongoose from "mongoose";

/**
 * One reservation of a book's single copy for [startDate, endDate).
 *
 *   pending_payment ─(proof sent)─► payment_review ─(admin approves)─► scheduled ─► active ─► completed
 *        │ hold times out / user cancels      │ admin rejects            │ user cancels
 *        └──────────────► cancelled ◄─────────┴──────────────────────────┘
 *
 * Credit rentals skip payment and start as scheduled/active.
 * Reading access is decided by the dates (see Reader.Service), so a late cron
 * run never extends or cuts anyone's time.
 */
export const RENTAL_STATUSES = [
  "pending_payment",
  "payment_review",
  "scheduled",
  "active",
  "completed",
  "cancelled",
];

// Statuses whose slot is taken. pending_payment only while its hold is live.
export const SLOT_HOLDING_STATUSES = ["pending_payment", "payment_review", "scheduled", "active"];

// Statuses that grant reading access while now is inside the dates.
export const READABLE_STATUSES = ["scheduled", "active"];

const RentalSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    renterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },

    status: { type: String, enum: RENTAL_STATUSES, required: true },

    // "single": paid at the book's price · "credit": one package credit
    paymentMethod: { type: String, enum: ["single", "credit"], required: true },
    price: { type: Number, required: true, min: 0 }, // PKR snapshot (0 for credit)
    currency: { type: String, default: "PKR" },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    userPackage: { type: mongoose.Schema.Types.ObjectId, ref: "UserPackage" },

    // Slot is released if payment proof isn't sent by then (pending_payment only).
    holdExpiresAt: { type: Date },

    extended: { type: Boolean, default: false },
    returnedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: {
      type: String,
      enum: ["user_cancelled", "payment_rejected", "payment_timeout", "admin"],
    },
  },
  { timestamps: true },
);

// Overlap checks and availability for a book.
RentalSchema.index({ bookId: 1, status: 1, startDate: 1, endDate: 1 });
// A user's library and fair-use counts.
RentalSchema.index({ renterId: 1, status: 1, startDate: -1 });
// Lifecycle cron.
RentalSchema.index({ status: 1, holdExpiresAt: 1 });
RentalSchema.index({ status: 1, startDate: 1 });
RentalSchema.index({ status: 1, endDate: 1 });

const Rental = mongoose.model("Rental", RentalSchema);

export default Rental;
