import mongoose from "mongoose";

const ReferralSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    referralCode: {
      type: String,
      required: true,
    },
    userSignup: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Referrals = mongoose.model("Referral", ReferralSchema);

export default Referrals;
