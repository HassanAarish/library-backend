import mongoose from "mongoose";
import { getEnv } from "../config/dotenv.js";

const RETENTION_DAYS = Number(getEnv("REQUEST_LOG_RETENTION_DAYS")) || 90;

/**
 * One document per HTTP request. High volume, so it expires automatically after
 * REQUEST_LOG_RETENTION_DAYS (default 90). Changing the retention later needs a
 * `collMod` on the existing TTL index — Mongo won't update it on restart.
 */
const RequestLogSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true },
    method: { type: String },
    path: { type: String },
    query: { type: mongoose.Schema.Types.Mixed },
    body: { type: mongoose.Schema.Types.Mixed },
    files: [{ _id: false, name: String, size: Number, mimetype: String }],
    status: { type: Number },
    durationMs: { type: Number },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    error: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

RequestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
RequestLogSchema.index({ user: 1, createdAt: -1 });
RequestLogSchema.index({ ip: 1, createdAt: -1 });
RequestLogSchema.index({ status: 1, createdAt: -1 });
RequestLogSchema.index({ requestId: 1 });

const RequestLog = mongoose.model("RequestLog", RequestLogSchema);

export default RequestLog;
