import cron from "node-cron";
import { connection } from "../config/db.js";
import User from "../models/User.Model.js";

const cleanupUnverifiedUsers = async () => {
  const session = await connection.startSession();
  session.startTransaction();

  try {
    console.log("🚀 ~ Running cleanup task...");
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = await User.deleteMany({
      isVerified: false,
      createdAt: { $lt: tenMinutesAgo },
    }).session(session);

    await session.commitTransaction();
    session.endSession();

    console.log(`🚀 ~ Deleted ${result.deletedCount} unverified users.`);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("🚀 ~ Error deleting unverified users:", error);
  }
};

// Schedule the task to run every 10 minutes
cron.schedule("*/10 * * * *", cleanupUnverifiedUsers);
