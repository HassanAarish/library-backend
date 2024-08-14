import asyncHandler from "../middlewares/asyncHandler.js";
import Order from "../models/Order.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import cloudinary from "cloudinary";
import { passwordResetEmail } from "../utils/emailClient.js";

export const getUserOrders = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.body.userid);
    if (!user) {
      return next(new ErrorResponse("User not foun", 400));
    }
    const foundOrders = await Order.find({
      userId: user._id,
    });
    if (foundOrders.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Here are your order details: ",
        foundOrders,
      });
    }
    return next(new ErrorResponse("No orders found", 404));
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const getUserProfile = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.userID)
      .select("-password")
      .populate("appointments")
      .populate("discountedCoupons");
    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const updateUserProfile = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, phoneNumber, gender, profilePicture } =
    req.body;

  try {
    const user = await User.findById(req.userID);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }
    let newProfilePicture;
    if (profilePicture) {
      // Delete the previous profile picture from cloudinary
      await cloudinary.uploader.destroy(user.profilePicture.public_id);

      // Upload new profile picture to cloudinary

      const uploadedImage = await cloudinary.uploader.upload(profilePicture, {
        folder: "profile_pictures",
        width: 150,
        height: 150,
        crop: "fill",
      });

      newProfilePicture = {
        url: uploadedImage.secure_url,
        public_id: uploadedImage.public_id,
      };
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.email = email || user.email;
    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.gender = gender || user.gender;
    user.profilePicture = profilePicture
      ? newProfilePicture
      : user.profilePicture;

    await user.save();

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    consolr.error(error);
    return next(error);
  }
});

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp

    const resetEmail = await passwordResetEmail(email, otp);

    if (resetEmail instanceof Error) {
      return next(new ErrorResponse("Error sending password reset email", 500));
    }

    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

    user.passwordResetOtp = {
      code: otp,
      expiry: expiry,
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const resetPassword = asyncHandler(async (req, res, next) => {
  const { email, otp, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.passwordResetOtp.code !== otp) {
      return next(new ErrorResponse("Invalid OTP", 400));
    }

    if (user.passwordResetOtp.expiry < new Date()) {
      return next(new ErrorResponse("OTP expired", 400));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    user.password = passwordHash;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    return next(error);
  }
});

export const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.userID).select("+password");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return next(new ErrorResponse("Invalid credentials", 401));
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      data: "Password updated successfully",
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const addProfilePicture = asyncHandler(async (req, res, next) => {
  const { avatar } = req.body;
  const user = await User.findById(req.userID);
  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  try {
    const uploadImage = await cloudinary.v2.uploader.upload(avatar, {
      folder: "library",
    });

    user.avatar.url = uploadImage.secure_url;
    user.avatar.public_id = uploadImage.public_id;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorResponse("Image upload failed", 500));
  }
});

export const updateProfilePicture = asyncHandler(async (req, res, next) => {
  const { avatar } = req.body;
  const user = await User.findById(req.userID);
  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  try {
    if (user.avatar.public_id) {
      await cloudinary.v2.uploader.destroy(user.avatar.public_id);
    }

    const uploadImage = await cloudinary.v2.uploader.upload(avatar, {
      folder: "library",
    });

    user.avatar.url = uploadImage.secure_url;
    user.avatar.public_id = uploadImage.public_id;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorResponse("Image update failed", 500));
  }
});
