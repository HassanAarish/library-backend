import bcrypt from "bcryptjs";
import User from "../models/User.Model.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import { generateToken } from "../utils/generateTokens.js";
import { passwordResetEmail, sendOtp } from "../utils/emailClient.js";
import { connection } from "../config/db.js";
import crypto from "crypto";

// Registration Controllers

export const register = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password, authType } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    if (!firstName || !lastName || !email || !password) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("Please provide all required fields.", 400)
      );
    }

    const userExist = await User.findOne({ email }).session(session);
    if (userExist) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("User with the same email already exists", 401)
      );
    }

    if (authType === "email") {
      const passwordHash = await bcrypt.hash(password, 10);
      const otp = Math.floor(100000 + Math.random() * 900000);
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5);

      const user = new User({
        firstName,
        lastName,
        email,
        password: passwordHash,
        authType,
        otp: { code: otp, expiry },
        isVerified: false,
      });
      await user.save({ session });

      const info = await sendOtp(email, otp);
      console.log("OTP: ", otp);

      if (info instanceof Error) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Error sending OTP", 500));
      }

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({
        success: true,
        message: "OTP sent. Please verify to complete registration.",
      });
    } else if (authType === "google" || authType === "apple") {
      // For social logins, you may skip OTP or handle verification differently
      const userData = {
        firstName,
        lastName,
        email,
        authType,
        isVerified: false,
      };

      const [user] = await User.create([userData], { session });
      console.log("User registered: ", user);

      await session.commitTransaction();
      session.endSession();

      const token = generateToken(user);

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({
        success: true,
        message: "OTP sent. Please verify to complete registration.",
      });
    } else if (authType === "google" || authType === "apple") {
      if (!firstName || !lastName || !email) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Please provide all fields", 400));
      }

      let userData = {
        firstName,
        lastName,
        email,
        authType,
        otp: { code: otp, expiry },
        isVerified: false,
      };
      const user = await User.create([userData], { session });
      await session.commitTransaction();
      session.endSession();

      // generate a token
      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        data: user,
        token,
      });
    } else {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Invalid authentication type", 500));
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

export const verifyOtp = asyncHandler(async (req, res, next) => {
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

    // Validate OTP existence and matching
    if (!user.otp || user.otp.code !== otp) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Invalid OTP", 400));
    }

    // Check if the OTP has expired
    if (user.otp.expiry < new Date()) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("OTP expired", 400));
    }

    // Clear OTP after successful verification and mark user as verified
    user.otp = undefined;
    user.isVerified = true;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: user,
      token,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

// Login Controller

export const login = asyncHandler(async (req, res, next) => {
  const { email, password, authType } = req.body;
  try {
    if (!email || !password) {
      return next(new ErrorResponse("Please provide email and password", 400));
    }

    if (authType === "email") {
      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }

      const newUser = await User.findOne({ email }).select("-password");
      const token = generateToken(newUser);
      return res.status(201).json({
        success: true,
        data: newUser,
        token: token,
      });
    } else if (authType === "google" || authType === "apple") {
      const user = await User.findOne({ email }).select("-password");

      if (!user) {
        return next(new ErrorResponse("Invalid credentials", 401));
      }
      const token = generateToken(user);

      return res.status(201).json({
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

// Password Reset Controller

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();
    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;

    const resetEmail = await passwordResetEmail(email, resetUrl);

    if (resetEmail instanceof Error) {
      return next(new ErrorResponse("Error sending password reset email", 500));
    }

    return res.status(201).json({
      success: true,
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return next(new ErrorResponse("Invalid or Expired Link", 400));
    }

    const hashPassword = await bcrypt.hash(password, 10);
    user.password = hashPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpiry = undefined;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    next(error);
  }
});

// Instructor Registration

export const adminRegister = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password, userRole, authType } = req.body;

  const session = await connection.startSession();
  session.startTransaction();

  try {
    if (authType === "email") {
      if (!firstName || !lastName || !email || !password || !userRole) {
        await session.abortTransaction();
        session.endSession();
        return next(
          new ErrorResponse("Please provide all required fields.", 400)
        );
      }

      if (authType === "email") {
        // Check if either email already exists
        const userExist = await User.findOne({ email }).session(session);

        if (userExist) {
          await session.abortTransaction();
          session.endSession();
          return next(
            new ErrorResponse("User with same email already exist", 401)
          );
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

        const user = await User({
          firstName,
          lastName,
          email,
          password: passwordHash,
          userRole,
          authType,
        });
        await user.save({ session });

        const info = await sendOtp(email, otp);
        console.log("OTP: ", otp);

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
        if (!firstName || !lastName || !email) {
          await session.abortTransaction();
          session.endSession();
          return next(new ErrorResponse("Please provide all fields", 400));
        }

        let userData = {
          firstName,
          lastName,
          email,
          userRole,
          authType,
          otp: { code: otp, expiry },
          isVerified: false,
        };
        const user = await User.create([userData], { session });
        await session.commitTransaction();
        session.endSession();

        // generate a token
        const token = generateToken(user);

        return res.status(201).json({
          success: true,
          data: user,
          token,
        });
      } else {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse("Invalid authentication type", 500));
      }
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});
