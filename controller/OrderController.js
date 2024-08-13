import User from "../models/User.Model.js";
import Order from "../models/Order.Model.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import Books from "../models/Book.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const createOrder = asyncHandler(async (req, res, next) => {
  const { rentedBooks } = req.body;

  try {
    for (let i = 0; i < rentedBooks.length; i++) {
      const book = await Books.findById(rentedBooks[i].bookId);

      if (!book || book.isRented === false) {
        // Ensure book is found before updating
        book.isRented = true;
        await book.save();
      } else {
        return next(new ErrorResponse("Book is not available", 400));
      }
    }
    const newOrder = await Order.create(req.body);

    const foundOrder = await Order.findById(newOrder._id).populate(
      "rentedBooks.bookId"
    );
    return res.status(200).json({
      foundOrder,
      success: true,
      message: "Your order have been placed successfully !",
    });
  } catch (error) {
    return next(error);
  }
});

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
    return next(error);
  }
});
