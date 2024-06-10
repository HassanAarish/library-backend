import db from "../db/db.js";
import bcrypt, { hash } from "bcrypt";

export const addBook = async (req, res) => {
  console.log(req.body);
  const { title, category, author, price } = req.body;
  // GEt request for all books availabe in the library
  try {
    const result = await db.query(
      `INSERT INTO books(title, category, author, price) VALUES ('${title}', '${category}', '${author}', '${price}')`
    );
    // books = result.rows;
    console.log(result.rows);
    res.status(201).send(result.rows);
  } catch (err) {
    console.log("Error PG: ", err);
  }
};

export const getAllbooks = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM books WHERE isrented = 'false'`
    );
    console.log(result.rows);
    res.status(201).send(result.rows);
  } catch (err) {
    console.log("Error PG: ", err);
  }
};

export const filterByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    console.log(category);
    const books = await db.query(
      `SELECT * FROM books WHERE LOWER(category) LIKE '%${category}%'`
    );
    if (books.rowCount === 0) {
      return res.status(301).send({
        message: "Nothing found",
      });
    }
    res.status(200).send(books.rows);
  } catch (error) {
    console.log(error);
  }
};

export const createUser = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (name === "" && email === "" && password === "") {
      return res.status(404).json({
        message: "Please enter all fields!",
      });
    }

    const checkEmail = await db.query(
      `SELECT * FROM users WhERE email = '${email}'`
    );
    console.log(checkEmail.rows);
    if (checkEmail.rowCount !== 0) {
      return res.status(400).json({
        message: "User already exist",
      });
    }
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, async (err, hash) => {
      if (err) {
        console.log("Error hashing password:", err);
      } else {
        const result = await db.query(
          `INSERT INTO users (name, email, password) VALUES('${name}','${email}','${hash}')`
        );

        result.rowCount !== 0
          ? res.status(201).json({
              message: "User created successfully",
            })
          : res.status(400).json({
              message: "Internal error",
            });
      }
    });
  } catch (error) {
    console.log(error);
    res.status(400).send(error);
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (email === "" || password === "") {
      return res.status(400).json({
        message: "Please enter username and password",
      });
    }
    const user = await db.query(`SELECT * FROM users WhERE email = '${email}'`);
    if (user.rowCount === 0) {
      return res.status(404).json({
        message: "User not found with corresponding email",
      });
    }
    // const checkPassword = user.rows[0].password === password;
    bcrypt.compare(password, user.rows[0].password, function (err, result) {
      console.log("result ", result);
      if (result !== true) {
        return res.status(403).json({
          message: "Incorrect password",
        });
      } else {
        res.status(200).json({
          message: "Login successful",
          data: user.rows[0],
        });
      }
    });
  } catch (error) {
    console.error(error);
    res.status(403).json({
      error: error,
    });
  }
};
