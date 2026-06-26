import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String },
  zip: { type: String },
  country: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  label: { type: String, default: "Home" },
});

const PreferencesSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    alternativeEmail: {
      type: String,
      unique: true,
      // sparse: only enforce uniqueness on docs that actually set this field,
      // so the many users who never provide an alt email don't collide on null.
      sparse: true,
      match: [/.+@.+\..+/, "Please fill a valid email address"],
    },
    phoneNumber: {
      type: String,
    },
    profilePicture: {
      name: {
        type: String,
      },
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },
    bio: {
      type: String,
    },
    dob: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer not to say"],
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    addresses: [AddressSchema],
  },
  { timestamps: true },
);

const Preferences = mongoose.model("Preferences", PreferencesSchema);

export default Preferences;
