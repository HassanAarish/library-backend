import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import path from "path";
import connectDB from "./config/db.js";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import router from "./routes/indexRoutes.js";
import cloudinary from "cloudinary";
import { Server } from "socket.io";
import { createServer } from "node:http";

const Swagger = JSON.parse(readFileSync("./utils/swagger.json"));

dotenv.config();

connectDB();
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5000;

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

app.use(router);

// Serve Swagger documentation
app.use("/api", swaggerUi.serve, (...args) =>
  swaggerUi.setup(Swagger)(...args)
);

app.listen(PORT, () => {
  console.log(
    `The server is running in ${process.env.NODE_ENV} on port ${PORT}`
  );
});
