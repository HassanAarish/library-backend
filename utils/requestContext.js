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

/**
 * Run `fn` once the current request's transaction has committed (emails,
 * socket events, … — side effects that must not fire for a rolled-back
 * change). Outside a transaction it runs right away. Errors are logged, never
 * thrown.
 */
export const afterCommit = (fn) => {
  const queue = storage.getStore()?.afterCommit;
  const run = () =>
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error("afterCommit:", err));

  if (queue) queue.push(run);
  else run();
};
