import bcrypt from "bcrypt";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import User from "../models/User.Model.js";
import { generateToken } from "../utils/generateTokens.js";

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if all fields are provided
    if (!name || !email || !password) {
      return next(new ErrorResponse("Please enter all fields!", 400));
    }

    // if Check for user email.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse("User already exists", 400));
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

    return res.status(201).json({
      message: "User created successfully",
      token,
    });
  } catch (error) {
    return next(error);
  }
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    if (email === "" || password === "") {
      return next(new ErrorResponse("Please enter all fields!", 400));
    }
    const user = await User.findOne({
      email: email,
    });
    if (!user) {
      return next(
        new ErrorResponse("User not found with the coresponding email", 404)
      );
    }
    bcrypt.compare(password, user.password, function (err, result) {
      if (result !== true) {
        return next(new ErrorResponse("Incorrect password", 403));
      } else {
        const token = generateToken(user);
        return res.status(200).json({
          message: "Login successful",
          data: user,
          token,
        });
      }
    });
  } catch (error) {
    return next(error);
  }
});

export const adminUser = asyncHandler(async (req, res) => {
  const { name, email, password, isAdmin, userRole } = req.body;

  try {
    // Check if all fields are provided
    if (!name || !email || !password) {
      return next(new ErrorResponse("Please enter all fields!", 400));
    }

    // if Check for user email.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse("Admin already exist", 400));
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
      data: newAdmin,
    });
  } catch (error) {
    return next(error);
  }
});
