import mongoose from "mongoose";

const PreferencesSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    alternativeEmail: {
      type: String,
      unique: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address"],
    },
    phoneNumber: {
      type: String,
    },
    profilePicture: {
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
    billingAddress: {},
    shippingAddress: {},
  },
  { timestamps: true }
);

const Preferences = mongoose.model("Preferences", PreferencesSchema);

export default Preferences;
