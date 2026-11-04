// Keys whose values must never reach a log, compared case-insensitively.
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "pendingtoken",
  "accesstoken",
  "refreshtoken",
  "otp",
  "code",
  "secret",
  "authorization",
  "apikey",
]);

const MAX_DEPTH = 5;
const MAX_STRING = 500;
const MAX_ARRAY = 20;

const walk = (value, depth) => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }

  if (typeof value !== "object") return value;

  if (depth >= MAX_DEPTH) return "[depth limit]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => walk(item, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`…[${value.length - MAX_ARRAY} more]`);
    return items;
  }

  if (value instanceof Date) return value;

  // ObjectIds and similar: keep their string form.
  if (typeof value.toHexString === "function") return value.toHexString();

  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : walk(inner, depth + 1);
  }
  return out;
};

/**
 * Deep-copies a value for logging: masks sensitive keys and bounds its size so a
 * huge or hostile payload can't bloat the log store.
 */
export const redact = (value) => walk(value, 0);
