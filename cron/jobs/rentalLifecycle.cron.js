import mongoose from "mongoose";
import Payment from "../../models/Payment.Model.js";
import Rental from "../../models/Rental.Model.js";
import UserPackage from "../../models/UserPackage.Model.js";
import "../../models/User.Model.js"; // registers the model used by populate("user")
import policy from "../../config/rentalPolicy.js";
import { audit } from "../../utils/audit.js";
import { notifyUser } from "../../utils/emailClient.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const SYSTEM = { actorEmail: "system" };

// Skip quietly while the DB is down; never let one job crash the scheduler.
const runJob = (name, fn) => async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await fn();
  } catch (err) {
    console.error(`🚀 ~ Cron "${name}" failed:`, err);
  }
};

/** Unpaid bookings past their hold release their slot; stale package payments lapse. */
const expirePaymentHolds = async () => {
  const now = new Date();

  const stale = await Rental.find({ status: "pending_payment", holdExpiresAt: { $lte: now } })
    .select("_id payment bookId renterId")
    .lean();

  if (stale.length) {
    await Rental.updateMany(
      { _id: { $in: stale.map((r) => r._id) }, status: "pending_payment" },
      { $set: { status: "cancelled", cancelReason: "payment_timeout", cancelledAt: now } },
    );
    await Payment.updateMany(
      { _id: { $in: stale.map((r) => r.payment).filter(Boolean) }, status: "awaiting_proof" },
      { $set: { status: "expired" } },
    );
    stale.forEach((r) =>
      audit("system.rental.hold_expired", {
        ...SYSTEM,
        target: { type: "Rental", id: r._id },
        metadata: { bookId: r.bookId, renterId: r.renterId },
      }),
    );
  }

  const stalePackagePayments = await Payment.find({
    purpose: "package",
    status: "awaiting_proof",
    expiresAt: { $lte: now },
  })
    .select("_id userPackage")
    .lean();

  if (stalePackagePayments.length) {
    await Payment.updateMany(
      { _id: { $in: stalePackagePayments.map((p) => p._id) }, status: "awaiting_proof" },
      { $set: { status: "expired" } },
    );
    await UserPackage.updateMany(
      { _id: { $in: stalePackagePayments.map((p) => p.userPackage) }, status: "pending_payment" },
      { $set: { status: "cancelled" } },
    );
  }
};

/**
 * Keep stored statuses in step with the dates. (Reading access is checked
 * against the dates directly, so this only affects listings and counts.)
 */
const advanceRentals = async () => {
  const now = new Date();

  await Rental.updateMany(
    { status: { $in: ["scheduled", "active"] }, endDate: { $lte: now } },
    { $set: { status: "completed" } },
  );
  await Rental.updateMany(
    { status: "scheduled", startDate: { $lte: now }, endDate: { $gt: now } },
    { $set: { status: "active" } },
  );
};

const expirePackages = async () => {
  const now = new Date();
  const expiring = await UserPackage.find({ status: "active", expiresAt: { $lte: now } })
    .select("_id user creditsTotal creditsUsed")
    .lean();

  if (!expiring.length) return;

  await UserPackage.updateMany(
    { _id: { $in: expiring.map((p) => p._id) }, status: "active" },
    { $set: { status: "expired" } },
  );
  expiring.forEach((p) =>
    audit("system.package.expired", {
      ...SYSTEM,
      target: { type: "UserPackage", id: p._id },
      metadata: { user: p.user, unusedCredits: p.creditsTotal - p.creditsUsed },
    }),
  );
};

/**
 * Email users whose unused credits expire soon — once per threshold. Each
 * threshold covers its own window (e.g. 30 → 8–30 days left, 7 → 0–7 days) so a
 * package never gets two reminders on the same day.
 */
const sendPackageReminders = async () => {
  const now = new Date();
  const thresholds = [...policy.packageReminderDays].sort((a, b) => a - b);

  for (const [i, days] of thresholds.entries()) {
    const windowStart = new Date(now.getTime() + (i === 0 ? 0 : thresholds[i - 1]) * DAY_MS);
    const windowEnd = new Date(now.getTime() + days * DAY_MS);

    const packages = await UserPackage.find({
      status: "active",
      expiresAt: { $gt: windowStart, $lte: windowEnd },
      remindersSent: { $ne: days },
      $expr: { $lt: ["$creditsUsed", "$creditsTotal"] },
    }).populate("user", "email");

    for (const pkg of packages) {
      const left = pkg.creditsTotal - pkg.creditsUsed;
      notifyUser(
        pkg.user?.email,
        "Your book credits expire soon",
        `You have ${left} unused credit${left === 1 ? "" : "s"} in your "${pkg.snapshot.name}" package. They expire on ${pkg.expiresAt.toDateString()} — pick your next books before then!`,
      );
      await UserPackage.updateOne({ _id: pkg._id }, { $addToSet: { remindersSent: days } });
    }
  }
};

export const runRentalLifecycle = runJob("rental lifecycle", async () => {
  await expirePaymentHolds();
  await advanceRentals();
  await expirePackages();
});

export const runPackageReminders = runJob("package reminders", sendPackageReminders);
