import mongoose from "mongoose";

/**
 * A payment for a single rental or a package. With manual providers (e.g.
 * Easypaisa transfer) the user submits proof and an admin approves it:
 *
 *   awaiting_proof ─(proof)─► submitted ─(admin)─► approved | rejected
 *        └─(time out / cancel)─► expired | cancelled
 */
export const PAYMENT_STATUSES = [
  "awaiting_proof",
  "submitted",
  "approved",
  "rejected",
  "expired",
  "cancelled",
];

const PaymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["rental", "package"], required: true },
    rental: { type: mongoose.Schema.Types.ObjectId, ref: "Rental" },
    userPackage: { type: mongoose.Schema.Types.ObjectId, ref: "UserPackage" },

    amount: { type: Number, required: true, min: 0 }, // PKR
    currency: { type: String, default: "PKR" },
    method: { type: String, required: true }, // provider key, e.g. "easypaisa"

    // Short code the user puts in the transfer note so the admin can match it.
    reference: { type: String, required: true, unique: true },

    status: { type: String, enum: PAYMENT_STATUSES, default: "awaiting_proof" },
    expiresAt: { type: Date }, // deadline for submitting proof

    proof: {
      transactionId: { type: String, trim: true, uppercase: true },
      senderNumber: { type: String, trim: true },
      senderName: { type: String, trim: true },
      screenshot: {
        public_id: { type: String },
        name: { type: String },
      },
      submittedAt: { type: Date },
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },

    // Set when a paid booking is cancelled; refunds are handled manually.
    refund: {
      status: { type: String, enum: ["requested", "refunded", "declined"] },
      requestedAt: { type: Date },
      note: { type: String },
    },
  },
  { timestamps: true },
);

// One transaction id can only ever pay for one thing — reusing it is fraud.
PaymentSchema.index(
  { method: 1, "proof.transactionId": 1 },
  { unique: true, partialFilterExpression: { "proof.transactionId": { $type: "string" } } },
);
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, expiresAt: 1 });

const Payment = mongoose.model("Payment", PaymentSchema);

export default Payment;
