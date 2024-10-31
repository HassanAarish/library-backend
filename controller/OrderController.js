import User from "../models/User.Model.js";
import Book from "../models/Books.Model.js";
import Order from "../models/Order.Model.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import dotenv from "dotenv";
import Stripe from "stripe";

const stripe =
  process.env.STRIPE_SECRET_KEY ||
  new Stripe(
    "sk_test_51Q0o7LJptLTFCZSKQyvnjsLxsB1WODmOJ81FDgMZs4hfJyNqUCsMve6VEi5FprMlgxWITlkKdFIzNpfIdYStTOiS00oHLfm9HV"
  );

dotenv.config();

export const createPaymentIntent = asyncHandler(async (req, res, next) => {
  const { amount, orderId } = req.body;

  try {
    const amountInCents = Math.round(parseFloat(amount) * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "cad",
      metadata: { orderId },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return next(new ErrorResponse("Payment creation failed", 500));
  }
});

export const stripeWebhook = asyncHandler(async (req, res, next) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata.orderId; // Assuming order ID is sent in metadata

    const order = await Order.findById(orderId);
    if (order) {
      order.paymentResult = {
        id: paymentIntent.id,
        paymentReceived: paymentIntent.amount / 100,
        email_address: paymentIntent.receipt_email,
      };
      order.isRefunded = false;
      await order.save();
    }
  }

  res.status(200).json({ received: true });
});

export const getUserOrders = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.body.userid);
    if (!user) {
      return res.status(404).json({ message: "User not foun" });
    }
    const foundOrders = await Order.find({
      userId: user._id,
    });
    if (foundOrders.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Here are your order details: ",
        data: foundOrders,
      });
    }
    return next(new ErrorResponse("No orders found", 404));
  } catch (error) {
    return next(error);
  }
});

export const createOrder = asyncHandler(async (req, res, next) => {
  const { rentedBooks, totalPrice } = req.body;
  const userId = req.userID;

  try {
    if (!userId || !rentedBooks || rentedBooks.length === 0 || !totalPrice) {
      return next(
        new ErrorResponse(
          "User ID, rented books, and total price are required.",
          400
        )
      );
    }

    for (let book of rentedBooks) {
      const bookExists = await Book.findById(book.bookId);
      if (!bookExists) {
        return next(
          new ErrorResponse(`Book with ID ${book.bookId} not found.`, 404)
        );
      }
    }

    const order = new Order({
      userId,
      rentedBooks,
      totalPrice,
    });

    await order.save();

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    console.error("Order creation failed:", error);
    return next(new ErrorResponse("Order creation failed", 500));
  }
});
