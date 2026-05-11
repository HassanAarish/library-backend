import asyncHandler from "../middlewares/asyncHandler.js";
import helper from "../utils/helper.js";
import * as authService from "../services/Auth.Service.js";

// Registration Controllers

export const register = asyncHandler(async (req, res, next) => {
  const session = req.transaction;

  // Your new mandatory fields check (assuming you call it via middleware or here)
  helper.checkMandatoryFields(req.body, [
    "name",
    "email",
    "password",
    "authType",
  ]);

  await authService.register(req.body, session);

  return res.status(200).json({
    success: true,
    message: "Registration successfull. Verify your email to continue.",
  });
});

export const verifyOtp = asyncHandler(async (req, res, next) => {
  const session = req.transaction;

  // Your new mandatory fields check (assuming you call it via middleware or here)
  helper.checkMandatoryFields(req.body, ["email", "otp"]);

  await authService.verifyOtp(req.body, session);

  return res.status(201).json({
    success: true,
    message: "Email verified successfully. Please login to continue !",
  });
});

// Login Controller with 2FA enabled/disabled

export const login = asyncHandler(async (req, res, next) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["email", "password", "authType"]);

  const { user, token } = await authService.login(req.body, session);

  if (user?.twoFactor?.enabled) {
    return res.status(200).json({
      success: true,
      twoFactorEnabled: true,
      message: "2FA is enabled. Please enter the OTP from your app.",
      userId: user._id,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    token,
  });
});

// export const verifyTwoFactorAuth = asyncHandler(async (req, res, next) => {
//   try {
//     const { userId, otp } = req.body;

//     if (!userId || !otp) {
//       return next(new ErrorResponse("Please provide all the fields", 400));
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       return next(new ErrorResponse("User not found", 404));
//     }

//     if (!user.twoFactorSecret) {
//       return next(new ErrorResponse("2FA not initiated", 404));
//     }

//     // Creating a TOTP instance using the user's stored secret
//     const totp = new OTPAuth.TOTP({
//       issuer: "EFTS",
//       label: user.email,
//       algorithm: "SHA1",
//       digits: 6,
//       period: 30,
//       secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
//     });

//     // Validate the OTP with a slight window tolerance
//     const validOTP = totp.validate({ token: otp, window: 0 });

//     if (validOTP === null) {
//       return next(new ErrorResponse("Invalid 2FA code", 401));
//     }

//     const token = generateToken(user);

//     return res.status(200).json({
//       success: true,
//       message: "2FA successful. You are now logged in.",
//       data: user,
//       token: token,
//     });
//   } catch (error) {
//     return next(error);
//   }
// });

// Password Reset Controller

// export const forgotPassword = asyncHandler(async (req, res, next) => {
//   const { email } = req.body;
//   try {
//     const user = await User.findOne({ email });

//     if (!user) {
//       return next(new ErrorResponse("User not found", 404));
//     }

//     const resetToken = crypto.randomBytes(20).toString("hex");
//     user.resetPasswordToken = resetToken;
//     user.resetPasswordTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
//     await user.save();
//     const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;
//     console.log("resetUrl", resetUrl);

//     const resetEmail = await passwordResetEmail(email, resetUrl);

//     if (resetEmail instanceof Error) {
//       return next(new ErrorResponse("Error sending password reset email", 500));
//     }

//     return res.status(201).json({
//       success: true,
//       message: "Password reset email sent",
//     });
//   } catch (error) {
//     console.error(error);
//     return next(error);
//   }
// });

// export const resetPassword = asyncHandler(async (req, res, next) => {
//   const { token } = req.params;
//   const { password } = req.body;
//   try {
//     const user = await User.findOne({
//       resetPasswordToken: token,
//       resetPasswordTokenExpiry: { $gt: Date.now() },
//     });

//     if (!user) {
//       return next(new ErrorResponse("Invalid or Expired Link", 400));
//     }

//     const hashPassword = await bcrypt.hash(password, 10);
//     user.password = hashPassword;
//     user.resetPasswordToken = undefined;
//     user.resetPasswordTokenExpiry = undefined;
//     await user.save();
//     res.status(200).json({
//       success: true,
//       message: "Password reset successful",
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// Instructor Registration

// export const adminRegister = asyncHandler(async (req, res, next) => {
//   const { name, email, password, authType } = req.body;

//   const session = await connection.startSession();
//   session.startTransaction();

//   try {
//     if (authType === "email") {
//       if (!name || !email || !password) {
//         await session.abortTransaction();
//         session.endSession();
//         return next(
//           new ErrorResponse("Please provide all required fields.", 400)
//         );
//       }

//       if (authType === "email") {
//         // Check if either email already exists
//         const userExist = await User.findOne({ email }).session(session);

//         if (userExist) {
//           await session.abortTransaction();
//           session.endSession();
//           return next(
//             new ErrorResponse("User with same email already exist", 401)
//           );
//         }
//         const passwordHash = await bcrypt.hash(password, 10);
//         const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp
//         const expiry = new Date();
//         expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

//         const user = await User({
//           name,
//           email,
//           password: passwordHash,
//           role: "admin",
//           otp: { code: otp, expiry: expiry },
//           authType,
//         });
//         await user.save({ session });

//         const info = await sendOtp(email, otp);

//         if (info instanceof Error) {
//           await session.abortTransaction();
//           session.endSession();
//           return next(new ErrorResponse("Error sending OTP", 500));
//         }

//         await session.commitTransaction();
//         session.endSession();

//         return res.status(201).json({
//           success: true,
//           message: "OTP sent. Please verify to complete registration.",
//         });
//       } else if (authType === "google" || authType === "apple") {
//         if (!name || !email) {
//           await session.abortTransaction();
//           session.endSession();
//           return next(new ErrorResponse("Please provide all fields", 400));
//         }

//         let userData = {
//           name,
//           email,
//           role: "admin",
//           authType,
//           otp: { code: otp, expiry },
//           isVerified: false,
//         };
//         const user = await User.create([userData], { session });
//         await session.commitTransaction();
//         session.endSession();

//         // generate a token
//         const token = generateToken(user);

//         return res.status(201).json({
//           success: true,
//           data: user,
//           token,
//         });
//       } else {
//         await session.abortTransaction();
//         session.endSession();
//         return next(new ErrorResponse("Invalid authentication type", 500));
//       }
//     }
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     return next(error);
//   }
// });

// If user lost authentication app these endpoints will be applied.

// User will receive a verification email with otp to reset the password
// export const removeTwoFactor = asyncHandler(async (req, res, next) => {
//   const { userId } = req.params;

//   try {
//     const user = await User.findById(userId);
//     console.log("🚀 ~ user:", user);
//     if (!user) {
//       return next(new ErrorResponse("User not found", 404));
//     }

//     if (!user.twoFactorAuthentication) {
//       return next(new ErrorResponse("User has not enabled 2FA", 404));
//     }
//     const otp = generateOTP();
//     user.resetPasswordToken = otp;
//     user.resetPasswordTokenExpiry = Date.now() + 10 * 60 * 1000;

//     await user.save();

//     // Send OTP to user's email
//     await authenticatorApp(user.email, otp);

//     return res.status(200).json({
//       success: true,
//       message: `OTP sent to ${user.email}. Please verify to disable 2FA.`,
//     });
//   } catch (error) {
//     return next(error);
//   }
// });

// User will then verify the otp to remove the authentication from the authenticator app
// export const verifyOtpAndRemoveTwoFactor = asyncHandler(
//   async (req, res, next) => {
//     const { userId } = req.params;
//     const { otp } = req.body;

//     try {
//       const user = await User.findById(userId);
//       if (!user) {
//         return next(new ErrorResponse("User not found", 404));
//       }

//       if (
//         user.resetPasswordToken !== otp ||
//         user.resetPasswordTokenExpiry < Date.now()
//       ) {
//         return next(new ErrorResponse("Invalid or expired OTP", 400));
//       }

//       user.twoFactorAuthentication = false;
//       user.twoFactorSecret = undefined;
//       user.resetPasswordToken = undefined;
//       user.resetPasswordTokenExpiry = undefined;

//       await user.save();

//       return res.status(200).json({
//         success: true,
//         message: "Two-factor authentication has been removed.",
//       });
//     } catch (error) {
//       return next(error);
//     }
//   }
// );
