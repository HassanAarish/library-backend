import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import db from "./db/db.js";
import {
  addBook,
  createUser,
  filterByCategory,
  getAllbooks,
  login,
} from "./controller/controller.js";
const app = express();
const port = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
await db.connect();

app.post("/add-book", addBook);

app.get("/", getAllbooks);

app.get("/filter/:category", filterByCategory);

app.post("/create-user", createUser);

app.post("/login", login);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
