import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Prevent a user from reviewing the same book twice
ReviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model("Review", ReviewSchema);

export default Review;
