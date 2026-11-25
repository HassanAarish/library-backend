import mongoose from "mongoose";

/**
 * Append-only record of security-relevant and business events (logins, admin
 * actions, uploads, permission denials, …). Kept indefinitely — this is the
 * evidence trail for investigating fraud or abuse.
 */
const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. "auth.login", "admin.user.block"
    outcome: { type: String, enum: ["success", "failure"], default: "success" },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String },
    actorRole: { type: String },
    target: {
      type: { type: String }, // "User", "Book", "Category", "Asset", …
      id: { type: String },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ ip: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });
AuditLogSchema.index({ "target.id": 1 });
AuditLogSchema.index({ requestId: 1 });

// Guard against application code ever rewriting or erasing history.
const IMMUTABLE_OPS = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
];

AuditLogSchema.pre(IMMUTABLE_OPS, function () {
  throw new Error("Audit logs are append-only and cannot be modified or deleted.");
});

const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

export default AuditLog;
