import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import Payment from "../models/Payment.Model.js";
import Rental from "../models/Rental.Model.js";
import UserPackage from "../models/UserPackage.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { notifyUser } from "../utils/emailClient.js";
import { afterCommit } from "../utils/requestContext.js";
import { getProvider } from "./payments/providers.js";
import { getOwnedAsset } from "./Common.Service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Easypaisa TIDs are numeric today; allow letters too so other wallets fit.
const TRANSACTION_ID_PATTERN = /^[A-Z0-9]{6,30}$/;

// Unambiguous characters (no 0/O, 1/I) — users type this into a transfer note.
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateReference = () => {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `LH-${code}`;
};

// Payment proof screenshots are private; admins get a server-signed link.
const signedScreenshotUrl = (publicId) =>
  publicId
    ? cloudinary.url(publicId, {
        resource_type: "image",
        type: "authenticated",
        sign_url: true,
        secure: true,
      })
    : undefined;

/**
 * Create a payment awaiting proof. Called by the rental and package flows.
 *
 * @returns {Promise<Document>} the saved Payment
 */
export const createPayment = async (
  { userId, purpose, rentalId, userPackageId, amount, method, expiresAt },
  session = null,
) => {
  const provider = getProvider(method);

  const payment = new Payment({
    user: userId,
    purpose,
    rental: rentalId,
    userPackage: userPackageId,
    amount,
    method: provider.key,
    reference: generateReference(),
    expiresAt,
  });

  return payment.save({ session });
};

export const getInstructions = (payment) => getProvider(payment.method).instructions(payment);

export const getMyPayment = async (paymentId, userId) => {
  const payment = await Payment.findOne({ _id: paymentId, user: userId }).lean();
  if (!payment) throw new ErrorResponse("Payment not found", 404);

  return {
    ...payment,
    instructions: payment.status === "awaiting_proof" ? getInstructions(payment) : undefined,
  };
};

export const getMyPayments = async (req, userId) =>
  helper.paginate(Payment, req, {
    sort: { createdAt: -1 },
    filterFields: ["status", "purpose"],
    filters: { user: userId },
  });

/**
 * The user's proof of transfer: transaction id, sender number and a
 * screenshot (uploaded privately via POST /payment/proof-upload).
 */
export const submitProof = async (paymentId, userId, body, session = null) => {
  const { transactionId, senderNumber, senderName, screenshot } = body;

  const payment = await Payment.findOne({ _id: paymentId, user: userId }).session(session);
  if (!payment) throw new ErrorResponse("Payment not found", 404);

  if (payment.status !== "awaiting_proof") {
    throw new ErrorResponse(`This payment is already ${payment.status.replace("_", " ")}.`, 400);
  }

  if (payment.expiresAt && payment.expiresAt <= new Date()) {
    throw new ErrorResponse("This payment has expired. Please book again.", 400);
  }

  const tid = String(transactionId).trim().toUpperCase();
  if (!TRANSACTION_ID_PATTERN.test(tid)) {
    throw new ErrorResponse(
      "Please enter the Transaction ID exactly as shown on your receipt.",
      400,
    );
  }

  // A transaction id can pay for one thing only. Reuse is a fraud signal.
  const reused = await Payment.findOne({
    method: payment.method,
    "proof.transactionId": tid,
    _id: { $ne: payment._id },
  })
    .select("_id user")
    .lean();

  if (reused) {
    audit("payment.duplicate_transaction_id", {
      outcome: "failure",
      severity: "critical",
      target: { type: "Payment", id: payment._id },
      metadata: {
        transactionId: tid,
        usedByPayment: reused._id,
        usedByUser: reused.user,
        sameUser: String(reused.user) === String(userId),
      },
    });
    throw new ErrorResponse("This Transaction ID has already been used for another payment.", 409);
  }

  const asset = await getOwnedAsset(screenshot?.public_id, userId, { mimePrefix: "image/" });
  if (asset.deliveryType !== "authenticated") {
    throw new ErrorResponse("Upload the screenshot through /payment/proof-upload.", 400);
  }

  // The booking must still be holding its slot.
  if (payment.purpose === "rental") {
    const { matchedCount } = await Rental.updateOne(
      { _id: payment.rental, status: "pending_payment", holdExpiresAt: { $gt: new Date() } },
      { $set: { status: "payment_review" }, $unset: { holdExpiresAt: "" } },
      { session },
    );
    if (matchedCount === 0) {
      throw new ErrorResponse("This booking has expired. Please book again.", 400);
    }
  }

  payment.proof = {
    transactionId: tid,
    senderNumber,
    senderName,
    screenshot: { public_id: asset.public_id, name: asset.name },
    submittedAt: new Date(),
  };
  payment.status = "submitted";
  payment.expiresAt = undefined;

  const saved = await payment.save({ session });

  audit("payment.proof_submitted", {
    target: { type: "Payment", id: payment._id },
    metadata: {
      reference: payment.reference,
      amount: payment.amount,
      purpose: payment.purpose,
      transactionId: tid,
      senderNumber,
    },
  });

  return saved;
};

// --- Admin

export const getAdminPayments = async (req) => {
  const data = await helper.paginate(Payment, req, {
    sort: { createdAt: -1 },
    searchFields: ["reference", "proof.transactionId", "proof.senderNumber"],
    filterFields: ["status", "purpose", "method", "user", "reference"],
    populate: [
      { path: "user", select: "name email" },
      {
        path: "rental",
        select: "bookId startDate endDate status",
        populate: { path: "bookId", select: "title" },
      },
      { path: "userPackage", select: "snapshot status" },
    ],
  });

  data.results = data.results.map((p) => ({
    ...p,
    screenshotUrl: signedScreenshotUrl(p.proof?.screenshot?.public_id),
  }));

  return data;
};

const loadForReview = async (paymentId, session) => {
  const payment = await Payment.findById(paymentId).populate("user", "email name").session(session);
  if (!payment) throw new ErrorResponse("Payment not found", 404);
  if (payment.status !== "submitted") {
    throw new ErrorResponse(
      `Only submitted payments can be reviewed (this one is ${payment.status}).`,
      400,
    );
  }
  return payment;
};

export const approvePayment = async (paymentId, adminId, session = null) => {
  const payment = await loadForReview(paymentId, session);
  const now = new Date();
  let summary;

  if (payment.purpose === "rental") {
    const rental = await Rental.findById(payment.rental)
      .populate("bookId", "title")
      .session(session);
    if (!rental || rental.status !== "payment_review") {
      throw new ErrorResponse("The booking for this payment is no longer awaiting review.", 409);
    }
    rental.status = rental.startDate <= now ? "active" : "scheduled";
    await rental.save({ session });
    summary = `Your rental of "${rental.bookId?.title}" is confirmed. Reading opens ${rental.startDate <= now ? "now" : `on ${rental.startDate.toDateString()}`}.`;
  } else {
    const pkg = await UserPackage.findById(payment.userPackage).session(session);
    if (!pkg || pkg.status !== "pending_payment") {
      throw new ErrorResponse("The package for this payment is no longer awaiting payment.", 409);
    }
    pkg.status = "active";
    pkg.activatedAt = now;
    pkg.expiresAt = new Date(now.getTime() + pkg.snapshot.validityDays * DAY_MS);
    await pkg.save({ session });
    summary = `Your "${pkg.snapshot.name}" package is active: ${pkg.creditsTotal} credits, valid until ${pkg.expiresAt.toDateString()}.`;
  }

  payment.status = "approved";
  payment.reviewedBy = adminId;
  payment.reviewedAt = now;
  await payment.save({ session });

  audit("admin.payment.approve", {
    target: { type: "Payment", id: payment._id },
    metadata: {
      reference: payment.reference,
      amount: payment.amount,
      purpose: payment.purpose,
      transactionId: payment.proof?.transactionId,
      user: payment.user?._id,
    },
  });

  const email = payment.user?.email;
  afterCommit(() => notifyUser(email, "Payment confirmed", summary));

  return payment;
};

export const rejectPayment = async (paymentId, adminId, reason, session = null) => {
  const payment = await loadForReview(paymentId, session);
  const now = new Date();

  if (payment.purpose === "rental") {
    await Rental.updateOne(
      { _id: payment.rental, status: "payment_review" },
      { $set: { status: "cancelled", cancelReason: "payment_rejected", cancelledAt: now } },
      { session },
    );
  } else {
    await UserPackage.updateOne(
      { _id: payment.userPackage, status: "pending_payment" },
      { $set: { status: "rejected" } },
      { session },
    );
  }

  payment.status = "rejected";
  payment.rejectionReason = reason;
  payment.reviewedBy = adminId;
  payment.reviewedAt = now;
  await payment.save({ session });

  audit("admin.payment.reject", {
    severity: "warning",
    target: { type: "Payment", id: payment._id },
    metadata: {
      reference: payment.reference,
      amount: payment.amount,
      purpose: payment.purpose,
      transactionId: payment.proof?.transactionId,
      user: payment.user?._id,
      reason,
    },
  });

  const email = payment.user?.email;
  const message = `We couldn't confirm your payment ${payment.reference}. Reason: ${reason}`;
  afterCommit(() => notifyUser(email, "Payment not confirmed", message));

  return payment;
};

/** Admin records the outcome of a manual refund. */
export const resolveRefund = async (paymentId, { status, note }, session = null) => {
  if (!["refunded", "declined"].includes(status)) {
    throw new ErrorResponse("Refund status must be refunded or declined.", 400);
  }

  const payment = await Payment.findById(paymentId).session(session);
  if (!payment || payment.refund?.status !== "requested") {
    throw new ErrorResponse("No pending refund for this payment.", 404);
  }

  payment.refund.status = status;
  payment.refund.note = note;
  await payment.save({ session });

  audit(`admin.refund.${status}`, {
    target: { type: "Payment", id: payment._id },
    metadata: { reference: payment.reference, amount: payment.amount, note },
  });

  return payment;
};
