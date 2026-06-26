import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Automatically indexed
      trim: true,
    },
    slug: {
      type: String,
      unique: true, // Automatically indexed
      lowercase: true,
    },
    description: { type: String },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
    },
    proposedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    bookCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

/**
 * INDEXING
 */

// 1. Index for Admin/Frontend filtering by status
// Essential for GET /categories?status=approved
CategorySchema.index({ status: 1 });

// 2. Compound Index for Admin Dashboards
// Helps when an Admin wants to see all pending categories proposed by a specific user
CategorySchema.index({ status: 1, proposedBy: 1 });

// 3. Text Index (Optional)
// If you want a search bar specifically for categories
CategorySchema.index({ name: "text" });

/**
 * Pre-save Hook: Generates a URL-friendly slug
 */
CategorySchema.pre("validate", function () {
  if (this.isModified("name") && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
});

const Category = mongoose.model("Category", CategorySchema);

export default Category;
