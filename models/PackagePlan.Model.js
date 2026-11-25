import mongoose from "mongoose";

/**
 * A package the admin sells, e.g. "5 Books — 1 year". Each credit rents any one
 * book, whatever its price.
 */
const PackagePlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    credits: { type: Number, required: true, min: 1 },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: "Price must be a whole number of rupees." },
    },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    validityDays: { type: Number, default: 365, min: 1 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

PackagePlanSchema.index({ isActive: 1, sortOrder: 1 });

const PackagePlan = mongoose.model("PackagePlan", PackagePlanSchema);

export default PackagePlan;
