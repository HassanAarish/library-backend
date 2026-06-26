import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

export const inTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  req.transaction = session;

  req.cloudinaryCleanupQueue = [];

  res.on("finish", async () => {
    // Only commit if the request was successful
    if (res.statusCode >= 200 && res.statusCode < 400) {
      if (session.inTransaction()) await session.commitTransaction();
    } else {
      if (session.inTransaction()) await session.abortTransaction();

      // --- CLOUDINARY REVERSAL LOGIC ---
      if (req.cloudinaryCleanupQueue?.length > 0) {
        console.log("🔄 Rolling back Cloudinary uploads...");
        try {
          // Delete all uploaded files in the queue
          await Promise.all(
            req.cloudinaryCleanupQueue?.map((id) => cloudinary.uploader.destroy(id)),
          );
          console.log("✅ Cloudinary reversal complete.");
        } catch (err) {
          console.error("❌ Cloudinary reversal failed:", err);
        }
      }
    }
    session.endSession();
  });

  next();
};
