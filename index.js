import express from "express";
import connectDB from "./db/mongodb.js";
import route from "./routes/routes.js";

const app = express();
const port = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", route);

connectDB();

app.listen(port, () => {
  console.log(`The server is successfully running on port ${port}`);
});
