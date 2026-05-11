import asyncHandler from "../middlewares/asyncHandler.js";
import Referrals from "../models/Referral.Model.js";
import ErrorResponse from "../utils/errorResponse.js";

export const generateReferral = asyncHandler(async (req, res, next) => {
  const userID = req.userID;
  try {
    const referralExist = await Referrals.findOne({ userId: userID });
    if (referralExist) {
      return res.status(200).json({
        success: false,
        message: "Your referral code has already been generated.",
        data: referralExist.referralCode,
      });
    }

    const referralCode = `REF-${userID}-${Date.now()}`;
    await Referrals.create({ userId: userID, referralCode: referralCode });

    return res.status(200).json({
      success: true,
      mesage: "Your referral code has been generated.",
      referralCode: referralCode,
    });
  } catch (error) {
    return next(error);
  }
});

export const redirectToReferral = asyncHandler(async (req, res) => {
  try {
    const { referralCode } = req.query;

    const referral = await Referrals.findOne({ referralCode: referralCode });
    if (!referral) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral link.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Redirect Successfully.",
      referralCode: referral.referralCode,
    });
  } catch (error) {
    return next(error);
  }
});

export const getReferral = asyncHandler(async (req, res) => {
  try {
    const userId = req.userId;

    const referral = await Referrals.findOne(userId);
    if (!referral) {
      return next(
        new ErrorResponse("You have not created referral links.", 404)
      );
    }
    return res.status(200).json({
      success: true,
      referralLink: `${process.env.WEBSITE_DOMAIN}/signup?ref=${referral.referralCode}`,
    });
  } catch (error) {
    return next(error);
  }
});
