import Redis from "ioredis";
import { getEnv } from "./dotenv.js";

const REDIS_URL = getEnv("REDIS_URL");

/**
 * A single shared Redis client used by BOTH the rate limiter and the cache.
 * Optional: if REDIS_URL isn't set we export null and the consumers fall back
 * to in-memory implementations, so the app runs fine with zero external infra.
 *
 * To enable Redis (e.g. a free Upstash database) set:
 *   REDIS_URL=rediss://default:<password>@<host>:6379
 */
let redis = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    // Fail fast instead of hanging when Redis is unreachable, so callers can
    // fall back to memory rather than blocking the request.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });

  redis.on("connect", () => console.log("✅ Redis connected"));
  redis.on("error", (err) => console.error("Redis error:", err.message));
} else {
  console.log("ℹ️  REDIS_URL not set — rate limiting & cache use in-memory fallback");
}

export default redis;
