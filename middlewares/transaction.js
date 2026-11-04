import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

/**
 * Opens a Mongo transaction for the request (exposed as req.transaction).
 *
 * The transaction is committed BEFORE the response is sent: res.json is wrapped
 * so a 2xx/3xx body only goes out once the commit has succeeded. If the commit
 * fails, the client gets a 500 instead of a false "success". Error responses
 * (4xx/5xx) abort the transaction and roll back any queued Cloudinary uploads.
 */
export const inTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  req.transaction = session;

  req.cloudinaryCleanupQueue = [];

  let settled = false;

  const rollbackUploads = async () => {
    if (!req.cloudinaryCleanupQueue?.length) return;

    console.log("🔄 Rolling back Cloudinary uploads...");
    try {
      await Promise.all(req.cloudinaryCleanupQueue.map((id) => cloudinary.uploader.destroy(id)));
      console.log("✅ Cloudinary reversal complete.");
    } catch (err) {
      console.error("❌ Cloudinary reversal failed:", err);
    }
  };

  const settle = async (commit) => {
    if (settled) return;
    settled = true;

    try {
      if (session.inTransaction()) {
        if (commit) await session.commitTransaction();
        else await session.abortTransaction();
      }
    } finally {
      await session.endSession();
    }
  };

  const sendJson = res.json.bind(res);

  res.json = (body) => {
    const commit = res.statusCode < 400;

    settle(commit)
      .then(() => {
        if (!commit) rollbackUploads();
        sendJson(body);
      })
      .catch((err) => {
        console.error("❌ Transaction commit failed:", err);
        res.locals.errorMessage = `Transaction commit failed: ${err.message}`;
        rollbackUploads();
        res.status(500);
        sendJson({ success: false, error: "We couldn't save your changes. Please try again." });
      });

    return res;
  };

  // Client disconnected (or the response ended without res.json): never leave
  // the session open. A no-op if the transaction was already settled.
  res.on("close", () => {
    settle(false).catch((err) => console.error("Transaction cleanup failed:", err));
  });

  next();
};
