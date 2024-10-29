import mongoose from "mongoose";
import mongooseAutoPopulate from "mongoose-autopopulate";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      autopopulate: true,
    },
    rentedBooks: [
      {
        bookId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Books",
          required: true,
          autopopulate: true,
        },
        startDate: {
          type: String,
          required: true,
        },
        endDate: {
          type: String,
          required: true,
        },
      },
    ],
    totalPrice: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

orderSchema.plugin(mongooseAutoPopulate);
const order = mongoose.model("Order", orderSchema);

export default order;
