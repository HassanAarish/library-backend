import crypto from "crypto";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { generateToken } from "../utils/generateTokens.js";
import helper from "../utils/helper.js";

function generateOTP() {
  const uniqueNumber = Math.floor(100000 + Math.random() * 900000);
  return uniqueNumber;
}

export const register = async (body, session = null) => {
  const { name, email, password, profilePicture, authType } = body;

  if (authType === "email") {
    // 1. Check if user exists (Pass the session!)
    const userExist = await User.findOne({ email }).session(session);

    if (userExist) {
      throw new ErrorResponse("User with the same email already exists", 401);
    }

    // 2. Generate OTP
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // 3. Create user
    const user = new User({
      name,
      email: helper.lowercaseEmail(email),
      password,
      authType,
      otp: { code: otp, expiry: expiry },
      isVerified: false,
    });
    console.log("otp", otp);
    await user.save({ session });

    // 4. Create User Preferences
    // We link it via user._id and save the profilePicture object from Cloudinary
    const preferences = new Preferences({
      userId: user._id,
      profilePicture: profilePicture || {}, // Save the {name, url, public_id} object
    });

    await preferences.save({ session });

    // Send OTP to user's email
    // const info = await sendOtp(email, otp);
    // if (info instanceof Error) {
    //   return next(new ErrorResponse("Error sending OTP", 500));
    // }

    return true;
  }

  // Redirect to Google or Facebook for social login
  // Handle Social Auth
  if (authType === "google" || authType === "facebook") {
    throw new ErrorResponse("Redirect to Social Provider", 302);
  }
  throw new ErrorResponse("Invalid authentication type", 400);
};

export const verifyOtp = async (body, session = null) => {
  const { email, otp } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({
    email: lowerEmail,
    "otp.code": otp,
  }).session(session);

  if (!user) {
    return next(new ErrorResponse("User not found or have been deleted.", 404));
  }

  // Validate OTP existence and matching
  if (user?.otp?.code != otp) {
    return next(new ErrorResponse("Invalid OTP", 400));
  }

  // Check if the OTP has expired
  if (user.otp.expiry < new Date()) {
    return next(new ErrorResponse("OTP expired", 400));
  }

  // Clear OTP after successful verification and mark user as verified
  user.otp = undefined;
  user.isVerified = true;
  await user.save({ session });
};

export const login = async (body, session = null) => {
  const { email, password, authType } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  // 1. Pass the session to the query
  const user = await User.findOne({ email: lowerEmail })
    .session(session)
    .select("+password");

  if (!user) {
    throw new ErrorResponse("Invalid credentials", 401);
  }

  // 2. Logic for Email Login
  if (authType === "email") {
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      throw new ErrorResponse("Invalid credentials", 401);
    }
  }
  // 3. Logic for Social Login
  else if (
    authType !== "google" &&
    authType !== "apple" &&
    authType !== "facebook"
  ) {
    // FIXED: Throwing instead of using 'next'
    throw new ErrorResponse("Invalid authentication type", 400);
  }

  // 4. Prepare response
  const token = generateToken(user);
  const userObj = user.toObject();
  delete userObj.password;

  return { user: userObj, token };
};

export const forgotPassword = async (body, session = null) => {
  const { email } = body;

  const lowerEmail = helper.lowercaseEmail(email);

  const user = await User.findOne({ email: lowerEmail }).session(session);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  const resetToken = crypto.randomBytes(20).toString("hex");

  user.resetPassword.token = resetToken;
  user.resetPassword.expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({ session });

  const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

  // const resetEmail = await passwordResetEmail(email, resetUrl);

  // if (resetEmail instanceof Error) {
  //   return next(new ErrorResponse("Error sending password reset email", 500));
  // }

  return resetUrl;
};

export const resetPassword = async (body, session = null) => {
  const { token, password } = body;
  const user = await User.findOne({
    "resetPassword.token": token,
    "resetPassword.expiry": { $gt: Date.now() },
  }).session(session);

  if (!user) {
    throw new ErrorResponse("Invalid or Expired Link", 400);
  }

  user.password = password;

  user.resetPassword = undefined;

  await user.save({ session });
  return true;
};
