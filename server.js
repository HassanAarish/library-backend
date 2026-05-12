import express from "express";
import cloudinary from "cloudinary";
import cors from "cors";
import path from "path";
import errorHandler from "./middlewares/errorHandler.js";
import router from "./routes/indexRoutes.js";
import { connectDB } from "./config/db.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import "./cron/index.js";
import setupMorganLogger from "./config/morgan.js";
import { getEnv } from "./config/dotenv.js";

const PORT = getEnv("PORT");
const NODE_ENV = getEnv("NODE_ENV");
const CLOUDINARY_CLOUD_NAME = getEnv("CLOUDINARY_CLOUD_NAME");
const CLOUDINARY_API_KEY = getEnv("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = getEnv("CLOUDINARY_API_SECRET");

const app = express();

setupMorganLogger();

connectDB();

cloudinary.v2.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

app.use(
  cors({
    // 1. Specify your exact frontend URL (no trailing slash)
    origin: "http://localhost:5174",

    // 2. Allow cookies/authorization headers to be sent
    credentials: true,

    // 3. Optional: Specify allowed methods
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

app.use("/v1/logs", express.static(path.join(__dirname, "/logs")));

app.use(express.json({ limit: "50mb" }));

app.use(express.urlencoded({ limit: "50mb", extended: true }));

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

app.listen(PORT, () => {
  console.log(`🚀 ~ Server running in ${NODE_ENV} mode on port ${PORT}`);
});

export default app;
