import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    stripeSubscriptionId: {
      type: String,
      required: true,
    },
    stripePriceId: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["monthly", "yearly"],
    },
    planName: {
      type: String,
      required: true,
    },
    alerts: {
      type: Number,
      required: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    active: {
      type: Boolean,
      default: true,
    },
    cancellationDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const Subscription = mongoose.model("Subscription", SubscriptionSchema);

export default Subscription;
