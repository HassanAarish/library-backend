import mongoose from "mongoose";

export const inTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  req.mongoSession = session;

  res.on("finish", async () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      try {
        await session.commitTransaction();
      } catch (error) {
        console.error("Transaction commit error:", error);
      } finally {
        session.endSession();
      }
    } else {
      try {
        await session.abortTransaction();
      } catch (error) {
        console.error("Transaction rollback error:", error);
      } finally {
        session.endSession();
      }
    }
  });

  next();
};

// Helper to run a specific block of code in a transaction.
export const runInTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
