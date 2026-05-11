import User from "../../models/User.Model.js";
import mongoose from "mongoose";

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

    const result = await User.deleteMany(
      {
        isVerified: false,
        createdAt: { $lt: tenMinutesAgo },
      },
      { session }
    );

    await session.commitTransaction();

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
