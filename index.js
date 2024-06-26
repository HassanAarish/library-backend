import express from "express";
import connectDB from "./db/mongodb.js";
import libraryRoutes from "./routes/routes.js";
import adminRoutes from "./routes/adminRoute.js";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
const Adminfile = JSON.parse(readFileSync("./utils/admin-api.json"));
const Userfile = JSON.parse(readFileSync("./utils/user-api.json"));

const app = express();
const port = 5000;

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

app.listen(port, () => {
  console.log(`The server is successfully running on port ${port}`);
});
