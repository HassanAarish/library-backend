import bcrypt from "bcrypt";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import User from "../models/User.Model.js";
import { generateToken } from "../utils/generateTokens.js";
import { connection } from "../config/db.js";
import Admin from "../models/Admin.Model.js";
import { sendOtp } from "../utils/emailClient.js";

// User Auth Controller

export const userRegister = asyncHandler(async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    dob,
    gender,
    authType,
  } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    // Check if all fields are provided
    if (authType === email) {
      if (
        !firstName ||
        !lastName ||
        !email ||
        !phoneNumber ||
        !password ||
        !dob ||
        !gender ||
        !authType
      ) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Please enter all fields!", 400));
      }

      // if Check for user email.
      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("User already exists", 400));
      }

      // Hash the password - Bcrypt method
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

      // Create a new user
      const newUser = await User.create({
        firstName,
        lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        dob,
        gender,
        authType,
        otp: { code: otp, expiry },
        isVerified: false,
      });

      // Save the user using the session
      await newUser.save({ session });
      const info = await sendOtp(email, otp); // This is assumed to be an async function

      if (info instanceof Error) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Error sending OTP", 500));
      }
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        success: true,
        message: "OTP sent. Please verify to complete registration.",
      });
    } else if (authType === "google" || authType === "apple") {
      if (!firstName || !lastName || !email || !dob) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Please provide all fields", 400));
      }

      const userData = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: phoneNumber,
        dob: dob,
        gender: gender,
        authType: authType,
        oauthToken: oauthToken,
        isVerified: true,
      };
      const user = await User.create([userData], { session });

      await session.commitTransaction();
      session.endSession();

      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        data: user,
        token,
      });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

export const userVerifyOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    const user = await User.findOne({ email }).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.otp.code !== otp) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Invalid OTP", 400));
    }

    if (user.otp.expiry < new Date()) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("OTP expired", 400));
    }

    user.otp = undefined; // Clear OTP after verification
    user.isVerified = true; // Mark user as verifie
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: user,
      token: token,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

export const userLogin = asyncHandler(async (req, res, next) => {
  const { email, phoneNumber, password, authType } = req.body;

  try {
    if ((!email && !phoneNumber) || !password) {
      return next(
        new ErrorResponse(
          "Please provide email or phone number and password",
          400
        )
      );
    }

    let user;

    const query = email ? { email } : { phoneNumber };

    if (authType === email || authType === phoneNumber) {
      user = await User.findOne(query).select("+password");

      if (!user) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const newUser = await User.findOne(query).select("-password");
      const token = generateToken(newUser);
      return res.status(200).json({
        success: true,
        data: newUser,
        token: token,
      });
    } else if (authType === "google" || authType === "apple") {
      user = await User.findOne({ ...query, authType }).select("-password");

      if (!user) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }
      const token = generateToken(user);

      return res.status(200).json({
        success: true,
        data: user,
        token: token,
      });
    } else {
      return next(new ErrorResponse("Invalid authentication type", 400));
    }
  } catch (error) {
    return next(error);
  }
});

// Admin Auth Contrller

export const adminRegister = asyncHandler(async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    dob,
    gender,
    authType,
  } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    // Check if all fields are provided
    if (authType === email) {
      if (
        !firstName ||
        !lastName ||
        !email ||
        !phoneNumber ||
        !password ||
        !dob ||
        !gender ||
        !authType
      ) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Please enter all fields!", 400));
      }

      // if Check for admin email.
      const existingAdmin = await Admin.findOne({ email }).session(session);
      if (existingAdmin) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Admin already exists", 400));
      }

      // Hash the password - Bcrypt method
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

      // Create a new admin
      const newAdmin = await Admin.create({
        firstName,
        lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        dob,
        gender,
        authType,
        otp: { code: otp, expiry },
        isVerified: false,
      });

      // Save the admin using the session
      await newAdmin.save({ session });
      const info = await sendOtp(email, otp); // This is assumed to be an async function

      if (info instanceof Error) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Error sending OTP", 500));
      }
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        success: true,
        message: "OTP sent. Please verify to complete registration.",
      });
    } else if (authType === "google" || authType === "apple") {
      if (!firstName || !lastName || !email || !dob) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Please provide all fields", 400));
      }

      const adminData = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: phoneNumber,
        dob: dob,
        gender: gender,
        authType: authType,
        oauthToken: oauthToken,
        isVerified: true,
      };
      const user = await Admin.create([adminData], { session });

      await session.commitTransaction();
      session.endSession();

      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        data: user,
        token,
      });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

export const adminVerifyOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    const admin = await Admin.findOne({ email }).session(session);

    if (!admin) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Admin not found", 404));
    }

    if (admin.otp.code !== otp) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Invalid OTP", 400));
    }

    if (admin.otp.expiry < new Date()) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("OTP expired", 400));
    }

    admin.otp = undefined; // Clear OTP after verification
    admin.isVerified = true; // Mark user as verifie
    await admin.save({ session });

    await session.commitTransaction();
    session.endSession();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: admin,
      token: token,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

export const adminLogin = asyncHandler(async (req, res, next) => {
  const { email, phoneNumber, password, authType } = req.body;

  try {
    if ((!email && !phoneNumber) || !password) {
      return next(
        new ErrorResponse(
          "Please provide email or phone number and password",
          400
        )
      );
    }

    let admin;

    const query = email ? { email } : { phoneNumber };

    if (authType === email || authType === phoneNumber) {
      admin = await Admin.findOne(query).select("+password");

      if (!admin) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const newAdmin = await Admin.findOne(query).select("-password");
      const token = generateToken(newAdmin);
      return res.status(200).json({
        success: true,
        data: newAdmin,
        token: token,
      });
    } else if (authType === "google" || authType === "apple") {
      admin = await Admin.findOne({ ...query, authType }).select("-password");

      if (!admin) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }
      const token = generateToken(admin);

      return res.status(200).json({
        success: true,
        data: admin,
        token: token,
      });
    } else {
      return next(new ErrorResponse("Invalid authentication type", 400));
    }
  } catch (error) {
    return next(error);
  }
});
