import express from "express";
import dotenv from "dotenv";
import connectDB from "./db/mongodb.js";
import libraryRoutes from "./routes/routes.js";
import adminRoutes from "./routes/adminRoute.js";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";

const Adminfile = JSON.parse(readFileSync("./utils/admin-api.json"));
const Userfile = JSON.parse(readFileSync("./utils/user-api.json"));

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/library", libraryRoutes);
app.use("/admin", adminRoutes);

connectDB();

// Serve Swagger documentation
app.use("/library-api", swaggerUi.serve, (...args) =>
  swaggerUi.setup(Userfile)(...args)
);

app.use("/api-admin", swaggerUi.serve, (...args) =>
  swaggerUi.setup(Adminfile)(...args)
);

app.listen(PORT, () => {
  console.log(
    `The server is runningin ${process.env.NODE_ENV} on port ${PORT}`
  );
});
