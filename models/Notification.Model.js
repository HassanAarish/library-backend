import mongoose from "mongoose";
import { getEnv } from "../config/dotenv.js";

// Notifications older than this are removed automatically (TTL index).
const RETENTION_DAYS = Number(getEnv("NOTIFICATION_RETENTION_DAYS")) || 180;

// What happened. The client picks the icon/link from this.
export const NOTIFICATION_TYPES = [
  // Payments
  "payment.submitted", // admin: proof waiting for review
  "payment.approved",
  "payment.rejected",
  "refund.requested", // admin
  "refund.resolved",
  // Rentals
  "rental.started",
  "rental.ended",
  "rental.hold_expired",
  "rental.can_start_early",
  // Packages
  "package.expiring",
  "package.expired",
  // Book requests
  "book_request.created", // admin
  "book_request.updated",
  "book_request.fulfilled",
  // Categories
  "category.proposed", // admin
  "category.approved",
  "category.rejected",
];

const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    // Ids the client needs to link somewhere: { rentalId, bookId, paymentId, … }
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, readAt: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;
