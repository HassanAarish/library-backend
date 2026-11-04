import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context (requestId, ip, userAgent, and — once verifyToken runs —
 * userId/role/userEmail). Lets deep code like services call audit() without
 * threading `req` through every function signature.
 */
const storage = new AsyncLocalStorage();

export const runWithContext = (context, fn) => storage.run(context, fn);

// Returns an empty object outside a request (e.g. cron jobs) so callers never null-check.
export const getContext = () => storage.getStore() || {};
