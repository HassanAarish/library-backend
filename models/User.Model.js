import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address"],
    },
    alternativeEmail: {
      type: String,
      unique: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address"],
    },
    password: {
      type: String,
      required: function () {
        return this.authType === "email";
      },
    },
    authType: {
      type: String,
      enum: ["email", "google", "facebook", "apple"],
      default: "email",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCustomerId: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    phoneNumber: {
      type: String,
    },
    twoFactorAuthentication: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
    },
    otp: {
      code: {
        type: Number,
      },
      expiry: {
        type: Date,
      },
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordTokenExpiry: {
      type: Date,
    },
    profilePicture: {
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
