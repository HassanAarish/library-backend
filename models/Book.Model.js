import mongoose from "mongoose";

// The readable PDF. Stored on Cloudinary as a private ("authenticated") asset,
// so it has no public URL — pages are only ever served through /reader.
const BookFileSchema = new mongoose.Schema(
  {
    public_id: { type: String, required: true },
    name: { type: String, required: true },
    format: { type: String, default: "pdf" },
    pages: { type: Number, min: 1 },
    bytes: { type: Number },
  },
  { _id: false },
);

const BookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    language: { type: String, default: "English", trim: true },
    isbn: { type: String, trim: true },
    publishedYear: { type: Number, min: 0 },
    pageCount: { type: Number, min: 1 },

    // Price of ONE rental, in whole rupees. Package credits cover any book
    // regardless of this price.
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: "Price must be a whole number of rupees." },
    },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    // How long one rental of this book lasts.
    rentalDays: { type: Number, default: 14, min: 1, max: 90 },

    // Never returned by default — only code that has checked the reader's
    // access may explicitly `.select("+file")`.
    file: { type: BookFileSchema, required: true, select: false },
    coverImage: {
      name: { type: String },
      url: { type: String },
      public_id: { type: String },
    },

    // draft: being prepared (admin only) · published: in the catalogue ·
    // archived: withdrawn but kept, since rentals and reviews reference it.
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Indexing for search optimization
BookSchema.index({ title: "text", author: "text" });

BookSchema.index({ status: 1, category: 1 });

BookSchema.index({ status: 1, createdAt: -1 });

const Book = mongoose.model("Book", BookSchema);

export default Book;
