import Book from "../models/Book.js";
import User from "../models/user.js";
import bcrypt from "bcrypt";

export const getAllbooks = async (req, res) => {
  try {
    const books = await Book.find({});
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({
      message: "Unable to find the book, please re-enter the book title !",
    });
  }
};

export const getBook = async (req, res) => {
  try {
    const { title } = req.params;
    const book = await Book.findByTitle(title);
    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({
      message: "Wrong Book Title inserted, please reenter the Book Title! ",
    });
  }
};

export const getByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    console.log(category);
    const books = await Book.findByCategory();
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

export const addBook = async (req, res) => {
  try {
    const book = await Book.create(req.body);
    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({
      message: "Unable to add the book, Kindly re-enter the details !",
    });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { title } = req.params;
    const book = await Book.findByTitleAndUpdate(title, req.body);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    const updatedBook = await Book.findById(id);
    res.status(200).json(updatedBook);
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Book Selected for updating, kindly re-enter the book title! ",
    });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { title } = req.params;
    const book = await Book.findByIdAndDelete(title);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json({ message: "Book Deleted Successfully! " });
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Title entered for deleting, kindly re-enter the Book Title! ",
    });
  }
};

export const createUser = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if all fields are provided
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please enter all fields!",
      });
    }

    // if Check for user email.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // Hash the password - Bcrypt method
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    // Save the user to the database
    await newUser.save();

    res.status(201).json({
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      message: "Internal server error",
    });
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
    const user = await User.findByEmail(email);
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
