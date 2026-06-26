import asyncHandler from "../middlewares/asyncHandler.js";
import helper from "../utils/helper.js";
import * as authService from "../services/Auth.Service.js";

// Registration Controllers

export const register = asyncHandler(async (req, res) => {
  const session = req.transaction;

  // Your new mandatory fields check (assuming you call it via middleware or here)
  helper.checkMandatoryFields(req.body, ["name", "email", "password", "authType"]);

  await authService.register(req.body, session);

  return res.status(200).json({
    success: true,
    message: "Registration successfull. Verify your email to continue.",
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const session = req.transaction;

  // Your new mandatory fields check (assuming you call it via middleware or here)
  helper.checkMandatoryFields(req.body, ["email", "otp"]);

  await authService.verifyOtp(req.body, session);

  return res.status(201).json({
    success: true,
    message: "Email verified successfully. Please login to continue !",
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["email"]);

  await authService.resendOtp(req.body, session);

  // Generic response — never reveals whether the account exists or its state.
  return res.status(200).json({
    success: true,
    message: "If your account needs verification, a new code has been sent.",
  });
});

// Login Controller with 2FA enabled/disabled

export const login = asyncHandler(async (req, res) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["email", "password", "authType"]);

  const result = await authService.login(req.body, session);

  if (result.twoFactorRequired) {
    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      pendingToken: result.pendingToken,
      message: "Enter the code from your authenticator app.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    token: result.token,
  });
});

// Password Reset Controller

export const forgotPassword = asyncHandler(async (req, res) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["email"]);

  await authService.forgotPassword(req.body, session);

  return res.status(200).json({
    success: true,
    message: "If an account exists for that email, a password reset link has been sent.",
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const session = req.transaction;

  const fields = { ...req.query, ...req.body };

  helper.checkMandatoryFields(fields, ["token", "password"]);

  await authService.resetPassword(fields, session);

  return res.status(200).json({
    success: true,
    message: "Password reset successfully. Please login to continue.",
  });
});

// Unified social sign-in: google | apple | facebook
export const socialLogin = asyncHandler(async (req, res) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["provider", "token"]);

  const result = await authService.socialLogin(req.body, session);

  // Same-email account exists and the user hasn't consented to linking yet —
  // tell the frontend to prompt (link, or sign in with the password instead).
  if (result.linkRequired) {
    return res.status(200).json({
      success: true,
      linkRequired: true,
      email: result.email,
      message:
        "An account with this email already exists. Link your social account to continue, or sign in with your password.",
    });
  }

  if (result.twoFactorRequired) {
    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      pendingToken: result.pendingToken,
      message: "Enter the code from your authenticator app.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    token: result.token,
  });
});

// export const verifyTwoFactorAuth = asyncHandler(async (req, res) => {
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

// Instructor Registration

// export const adminRegister = asyncHandler(async (req, res) => {
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
// export const removeTwoFactor = asyncHandler(async (req, res) => {
//   const { userId } = req.params;

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
//   async (req, res) => {
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
