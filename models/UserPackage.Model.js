import mongoose from "mongoose";

/**
 * One purchase of a PackagePlan. Holds a snapshot of the plan (so later price
 * or credit changes don't affect what the user bought) and the credit balance.
 * Credits can be used for rentals starting before `expiresAt`.
 */
const UserPackageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "PackagePlan", required: true },
    snapshot: {
      name: { type: String, required: true },
      credits: { type: Number, required: true },
      price: { type: Number, required: true },
      validityDays: { type: Number, required: true },
    },

    creditsTotal: { type: Number, required: true, min: 1 },
    creditsUsed: { type: Number, default: 0, min: 0 },

    // pending_payment → active → expired · or rejected / cancelled before activation
    status: {
      type: String,
      enum: ["pending_payment", "active", "expired", "rejected", "cancelled"],
      default: "pending_payment",
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },

    activatedAt: { type: Date }, // the 1-year clock starts when payment is approved
    expiresAt: { type: Date },

    // Expiry reminders already sent, by days-before (e.g. [30, 7]).
    remindersSent: [{ type: Number }],
  },
  { timestamps: true },
);

UserPackageSchema.virtual("creditsLeft").get(function () {
  return Math.max(0, this.creditsTotal - this.creditsUsed);
});

UserPackageSchema.set("toJSON", { virtuals: true });

UserPackageSchema.index({ user: 1, status: 1, expiresAt: 1 });
UserPackageSchema.index({ status: 1, expiresAt: 1 });

const UserPackage = mongoose.model("UserPackage", UserPackageSchema);

export default UserPackage;
