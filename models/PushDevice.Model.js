import mongoose from "mongoose";

/**
 * A phone that can receive push notifications for a signed-in user.
 *
 * The mobile app registers its Expo push token after sign-in and removes it
 * on sign-out. A token belongs to one user at a time: registering it again
 * (another account signs in on the same phone) moves it. Tokens Expo reports
 * as no longer registered are deleted when a push to them fails.
 */
const PushDeviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, unique: true, maxlength: 300 },
    platform: { type: String, enum: ["android", "ios"], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

PushDeviceSchema.index({ user: 1 });

const PushDevice = mongoose.model("PushDevice", PushDeviceSchema);

export default PushDevice;
