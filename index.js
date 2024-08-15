import express from "express";
import connectDB from "./db/mongodb.js";
import router from "./routes/indexRoute.js";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
const swaggerFile = JSON.parse(readFileSync("./utils/swagger.json"));

const app = express();
const port = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(router);

connectDB();

// Serve Swagger documentation

app.use("/api", swaggerUi.serve, (...args) =>
  swaggerUi.setup(swaggerFile)(...args)
);

app.listen(port, () => {
  console.log(`The server is successfully running on port ${port}`);
});
