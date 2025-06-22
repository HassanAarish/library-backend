import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First Name is required"],
    },
    lastName: {
      type: String,
      required: [true, "Last Name is required"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
    },
    phoneNumber: {
      type: Number,
      required: [true, "Phorn Number is required"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    dob: {
      type: Date,
      required: [true, "Date of Birth is required"],
    },
    gender: {
      type: String,
      required: [true, "Gender is required"],
      enum: ["Male", "Female", "Other"],
    },
    authType: {
      type: String,
      enum: ["email", "google", "apple"],
      default: "email",
    },
    isAdmin: {
      type: Boolean,
      default: true,
    },
    profilePicture: {
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },
    otp: {
      code: {
        type: String,
      },
      expiry: {
        type: Date,
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    passwordResetOtp: {
      code: {
        type: String,
      },
      expiry: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Create the User model
const Admin = mongoose.model("Admin", AdminSchema);

export default Admin;
