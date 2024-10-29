import express from "express";
import cloudinary from "cloudinary";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import errorHandler from "./middlewares/errorHandler.js";
import router from "./routes/indexRoute.js";
import { connectDB } from "./config/db.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import "./cron/userCleanUp.cron.js";

const app = express();

dotenv.config();

connectDB();
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(
  cors({
    origin: "*",
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use("/v1/logs", express.static(path.join(__dirname, "/logs")));
app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    limit: "50mb",
    extended: true,
  })
);

const PORT = process.env.PORT || 5000;

app.use(router);

app.listen(PORT, () => {
  console.log(
    `🚀 ~ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  );
});

app.use(errorHandler);

export default app;
