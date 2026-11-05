import express from "express";
import http from "node:http";
import cloudinary from "cloudinary";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import errorHandler from "./middlewares/errorHandler.js";
import router from "./routes/indexRoutes.js";
import { connectDB } from "./config/db.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import "./cron/index.js";
import setupMorganLogger from "./config/morgan.js";
import { getEnv } from "./config/dotenv.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";
import requestLogger, { flushRequestLogs } from "./middlewares/requestLogger.js";
import verifyToken from "./middlewares/verifyToken.js";
import verifyRole from "./middlewares/verifyRole.js";
import { initSocket, closeSocket } from "./realtime/socket.js";

const PORT = getEnv("PORT");
const NODE_ENV = getEnv("NODE_ENV");
const CLOUDINARY_CLOUD_NAME = getEnv("CLOUDINARY_CLOUD_NAME");
const CLOUDINARY_API_KEY = getEnv("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = getEnv("CLOUDINARY_API_SECRET");

// Comma-separated list of allowed frontend origins (no trailing slash).
const CORS_ORIGINS = (getEnv("CORS_ORIGINS") || getEnv("CLIENT_URL") || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

// Trust the first proxy (Render/Heroku/etc.) so req.ip reflects the real client
// IP — required for accurate per-IP rate limiting and activity logs.
app.set("trust proxy", 1);

// First: every request gets an id + context and is recorded in the activity log.
app.use(requestLogger);

app.use(helmet());

setupMorganLogger(app);

connectDB();

cloudinary.v2.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

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

// One HTTP server for both the REST API and Socket.IO (same port).
const server = http.createServer(app);

initSocket(server, { origins: CORS_ORIGINS });

server.listen(PORT, () => {
  console.log(`🚀 ~ Server running in ${NODE_ENV} mode on port ${PORT}`);
});

// Write any buffered request logs before the process exits.
const shutdown = async (signal) => {
  console.log(`${signal} received — flushing activity logs...`);
  closeSocket();
  await flushRequestLogs();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
