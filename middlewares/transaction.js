import mongoose from "mongoose";

export const inTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  req.transaction = session;

  res.on("finish", async () => {
    // Only commit if the request was successful
    if (res.statusCode >= 200 && res.statusCode < 400) {
      if (session.inTransaction()) await session.commitTransaction();
    } else {
      if (session.inTransaction()) await session.abortTransaction();
    }
    session.endSession();
  });

  next();
};
