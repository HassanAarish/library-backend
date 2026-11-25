import { randomUUID } from "node:crypto";
import RequestLog from "../models/RequestLog.Model.js";
import { runWithContext } from "../utils/requestContext.js";
import { redact } from "../utils/redact.js";
import { writeLog } from "../utils/fileLogger.js";

const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 100;
const MAX_BODY_CHARS = 4000;

// Requests that would only add noise.
const SKIP_PATHS = new Set(["/health"]);

let buffer = [];
let flushTimer = null;

/**
 * Writes buffered request logs in one insertMany instead of one insert per
 * request. Failures fall back to config/logs/request-fallback.log.
 */
export const flushRequestLogs = async () => {
  clearTimeout(flushTimer);
  flushTimer = null;

  const batch = buffer;
  buffer = [];
  if (batch.length === 0) return;

  try {
    await RequestLog.insertMany(batch, { ordered: false });
  } catch (err) {
    console.error("Request log write failed:", err.message);
    batch.forEach((entry) => writeLog("request-fallback.log", JSON.stringify(entry)));
  }
};

const enqueue = (entry) => {
  buffer.push(entry);

  if (buffer.length >= FLUSH_BATCH_SIZE) {
    flushRequestLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushRequestLogs, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

// Bodies are only kept for writes, and capped so one request can't bloat the store.
const captureBody = (req) => {
  if (req.method === "GET" || !req.body || Object.keys(req.body).length === 0) {
    return undefined;
  }

  const safe = redact(req.body);
  const serialized = JSON.stringify(safe);
  return serialized.length > MAX_BODY_CHARS
    ? { _truncated: true, preview: serialized.slice(0, MAX_BODY_CHARS) }
    : safe;
};

/**
 * Must be the first middleware: assigns a request id, opens the request context
 * used by audit(), and logs every request once the response has finished.
 */
const requestLogger = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  const context = {
    requestId,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  };

  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  res.on("finish", () => {
    if (SKIP_PATHS.has(req.path)) return;

    const [path] = req.originalUrl.split("?");

    enqueue({
      requestId,
      method: req.method,
      path,
      query: Object.keys(req.query || {}).length ? redact(req.query) : undefined,
      body: captureBody(req),
      files: req.files?.map((f) => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })),
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      // Filled in by verifyToken when the request is authenticated.
      user: context.userId,
      role: context.role,
      ip: context.ip,
      userAgent: context.userAgent,
      error: res.locals.errorMessage,
      createdAt: new Date(),
    });
  });

  runWithContext(context, next);
};

export default requestLogger;
