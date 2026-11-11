import User from "../../models/User.Model.js";
import Preferences from "../../models/Preferences.Model.js";
import mongoose from "mongoose";
import { writeLog } from "../../utils/fileLogger.js";
import { audit } from "../../utils/audit.js";

export const cleanupUnverifiedUsers = async () => {
  // Ensure we have a connection before running
  if (mongoose.connection.readyState !== 1) {
    console.log("🚀 ~ DB not connected. Skipping cleanup...");
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("🚀 ~ Running cleanup task...");
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Older than 10 minutes AND no code still valid — a user who just asked
    // for a new OTP keeps their account until that code expires.
    const filter = {
      isVerified: false,
      deletedAt: { $exists: false }, // anonymised accounts keep their records
      createdAt: { $lt: tenMinutesAgo },
      $or: [{ "otp.expiry": { $lt: now } }, { "otp.expiry": { $exists: false } }],
    };

    // 1. Fetch the users first — deleteMany only returns a count, so we read
    //    the docs now to know exactly who gets removed (for the audit log).
    const staleUsers = await User.find(filter).select("_id name email createdAt").session(session);

    if (staleUsers.length === 0) {
      await session.commitTransaction();
      console.log("🚀 ~ No unverified users to delete.");
      return;
    }

    // 2. Delete the users AND their linked preferences in the same transaction
    //    (registration creates both, so cleaning only Users would orphan the
    //    Preferences docs).
    const ids = staleUsers.map((u) => u._id);
    const result = await User.deleteMany({ _id: { $in: ids } }, { session });
    await Preferences.deleteMany({ userId: { $in: ids } }, { session });

    await session.commitTransaction();

    // 3. Write each deleted user to the audit log AFTER a successful commit.
    staleUsers.forEach((u) => {
      writeLog(
        "deleted-users.log",
        `Deleted unverified user | id=${u._id} | name=${u.name} | email=${u.email} | createdAt=${u.createdAt.toISOString()}`,
      );
      audit("system.user.delete_unverified", {
        actorEmail: "system",
        target: { type: "User", id: u._id },
        metadata: { name: u.name, email: u.email, createdAt: u.createdAt },
      });
    });

    console.log(`🚀 ~ Deleted ${result.deletedCount} unverified users.`);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("🚀 ~ Error deleting unverified users:", error);
  } finally {
    session.endSession();
  }
};
