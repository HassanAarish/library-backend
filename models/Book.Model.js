import mongoose from "mongoose";

const BookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    file: {
      url: { type: String, required: true },
      public_id: { type: String, required: true },
      name: { type: String, required: true },
      format: { type: String }, // pdf, docx, etc.
    },
    coverImage: {
      name: { type: String },
      url: { type: String },
      public_id: { type: String },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String },
    isAvailable: { type: Boolean, default: true }, // To temporarily hide books
  },
  { timestamps: true },
);

// Indexing for search optimization
BookSchema.index({ title: "text", author: "text" });

BookSchema.index({ category: 1 });

BookSchema.index({ status: 1, category: 1 });

const Book = mongoose.model("Book", BookSchema);

export default Book;
