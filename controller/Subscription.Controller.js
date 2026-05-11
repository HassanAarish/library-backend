import Stripe from "stripe";
import moment from "moment";
import asyncHandler from "../middlewares/asyncHandler.js";
import Subscription from "../models/Subscription.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import User from "../models/User.Model.js";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const data = [
  {
    productName: "Monthly-Essential",
    priceAmount: 14.95,
    alerts: 40,
    type: "monthly",
    priceId: "price_1QOyj2Kuf4JEQrIgDho7Gk0e",
  },
  {
    productName: "Monthly-Plus",
    priceAmount: 24.95,
    alerts: 100,
    type: "monthly",
    priceId: "price_1QOyjJKuf4JEQrIgbCos1Ln1",
  },
  {
    productName: "Monthly-Expert",
    priceAmount: 34.95,
    alerts: 400,
    type: "monthly",
    priceId: "price_1QOyjUKuf4JEQrIgoGcp4wFh",
  },
  {
    productName: "Yearly-Essential",
    priceAmount: 125.58,
    alerts: 40,
    type: "yearly",
    priceId: "price_1QOyjfKuf4JEQrIg2ek9T0nC",
  },
  {
    productName: "Yearly-Plus",
    priceAmount: 209.58,
    alerts: 100,
    type: "yearly",
    priceId: "price_1QOyjqKuf4JEQrIgxe18a0ut",
  },
  {
    productName: "Yearly-Expert",
    priceAmount: 293.58,
    alerts: 400,
    type: "yearly",
    priceId: "price_1QOyjyKuf4JEQrIglmIlUqUI",
  },
];

export const initiateSubscription = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  const { stripePriceId } = req.body;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.lastName
          ? `${user.firstName} ${user.lastName}`
          : `${user.firstName}`,
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      metadata: {
        userId: userId,
      },
    });
    if (!subscription.id) {
      await stripe.subscriptions.del(subscription.id);
      return next(
        new ErrorResponse(
          "Failed to create subscription record. Rollback successful.",
          500
        )
      );
    }
    return res.status(201).json({
      success: true,
      message: "Subscription initiated successfully.",
      data: {
        subscriptionId: subscription.id,
        stripeCustomerId: stripeCustomerId,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        startDate: subscription.current_period_start,
        endDate: subscription.current_period_end,
      },
    });
  } catch (error) {
    console.error("Error creating subscription.", error);
    return next(error);
  }
});

export const createSubscription = asyncHandler(async (req, res, next) => {
  const { stripeSubscriptionId, stripePriceId, stripeCustomerId, planName } =
    req.body;
  const userId = req.userID;
  try {
    if (
      !stripeSubscriptionId ||
      !stripePriceId ||
      !stripeCustomerId ||
      !planName
    ) {
      return next(
        new ErrorResponse(
          "Missing required subscription data: stripeSubscriptionId, stripePriceId, stripeCustomerId, planName",
          400
        )
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const priceDetails = data.find((item) => item.productName === planName);

    if (!priceDetails) {
      return next(new ErrorResponse("Invalid plan name", 400));
    }

    const start = moment();
    const end = priceDetails.productName.includes("Monthly")
      ? start.clone().add(1, "month")
      : start.clone().add(1, "year");

    const subscription = await Subscription.create({
      stripeSubscriptionId,
      stripeCustomerId,
      stripePriceId,
      price: priceDetails.priceAmount,
      type: priceDetails.type,
      planName,
      alerts: priceDetails.alerts,
      userId: userId,
      startDate: start.toDate(),
      endDate: end.toDate(),
    });

    await user.subscriptionId.push(subscription._id);
    await user.save();
    await subscription.save();

    return res.status(201).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    console.error("Failed to create subscription : ", error);
    return next(error);
  }
});

export const cancelSubscription = asyncHandler(async (req, res, next) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return next(new ErrorResponse("Subscription not found", 404));
    }
    const canceledSubscription = await stripe.subscriptions.cancel(
      subscription.stripeSubscriptionId
    );

    subscription.active = false;
    subscription.cancellationDate = new Date();
    await subscription.save();

    return res.status(200).json({
      success: true,
      data: { canceledSubscription, subscription },
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return next(error);
  }
});

export const userSubscription = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  try {
    const subscription = await Subscription.findOne({ userId: userId });

    if (!subscription) {
      return res.status(200).json({
        success: false,
        message: "You have no active subscriptions.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Here are subscription details.",
      data: subscription,
    });
  } catch (error) {
    return next(error);
  }
});

export const getCanceledSubscriptions = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  try {
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const subs = await Subscription.findOne({
      userId: userId,
      cancellationDate: { $lt: new Date() },
    });

    if (!subs) {
      return next(new ErrorResponse("No subscription found.", 404));
    }

    return res.status(200).json({
      success: true,
      message: "Here are your canceled subscriptions.",
      data: subs,
    });
  } catch (error) {
    return next(error);
  }
});

export const createProduct = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  const { productName, priceAmount, interval } = req.body;
  try {
    if (!productName || !priceAmount || !interval) {
      return next(new ErrorResponse("All fields are required.", 400));
    }

    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found.", 404));
    }

    // Create a Product
    const product = await stripe.products.create({
      name: productName,
      metadata: {
        createdBy: `${user.firstName} ${user.lastName} ${user.email}`, // Add metadata for tracking
      },
    });

    // Create a Price for the Product
    const price = await stripe.prices.create({
      unit_amount: Math.round(priceAmount * 100), // Convert to cents
      currency: "cad", // Fixed Currency
      product: product.id,
      recurring: { interval: interval.toLowerCase() }, // e.g., 'month' or 'year'
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      data: {
        productId: product.id,
        priceId: price.id,
        priceAmount: price.unit_amount / 100,
        currency: price.currency,
        interval: price.recurring.interval,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export const getAllProducts = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  try {
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found.", 404));
    }

    const products = await stripe.products.list({
      limit: 10,
    });

    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
        });

        return prices.data.map((price) => ({
          productName: product.name,
          priceAmount: price.unit_amount / 100,
          priceId: price.id,
        }));
      })
    );

    const flatProductsWithPrices = productsWithPrices.flat();

    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully.",
      data: flatProductsWithPrices,
    });
  } catch (error) {
    console.error("Error retrieving products:", error);
    return next(new ErrorResponse("Internal Server Error", 500));
  }
});

export const editProductPrice = asyncHandler(async (req, res, next) => {
  const userId = req.userID;
  const { priceId, newPriceAmount } = req.body;
  try {
    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found.", 404));
    }

    if (!priceId || !newPriceAmount) {
      return next(
        new ErrorResponse("Price ID and new price amount are required.", 400)
      );
    }

    if (isNaN(newPriceAmount) || newPriceAmount <= 0) {
      return next(new ErrorResponse("Invalid new price amount.", 400));
    }

    const price = await stripe.prices.retrieve(priceId);

    if (!price || !price.product) {
      return next(new ErrorResponse("Price or product not found.", 404));
    }

    const newPrice = await stripe.prices.create({
      unit_amount: Math.round(newPriceAmount * 100),
      currency: "cad",
      product: price.product,
      recurring: price.recurring,
    });

    await stripe.prices.update(priceId, { active: false });

    return res.status(200).json({
      success: true,
      message: "Price updated successfully.",
      data: {
        newPriceId: newPrice.id,
        newPriceAmount: newPrice.unit_amount / 100,
        productId: price.product,
      },
    });
  } catch (error) {
    console.error("Error updating price:", error);
    return next(new ErrorResponse("Internal Server Error", 500));
  }
});
