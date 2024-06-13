import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Books",
    required: true,
  },
  price: Number,
  startDate: String,
  endDate: String,
});

const order = mongoose.model("Order", orderSchema);

export default order;
