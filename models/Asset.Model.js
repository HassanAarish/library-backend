import mongoose from "mongoose";

/**
 * Ownership record for every uploaded file (images via /common/upload, book
 * PDFs via /book/upload-file). Lets the API check that a user only attaches (or
 * deletes) files they uploaded themselves, and remembers the Cloudinary
 * resource + delivery type needed to fetch or destroy the file later.
 */
const AssetSchema = new mongoose.Schema(
  {
    public_id: { type: String, required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    resourceType: { type: String, required: true }, // image | video | raw
    // "upload" = public URL · "authenticated" = private, signed access only (book PDFs)
    deliveryType: { type: String, enum: ["upload", "authenticated"], default: "upload" },
    url: { type: String, required: true },
    name: { type: String },
    format: { type: String },
    mimetype: { type: String },
    bytes: { type: Number },
    pages: { type: Number }, // PDFs only
  },
  { timestamps: true },
);

AssetSchema.index({ owner: 1, createdAt: -1 });

const Asset = mongoose.model("Asset", AssetSchema);

export default Asset;
