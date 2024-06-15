import User from "../models/user.js";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/generateTokens.js";

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
      userRole: req.body.userRole || "user",
      isAdmin: req.body.isAdmin || false,
    });

    // Save the user to the database
    await newUser.save();
    const token = generateToken(newUser);

    res.status(201).json({
      message: "User created successfully",
      token,
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
    const user = await User.findOne({
      email: email,
    });
    if (!user) {
      return res.status(404).json({
        message: "User not found with corresponding email",
      });
    }
    // const checkPassword = user.rows[0].password === password;
    bcrypt.compare(password, user.password, function (err, result) {
      console.log("result ", result);
      if (result !== true) {
        return res.status(403).json({
          message: "Incorrect password",
        });
      } else {
        const token = generateToken(user);
        res.status(200).json({
          message: "Login successful",
          data: user,
          token,
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

export const adminUser = async (req, res) => {
  const { name, email, password, isAdmin, userRole } = req.body;

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
        message: "Admin already exists",
      });
    }

    // Hash the password - Bcrypt method
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newAdmin = new User({
      name,
      email,
      password: hashedPassword,
      userRole: req.body.userRole || "user",
      isAdmin: req.body.isAdmin || true,
    });

    // Save the user to the database
    await newAdmin.save();
    const token = generateToken(newAdmin);

    res.status(201).json({
      message: "New Admin registered successfully",
      token,
    });
  } catch (error) {
    console.error("Error creating new Admin:", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getUserProfile = async (req, res) => {
  const user = await User.findById(req.userID)
    .select("-password")
    .populate("isAdmin")
    .populate("order");
  res.status(200).json({
    success: true,
    data: user,
  });
};

export const loggedInUser = async (req, res) => {};
