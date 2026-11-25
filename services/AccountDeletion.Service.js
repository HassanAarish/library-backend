import mongoose from "mongoose";
import User from "../models/User.Model.js";
import Preferences from "../models/Preferences.Model.js";
import Rental from "../models/Rental.Model.js";
import Payment from "../models/Payment.Model.js";
import UserPackage from "../models/UserPackage.Model.js";
import Notification from "../models/Notification.Model.js";
import PushDevice from "../models/PushDevice.Model.js";
import BookRequest from "../models/BookRequest.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { audit } from "../utils/audit.js";
import { afterCommit } from "../utils/requestContext.js";
import { notifyUsers } from "../utils/emailClient.js";
import { disconnectUser } from "../realtime/socket.js";
import { removeFiles } from "./Common.Service.js";

/**
 * Readers can delete their account themselves (Google Play requires it in the
 * app; the website offers the same).
 *
 * 1. Request: allowed only when nothing is still running (a rental being read
 *    or booked, a payment or refund in progress). Unused plan credits must be
 *    given up explicitly. The account closes at once: every session ends and
 *    nothing more is sent to it.
 * 2. Grace period: signing in again within GRACE_DAYS cancels the deletion.
 * 3. Then (cron) the account is anonymised: personal details, preferences,
 *    notifications and phones are removed. Payments, rentals and audit records
 *    are kept (the law and fraud prevention need them; the privacy policy says
 *    so) but no longer point to a person. Reviews and book requests stay,
 *    shown as "Former reader".
 */

export const GRACE_DAYS = 14;
const DAY = 86_400_000;
export const FORMER_NAME = "Former reader";

const rentalsOpen = (userId, session) =>
  Rental.aggregate([
    {
      $match: {
        renterId: new mongoose.Types.ObjectId(String(userId)),
        status: { $in: ["pending_payment", "payment_review", "scheduled", "active"] },
      },
    },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]).session(session);

const creditsLeft = async (userId, session) => {
  const plans = await UserPackage.find({
    user: userId,
    status: "active",
    expiresAt: { $gt: new Date() },
  })
    .select("creditsTotal creditsUsed")
    .session(session)
    .lean();
  return plans.reduce((sum, p) => sum + Math.max(0, p.creditsTotal - p.creditsUsed), 0);
};

/**
 * What still stops this account from being deleted. Counts only; clients word
 * them (the app must not talk about payments).
 */
export const getDeletionStatus = async (userId, session = null) => {
  const [rentals, plansOpen, refundsOpen, credits] = await Promise.all([
    rentalsOpen(userId, session),
    // Rental payments follow their rental's status; plan payments stand alone.
    Payment.countDocuments({
      user: userId,
      purpose: "package",
      status: { $in: ["awaiting_proof", "submitted"] },
    }).session(session),
    Payment.countDocuments({ user: userId, "refund.status": "requested" }).session(session),
    creditsLeft(userId, session),
  ]);

  const by = Object.fromEntries(rentals.map((r) => [r._id, r.n]));
  const blockers = {
    reading: by.active ?? 0,
    upcoming: by.scheduled ?? 0,
    // Bookings and plans waiting to be confirmed.
    unconfirmed: (by.pending_payment ?? 0) + (by.payment_review ?? 0) + plansOpen,
    refunds: refundsOpen,
  };
  const blocked = Object.values(blockers).some((n) => n > 0);

  return { canDelete: !blocked, blockers, credits, graceDays: GRACE_DAYS };
};

/** Close the account now; it's deleted after the grace period. */
export const requestDeletion = async (userId, { password, giveUpCredits = false }, session) => {
  const user = await User.findById(userId).select("+password").session(session);
  if (!user || user.deletedAt) throw new ErrorResponse("Account not found.", 404);
  if (user.role === "admin") {
    throw new ErrorResponse("Admin accounts can't be deleted here. Ask another admin.", 403);
  }

  // Accounts with a password confirm with it; social accounts can't.
  if (user.password) {
    if (!password || !(await user.comparePassword(password))) {
      audit("account.deletion_requested", {
        outcome: "failure",
        actor: user._id,
        actorEmail: user.email,
        metadata: { reason: "wrong_password" },
      });
      // 400, not 401: the session is fine, and a 401 signs the reader out.
      throw new ErrorResponse("That password isn't right.", 400);
    }
  }

  const status = await getDeletionStatus(userId, session);
  if (!status.canDelete) {
    throw new ErrorResponse(
      "Your account still has bookings or payments in progress. Finish them first.",
      409,
    );
  }
  if (status.credits > 0 && !giveUpCredits) {
    throw new ErrorResponse("Confirm that you're giving up your unused credits.", 409);
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + GRACE_DAYS * DAY);

  if (status.credits > 0) {
    await UserPackage.updateMany(
      { user: userId, status: "active" },
      { $set: { status: "cancelled" } },
      { session },
    );
  }

  user.deletion = { requestedAt: now, scheduledFor };
  // Every existing session ends (verifyToken rejects older tokens).
  user.passwordChangedAt = now;
  await user.save({ session, validateModifiedOnly: true });
  await PushDevice.deleteMany({ user: userId }, { session });

  audit("account.deletion_requested", {
    actor: user._id,
    actorEmail: user.email,
    metadata: { scheduledFor, creditsGivenUp: status.credits },
  });

  const email = user.email;
  afterCommit(() => {
    disconnectUser(userId, "account:closed");
    notifyUsers(
      [email],
      "Your LibraryHub account will be deleted",
      `We've closed your account as you asked. It will be deleted for good on ${scheduledFor.toDateString()}. Changed your mind? Just sign in before then and everything stays as it was. If you didn't ask for this, sign in now and change your password.`,
    );
  });

  return { scheduledFor };
};

/**
 * Called on every completed sign-in: an account waiting to be deleted is kept.
 * @returns {Promise<boolean>} true if a deletion was cancelled
 */
export const cancelDeletionOnSignIn = async (user, session = null) => {
  if (!user?.deletion?.scheduledFor) return false;
  user.deletion = undefined;
  // The session being issued now must work even within the same second as the
  // deletion request (JWT times are whole seconds); older sessions stay ended.
  user.passwordChangedAt = new Date(Date.now() - 1000);
  await user.save({ session, validateModifiedOnly: true });
  audit("account.deletion_cancelled", { actor: user._id, actorEmail: user.email });
  return true;
};

/** Anonymise one account whose grace period is over. */
const purgeOne = async (user) => {
  const session = await mongoose.startSession();
  let picture;
  let done = false;
  try {
    await session.withTransaction(async () => {
      done = false;
      const fresh = await User.findById(user._id).session(session);
      // Signed in again meanwhile, or already done.
      if (!fresh?.deletion?.scheduledFor || fresh.deletion.scheduledFor > new Date()) return;
      if (fresh.deletedAt) return;

      const prefs = await Preferences.findOne({ userId: fresh._id }).session(session).lean();
      picture = prefs?.profilePicture?.public_id;

      await Promise.all([
        Preferences.deleteMany({ userId: fresh._id }, { session }),
        Notification.deleteMany({ recipient: fresh._id }, { session }),
        PushDevice.deleteMany({ user: fresh._id }, { session }),
        // Their notes on requests they followed are personal; the follow stays.
        BookRequest.updateMany(
          { "followers.user": fresh._id },
          { $unset: { "followers.$[mine].note": "" } },
          { arrayFilters: [{ "mine.user": fresh._id }], session },
        ),
      ]);

      await User.updateOne(
        { _id: fresh._id },
        {
          $set: {
            name: FORMER_NAME,
            email: `deleted-${fresh._id}@deleted.invalid`,
            deletedAt: new Date(),
            "deletion.completedAt": new Date(),
          },
          $unset: {
            password: "",
            googleId: "",
            facebookId: "",
            stripeCustomerId: "",
            twoFactor: "",
            otp: "",
            resetPassword: "",
          },
        },
        { session },
      );
      done = true;
    });
  } finally {
    await session.endSession();
  }
  if (!done) return false;

  if (picture) {
    removeFiles(picture).catch((err) =>
      console.error(`Couldn't remove a deleted account's picture: ${err.message}`),
    );
  }
  audit("account.deleted", { actorEmail: "system", target: { type: "User", id: user._id } });
  notifyUsers(
    [user.email],
    "Your LibraryHub account has been deleted",
    "Your account and personal details have now been deleted. Thanks for reading with us.",
  );
  return true;
};

/** Cron: delete every account whose grace period is over. */
export const purgeDueAccounts = async () => {
  const due = await User.find({
    "deletion.scheduledFor": { $lte: new Date() },
    deletedAt: { $exists: false },
  })
    .select("_id email")
    .limit(100)
    .lean();
  let deleted = 0;
  for (const user of due) {
    try {
      if (await purgeOne(user)) deleted += 1;
    } catch (err) {
      console.error(`Account deletion failed for ${user._id}: ${err.message}`);
    }
  }
  return deleted;
};
