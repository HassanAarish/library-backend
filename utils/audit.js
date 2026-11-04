import AuditLog from "../models/AuditLog.Model.js";
import { getContext } from "./requestContext.js";
import { redact } from "./redact.js";
import { writeLog } from "./fileLogger.js";

/**
 * Record an audit event. Fire-and-forget: callers never await it and it never
 * throws, so logging can't break or slow a request.
 *
 * Deliberately written WITHOUT the request's Mongo transaction: failed attempts
 * (bad password, wrong OTP, …) end in an aborted transaction, and those are
 * exactly the events we most need to keep. If Mongo is unavailable the event
 * falls back to config/logs/audit-fallback.log.
 *
 * Actor, IP, user agent and request id default to the current request context.
 *
 * @param {string} action - dotted event name, e.g. "auth.login"
 * @param {object} [details]
 * @param {"success"|"failure"} [details.outcome]
 * @param {"info"|"warning"|"critical"} [details.severity] - defaults to "warning" for failures
 * @param {string} [details.actor] - user id, when it differs from the logged-in user
 * @param {string} [details.actorEmail]
 * @param {{type: string, id: string}} [details.target]
 * @param {object} [details.metadata] - extra context (redacted before storing)
 */
export const audit = (action, details = {}) => {
  const ctx = getContext();
  const {
    outcome = "success",
    severity = outcome === "failure" ? "warning" : "info",
    actor = ctx.userId,
    actorEmail = ctx.userEmail,
    target,
    metadata,
  } = details;

  const entry = {
    action,
    outcome,
    severity,
    actor,
    actorEmail,
    actorRole: ctx.role,
    target: target ? { type: target.type, id: target.id && String(target.id) } : undefined,
    metadata: metadata ? redact(metadata) : undefined,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  AuditLog.create(entry).catch((err) => {
    console.error("Audit log write failed:", err.message);
    writeLog("audit-fallback.log", JSON.stringify(entry));
  });
};
