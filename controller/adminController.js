import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Books from "../models/Book.Model.js";
import Admin from "../models/Admin.Model.js";
import User from "../models/User.Model.js";

export const addBook = asyncHandler(async (req, res, next) => {
  const { title, category, author, price } = req.body;
  try {
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
    return next(error);
  }
});

export const updateBook = asyncHandler(async (req, res, next) => {
  const { title, id } = req.query;
  try {
    const admin = await Admin.findById(req.userID);
    if (admin.isAdmin === true) {
      if (req.params) {
        const updatedBook = await Books.findByIdAndUpdate(req.params.id, {
          title: req.query.title,
        });

        return res.status(200).json({ message: "Book updated successfully" });
      } else {
        return next(new ErrorResponse("Unable to update the book!", 400));
      }
    }
    res.status(400).json({ message: "User unauthorized to make changs!" });
  } catch (error) {
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
