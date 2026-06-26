import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "BookingRequest",
        "BookingStatusUpdate",
        "Message",
        "Review",
        "SystemAlert",
        "QuoteUpdate",
        "ServiceApproval",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    additionalData: {
      bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
      serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Services",
      },
    },
  },
  {
    timestamps: true,
  },
);

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;
