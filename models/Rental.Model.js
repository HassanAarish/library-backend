import mongoose from "mongoose";

const RentalSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "usd",
    },
    paymentIntentId: {
      type: String, // Stripe Payment Intent ID for tracking
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
    },
    rentalDate: {
      type: Date,
      default: Date.now,
    },
    duration: {
      type: Number,
    },
    expiryDate: {
      type: Date,
      required: true, // You can set this to +7 days or +1 month from rentalDate
    },
  },
  { timestamps: true },
);

/**
 * INDEXING
 */

// 1. Fast lookup for a user's library (What books do I currently have?)
RentalSchema.index({ renterId: 1, status: 1 });

// 2. Prevent a user from renting the same book twice if they already have an active rental
RentalSchema.index({ renterId: 1, bookId: 1, status: 1 }, { unique: true });

// 3. For Owner Dashboards (See who rented my books)
RentalSchema.index({ ownerId: 1 });

const Rental = mongoose.model("Rental", RentalSchema);

export default Rental;
