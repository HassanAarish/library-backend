import Book from "../models/Books.Model.js";
import User from "../models/User.Model.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Order from "../models/Order.Model.js";
import dotenv from "dotenv";
import Stripe from "stripe";

const stripe =
  process.env.STRIPE_SECRET_KEY ||
  new Stripe(
    "sk_test_51Q0o7LJptLTFCZSKQyvnjsLxsB1WODmOJ81FDgMZs4hfJyNqUCsMve6VEi5FprMlgxWITlkKdFIzNpfIdYStTOiS00oHLfm9HV"
  );

dotenv.config();

export const addBook = asyncHandler(async (req, res, next) => {
  const { title, category, author, price } = req.body;
  const userId = req.userID;
  try {
    if (!title || !category || !author || !price) {
      return next(new ErrorResponse("Please provide all the feilds", 404));
    }
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role === "admin") {
      const book = await Book.create(req.body);

      return res.status(200).json({
        success: true,
        message: "Book added successfully !",
        data: book,
      });
    }
    return next(new ErrorResponse("User not Authorized", 403));
  } catch (error) {
    return next(error);
  }
});

export const updateBook = asyncHandler(async (req, res, next) => {
  const { bookId } = req.params;
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role !== "admin") {
      return next(new ErrorResponse("Not authorized to update books", 403));
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return next(new ErrorResponse("Book not found", 404));
    }

    const updatedBook = await Book.findByIdAndUpdate(bookId, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      data: updatedBook,
    });
  } catch (error) {
    return next(error);
  }
});

export const deleteBook = asyncHandler(async (req, res, next) => {
  const { bookId } = req.params;
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role !== "admin") {
      return next(new ErrorResponse("Not authorized to update books", 403));
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return next(new ErrorResponse("Book not found", 404));
    }

    await book.remove();

    return res.status(200).json({
      success: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
});

export const getAllUserProfiles = asyncHandler(async (req, res, next) => {
  const userId = req.userID;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.role === "admin") {
      const users = await User.find({ role: "user" });
      return res.status(200).json({
        success: true,
        message: "All users deleted successfully!",
        data: users,
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

export const refundPayment = asyncHandler(async (req, res, next) => {
  const { paymentIntentId, priceToRefund, orderId } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new ErrorResponse("Order not found", 404));
    }

    const refundAmountInCents = Math.round(priceToRefund * 100);

    const maxRefundableAmount =
      order.totalPrice * 100 - (order.paymentResult.refundedAmount || 0) * 100;
    if (refundAmountInCents > maxRefundableAmount) {
      return next(
        new ErrorResponse("Refund amount exceeds allowable limit", 400)
      );
    }

    const paymentIntent = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundAmountInCents,
    });

    order.paymentResult.isRefunded = true;
    order.paymentResult.refundedAmount =
      (order.paymentResult.refundedAmount || 0) + priceToRefund;
    order.isRefunded = true;
    await order.save();

    return res.status(200).json({
      success: true,
      data: { paymentIntent, order },
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    return next(new ErrorResponse("Refund processing failed", 500));
  }
});

export const weeklyTopPackage = asyncHandler(async (req, res, next) => {
  try {
    const startOfLastWeek = moment().subtract(1, "weeks").startOf("isoWeek");
    const endOfLastWeek = moment().subtract(1, "weeks").endOf("isoWeek");

    const bookings = await Booking.find({
      "selectedSlot.date": {
        $gte: startOfLastWeek.toDate(),
        $lte: endOfLastWeek.toDate(),
      },
    })
      .sort({ "selectedSlot.date": 1 })
      .populate("packageId", "name price");

    const packageNames = bookings.map((booking) => booking.packageId.name);

    const modeMap = {};
    let maxEl = null,
      maxCount = 0;

    packageNames.forEach((name) => {
      if (modeMap[name] == null) modeMap[name] = 1;
      else modeMap[name]++;

      if (modeMap[name] > maxCount) {
        maxEl = name;
        maxCount = modeMap[name];
      }
    });

    let amount = bookings
      .filter(({ packageId: { name } }) => name === maxEl)
      .reduce((total, booking) => total + booking.packageId.price, 0);

    return res.status(200).json({
      message: "Weekly Top Selling Package",
      data: {
        package: maxEl,
        amount: amount,
      },
      success: true,
    });
  } catch (error) {
    return next(error);
  }
});

export const weeklyTotalEarnings = asyncHandler(async (req, res, next) => {
  try {
    const startOfCurrentWeek = moment().startOf("isoWeek");
    const endOfCurrentWeek = moment().endOf("isoWeek");

    const bookings = await Booking.find({
      "selectedSlot.date": {
        $gte: startOfCurrentWeek.toDate(),
        $lte: endOfCurrentWeek.toDate(),
      },
    })
      .populate("packageId", "price")
      .lean();

    const weeklyRevenue = bookings.reduce((total, booking) => {
      return total + booking.packageId.price;
    }, 0);

    return res.status(200).json({
      message: "Total Earnings for the Current Week",
      data: weeklyRevenue,
      success: true,
    });
  } catch (error) {
    return next(error);
  }
});

export const totalEarnings = asyncHandler(async (req, res, next) => {
  try {
    const bookings = await Booking.find({}).populate("packageId", "price");

    // Filter bookings that contains packageId and price fields

    const filteredBookings = bookings.filter(
      (booking) => booking.packageId && booking.packageId.price
    );

    // Calculate total revenue

    const totalRevenue = filteredBookings.reduce((total, booking) => {
      return total + booking.packageId.price;
    }, 0);

    return res.status(200).json({
      success: true,
      message: "Total Earnings for Last Week",
      totalRevenue,
    });
  } catch (error) {
    return next(error);
  }
});

export const recentTransactions = asyncHandler(async (req, res, next) => {
  try {
    const bookings = await Booking.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .populate("packageId", "price")
      .populate("userId", "firstName lastName email");

    return res.status(200).json({
      success: true,
      message: "Total Earnings for Last Week",
      bookings,
    });
  } catch (error) {
    return next(error);
  }
});
