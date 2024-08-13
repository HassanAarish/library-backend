import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
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
      required: true,
      unique: true,
    },
    phoneNumber: {
      type: Number,
      required: [true, "Phorn Number is required"],
    },
    password: {
      type: String,
      required: true,
    },
    dob: {
      type: Date,
      required: [true, "Date of Birth is required"],
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetTokenExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Create the User model
const User = mongoose.model("User", UserSchema);

export default User;
