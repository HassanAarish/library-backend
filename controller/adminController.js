import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Books from "../models/Book.Model.js";
import Admin from "../models/Admin.Model.js";
import User from "../models/User.Model.js";
import { passwordResetEmail } from "../utils/emailClient.js";

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  try {
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return next(new ErrorResponse("Admin not found", 404));
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit otp

    const resetEmail = await passwordResetEmail(email, otp);

    if (resetEmail instanceof Error) {
      return next(new ErrorResponse("Error sending password reset email", 500));
    }

    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // 5 minutes expiry

    admin.passwordResetOtp = {
      code: otp,
      expiry: expiry,
    };

    await admin.save();

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
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return next(new ErrorResponse("Admin not found", 404));
    }

    if (admin.passwordResetOtp.code !== otp) {
      return next(new ErrorResponse("Invalid OTP", 400));
    }

    if (admin.passwordResetOtp.expiry < new Date()) {
      return next(new ErrorResponse("OTP expired", 400));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    admin.password = passwordHash;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const addBook = asyncHandler(async (req, res, next) => {
  const { title, category, author, price } = req.body;
  try {
    if (!title || !category || !author || !price) {
      return next(new ErrorResponse("Please provide all the feilds", 400));
    }

    const admin = await Admin.findById(req.userID);

    if (admin.isAdmin === true) {
      const book = await Books.create(req.body);
      return res.status(200).json({
        message: "Book added successfully !",
        book,
      });
    }
    return next(new ErrorResponse("User not Authorized", 403));
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const updateBook = asyncHandler(async (req, res, next) => {
  const { title, id } = req.query;
  try {
    if (!title || !id) {
      return next(new ErrorResponse("Please provide all the feilds", 400));
    }
    const admin = await Admin.findById(req.userID);
    if (admin.isAdmin === true) {
      if (req.params) {
        const updatedBook = await Books.findByIdAndUpdate(req.params.id, {
          title: req.query.title,
        });

        return res.status(200).json({
          success: true,
          message: "Book updated successfully",
          data: updatedBook,
        });
      } else {
        return next(new ErrorResponse("Unable to update the book!", 400));
      }
    }
    return res
      .status(400)
      .json({ message: "User unauthorized to make changs!" });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export const deleteBook = asyncHandler(async (req, res, next) => {
  const { title, id } = req.query;
  try {
    const admin = await Admin.findById(req.userID);
    if (admin.isAdmin === true) {
      const deletedBook = await Books.findByIdAndDelete(req.params.id);
      console.log(deletedBook);
      return res.status(200).json({ message: "Book deleted successfully" });
    }
    return next(new ErrorResponse("User unauthorized to make changs!", 400));
  } catch (error) {
    return next(error);
  }
});

export const deleteAll = asyncHandler(async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userID);
    if (admin.isAdmin === true) {
      const allBooks = await Books.find({});
      for (let i = 0; i < allBooks.length; i++) {
        await Books.findByIdAndDelete(allBooks[i]._id);
      }
      return res.status(200).json({ Success: true, data: allBooks });
    }
  } catch (error) {
    return next(error);
  }
});

export const getAllUserProfiles = asyncHandler(async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userID);
    if (admin.isAdmin === true) {
      const allUsers = await User.find({ isAdmin: false });
      res.status(200).json({
        success: true,
        users: allUsers,
      });
    } else {
      return next(
        new ErrorResponse("User unauthorized for this request!", 403)
      );
    }
  } catch (error) {
    return next(error);
  }
});

export const getAllRentedBooks = asyncHandler(async (req, res, next) => {});
