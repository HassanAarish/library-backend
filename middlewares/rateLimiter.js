import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import redis from "../config/redis.js";

/**
 * Builds an Express rate-limit middleware. Backed by Redis when available, with
 * an in-memory `insuranceLimiter` so a Redis outage degrades to local limiting
 * instead of locking everyone out. Without REDIS_URL it's purely in-memory.
 */
const createLimiter = ({ keyPrefix, points, duration, blockDuration }) => {
  const memory = new RateLimiterMemory({
    keyPrefix: `${keyPrefix}_mem`,
    points,
    duration,
    blockDuration,
  });

  const limiter = redis
    ? new RateLimiterRedis({
        storeClient: redis,
        keyPrefix,
        points,
        duration,
        blockDuration,
        insuranceLimiter: memory,
      })
    : memory;

  return (req, res, next) => {
    limiter
      .consume(req.ip)
      .then(() => next())
      .catch((rejection) => {
        // A thrown Error (not a rate-limit result) means the limiter backend
        // itself failed — fail OPEN so users aren't locked out by infra issues.
        if (rejection instanceof Error) {
          console.error("Rate limiter error:", rejection.message);
          return next();
        }

        const retryAfter = Math.max(1, Math.ceil((rejection.msBeforeNext || 0) / 1000));
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          success: false,
          error: `Too many requests. Please try again in ${retryAfter}s.`,
        });
      });
  };
};

// Brute-force protection for credential/token checks (login, OTP/verify, reset).
export const authLimiter = createLimiter({
  keyPrefix: "rl_auth",
  points: 10, // 10 attempts...
  duration: 15 * 60, // ...per 15 minutes
  blockDuration: 15 * 60, // then blocked for 15 minutes
});

// Tighter cap for endpoints that send emails (register, forgot, resend) to
// prevent inbox flooding / mail-cost abuse.
export const emailLimiter = createLimiter({
  keyPrefix: "rl_email",
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// Loose global safety net across the whole API.
export const globalLimiter = createLimiter({
  keyPrefix: "rl_global",
  points: 200, // 200 requests...
  duration: 60, // ...per minute per IP
});
