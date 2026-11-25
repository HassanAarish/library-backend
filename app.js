import express from "express";
import cloudinary from "cloudinary";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import errorHandler from "./middlewares/errorHandler.js";
import router from "./routes/indexRoutes.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import setupMorganLogger from "./config/morgan.js";
import { getEnv } from "./config/dotenv.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";
import requestLogger from "./middlewares/requestLogger.js";
import verifyToken from "./middlewares/verifyToken.js";
import verifyRole from "./middlewares/verifyRole.js";

/**
 * The Express app only: no database connection, no listening port, no cron.
 * server.js starts those; tests import this file directly.
 */

const PORT = getEnv("PORT");
const NODE_ENV = getEnv("NODE_ENV");

// Comma-separated list of allowed frontend origins (no trailing slash).
export const CORS_ORIGINS = (
  getEnv("CORS_ORIGINS") ||
  getEnv("CLIENT_URL") ||
  "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

cloudinary.v2.config({
  cloud_name: getEnv("CLOUDINARY_CLOUD_NAME"),
  api_key: getEnv("CLOUDINARY_API_KEY"),
  api_secret: getEnv("CLOUDINARY_API_SECRET"),
});

const app = express();

// Trust the first proxy (Render/Heroku/etc.) so req.ip reflects the real client
// IP — required for accurate per-IP rate limiting and activity logs.
app.set("trust proxy", 1);

// First: every request gets an id + context and is recorded in the activity log.
app.use(requestLogger);

app.use(helmet());

setupMorganLogger(app);

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-Id"],
  }),
);

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

// Serve the log files from where they're actually written (config/logs).
// Admin-only: these files contain request metadata and user emails.
app.use(
  "/v1/logs",
  verifyToken,
  verifyRole("admin"),
  express.static(path.join(__dirname, "config", "logs")),
);

// File uploads go through multer, so JSON bodies never need to be large.
app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Loose global safety net (200 req/min/IP). Strict per-endpoint limits live on
// the auth routes themselves.
app.use(globalLimiter);

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    port: PORT,
    mode: NODE_ENV,
    message: "Server is up and running",
  });
});

app.use(router);

app.use(errorHandler);

export default app;
