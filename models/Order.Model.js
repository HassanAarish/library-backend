import mongoose from "mongoose";
import mongooseAutoPopulate from "mongoose-autopopulate";

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      autopopulate: true,
    },
    paymentResult: {
      id: { type: String },
      paymentReceived: { type: Number },
      email_address: { type: String },
      isRefunded: { type: Boolean, default: false },
      refundedAmount: { type: Number },
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
    },
    isRefunded: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

OrderSchema.plugin(mongooseAutoPopulate);
const Order = mongoose.model("Order", OrderSchema);

export default Order;
