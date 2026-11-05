import mongoose from "mongoose";
import Payment from "../../models/Payment.Model.js";
import Rental from "../../models/Rental.Model.js";
import UserPackage from "../../models/UserPackage.Model.js";
import "../../models/Book.Model.js"; // registers the model used by populate("bookId")
import policy from "../../config/rentalPolicy.js";
import { audit } from "../../utils/audit.js";
import { availabilityChanged, notify } from "../../services/Notification.Service.js";
import { offerEarlyStart } from "../../services/rentalSlots.js";

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

/** Books whose slots changed: live viewers refetch; the next reader may start early. */
const slotsFreed = async (bookIds) => {
  for (const bookId of new Set(bookIds.map(String))) {
    availabilityChanged(bookId);
    await offerEarlyStart(bookId);
  }
};

/** Unpaid bookings past their hold release their slot; stale package payments lapse. */
const expirePaymentHolds = async () => {
  const now = new Date();

  const stale = await Rental.find({ status: "pending_payment", holdExpiresAt: { $lte: now } })
    .select("_id payment bookId renterId")
    .populate("bookId", "title")
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
    for (const r of stale) {
      audit("system.rental.hold_expired", {
        ...SYSTEM,
        target: { type: "Rental", id: r._id },
        metadata: { bookId: r.bookId?._id, renterId: r.renterId },
      });
      notify(r.renterId, {
        type: "rental.hold_expired",
        title: "Booking released",
        message: `Your booking of "${r.bookId?.title}" was released because the payment wasn't sent within ${policy.paymentHoldMinutes} minutes. You can book it again any time.`,
        data: { rentalId: r._id, bookId: r.bookId?._id },
        email: false,
      });
    }
    await slotsFreed(stale.map((r) => r.bookId?._id).filter(Boolean));
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
 * Keep stored statuses in step with the dates, and tell readers when a
 * booked rental opens or a rental ends. (Reading access is checked against
 * the dates directly, so this never delays access.)
 */
const advanceRentals = async () => {
  const now = new Date();

  const ending = await Rental.find({
    status: { $in: ["scheduled", "active"] },
    endDate: { $lte: now },
  })
    .select("_id bookId renterId")
    .populate("bookId", "title")
    .lean();

  if (ending.length) {
    await Rental.updateMany(
      { _id: { $in: ending.map((r) => r._id) }, status: { $in: ["scheduled", "active"] } },
      { $set: { status: "completed" } },
    );
    for (const r of ending) {
      notify(r.renterId, {
        type: "rental.ended",
        title: "Rental ended",
        message: `Your rental of "${r.bookId?.title}" has ended. We hope you enjoyed it!`,
        data: { rentalId: r._id, bookId: r.bookId?._id },
        email: false,
      });
    }
    await slotsFreed(ending.map((r) => r.bookId?._id).filter(Boolean));
  }

  const starting = await Rental.find({
    status: "scheduled",
    startDate: { $lte: now },
    endDate: { $gt: now },
  })
    .select("_id bookId renterId endDate")
    .populate("bookId", "title")
    .lean();

  if (starting.length) {
    await Rental.updateMany(
      { _id: { $in: starting.map((r) => r._id) }, status: "scheduled" },
      { $set: { status: "active" } },
    );
    for (const r of starting) {
      notify(r.renterId, {
        type: "rental.started",
        title: "Your book is ready to read",
        message: `Your rental of "${r.bookId?.title}" has started. Happy reading! It's yours until ${r.endDate.toDateString()}.`,
        data: { rentalId: r._id, bookId: r.bookId?._id },
      });
      availabilityChanged(r.bookId?._id);
    }
  }
};

const expirePackages = async () => {
  const now = new Date();
  const expiring = await UserPackage.find({ status: "active", expiresAt: { $lte: now } })
    .select("_id user creditsTotal creditsUsed snapshot")
    .lean();

  if (!expiring.length) return;

  await UserPackage.updateMany(
    { _id: { $in: expiring.map((p) => p._id) }, status: "active" },
    { $set: { status: "expired" } },
  );
  for (const p of expiring) {
    const unused = p.creditsTotal - p.creditsUsed;
    audit("system.package.expired", {
      ...SYSTEM,
      target: { type: "UserPackage", id: p._id },
      metadata: { user: p.user, unusedCredits: unused },
    });
    if (unused > 0) {
      notify(p.user, {
        type: "package.expired",
        title: "Package expired",
        message: `Your "${p.snapshot?.name}" package has expired with ${unused} unused credit${unused === 1 ? "" : "s"}.`,
        data: { userPackageId: p._id },
        email: false,
      });
    }
  }
};

/**
 * Remind users whose unused credits expire soon — once per threshold. Each
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
    });

    for (const pkg of packages) {
      const left = pkg.creditsTotal - pkg.creditsUsed;
      notify(pkg.user, {
        type: "package.expiring",
        title: "Your book credits expire soon",
        message: `You have ${left} unused credit${left === 1 ? "" : "s"} in your "${pkg.snapshot.name}" package. They expire on ${pkg.expiresAt.toDateString()}, so pick your next books before then!`,
        data: { userPackageId: pkg._id },
      });
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
