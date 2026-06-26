import NodeCache from "node-cache";
import redis from "../config/redis.js";

/**
 * Tiny cache abstraction. Uses Redis when REDIS_URL is configured, otherwise an
 * in-process node-cache. All Redis paths fail soft (log + treat as a miss) so a
 * Redis hiccup never breaks a request — it just bypasses the cache.
 *
 * Values are JSON-serialized, so cache plain data (lean docs / POJOs), not live
 * Mongoose documents.
 */
const memory = new NodeCache({ stdTTL: 60, checkperiod: 120 });

const get = async (key) => {
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch (err) {
      console.error("Cache get error:", err.message);
      return undefined;
    }
  }
  return memory.get(key);
};

const set = async (key, value, ttlSeconds = 60) => {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      console.error("Cache set error:", err.message);
    }
    return;
  }
  memory.set(key, value, ttlSeconds);
};

const del = async (key) => {
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error("Cache del error:", err.message);
    }
    return;
  }
  memory.del(key);
};

/**
 * Delete every key starting with `prefix` — used to invalidate a whole group
 * (e.g. all cached pages of a list) after a write.
 */
const delByPrefix = async (prefix) => {
  if (redis) {
    try {
      const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
      const keys = [];
      for await (const batch of stream) keys.push(...batch);
      if (keys.length) await redis.del(...keys);
    } catch (err) {
      console.error("Cache delByPrefix error:", err.message);
    }
    return;
  }
  const keys = memory.keys().filter((k) => k.startsWith(prefix));
  if (keys.length) memory.del(keys);
};

/**
 * Cache-aside helper: return the cached value or run `fn`, cache it, return it.
 */
const wrap = async (key, ttlSeconds, fn) => {
  const cached = await get(key);
  if (cached !== undefined) return cached;

  const fresh = await fn();
  await set(key, fresh, ttlSeconds);
  return fresh;
};

export default { get, set, del, delByPrefix, wrap };
