import User from "../../models/User.Model.js";
import Preferences from "../../models/Preferences.Model.js";
import mongoose from "mongoose";
import { writeLog } from "../../utils/fileLogger.js";

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
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const filter = { isVerified: false, createdAt: { $lt: tenMinutesAgo } };

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
