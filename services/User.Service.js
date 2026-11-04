import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { getOwnedAsset, removeFiles } from "./Common.Service.js";

// Preference fields a user may edit themselves. Anything else in `prefData`
// (userId, profilePicture, _id, …) is ignored.
const EDITABLE_PREFERENCE_FIELDS = [
  "alternativeEmail",
  "phoneNumber",
  "bio",
  "dob",
  "gender",
  "notifications",
  "addresses",
];

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select(
    "-password -twoFactor.secret -otp -resetPassword",
  );

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  const pref = await Preferences.findOne({ userId });

  // Return a single combined object
  return {
    user,
    preferences: pref || {}, // Nesting avoids ID conflicts
  };
};

export const updateProfile = async (body, session = null) => {
  const { userId, name, prefData } = body;

  const updates = helper.pick(prefData, EDITABLE_PREFERENCE_FIELDS);

  if (name) {
    await User.findByIdAndUpdate(userId, { name }, { session, runValidators: true });
  }

  if (Object.keys(updates).length > 0) {
    await Preferences.findOneAndUpdate(
      { userId },
      { $set: updates },
      {
        returnDocument: "after",
        runValidators: true,
        session,
        upsert: true, // Creates the doc if it doesn't exist yet
      },
    );
  }

  audit("user.profile.update", {
    target: { type: "User", id: userId },
    metadata: { name, ...updates },
  });

  return true;
};

export const updatePassword = async (userId, body, session = null) => {
  const { currentPassword, newPassword } = body;

  // 1. Find user and explicitly select password (since it's usually hidden)
  const user = await User.findById(userId).select("+password").session(session);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  if (!user.password) {
    throw new ErrorResponse("This account uses social sign-in and has no password to change.", 400);
  }

  // 2. Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    audit("user.password.change", { outcome: "failure", metadata: { reason: "wrong_password" } });
    throw new ErrorResponse("The current password you entered is incorrect.", 401);
  }

  // 3. Prevent using the same password
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ErrorResponse("New password cannot be the same as the current password.", 400);
  }

  // 4. Update password
  // We set the plain text; the pre-save hook in User.Model handles hashing
  // and sets passwordChangedAt, which signs out every other session.
  user.password = newPassword;

  await user.save({ session });

  audit("user.password.change");

  return true;
};

export const addOrUpdateProfilePicture = async (body, session = null) => {
  const { userId, profilePicture } = body;

  if (!profilePicture || !profilePicture.public_id) {
    throw new ErrorResponse("Please provide the uploaded image details.", 400);
  }

  // The image must be one this user uploaded; its URL comes from our record,
  // never from the request body.
  const asset = await getOwnedAsset(profilePicture.public_id, userId, { mimePrefix: "image/" });

  const preferences = await Preferences.findOne({ userId }).session(session);

  if (!preferences) {
    throw new ErrorResponse("User preferences not found.", 404);
  }

  const previousId = preferences.profilePicture?.public_id;

  preferences.profilePicture = {
    name: asset.name,
    url: asset.url,
    public_id: asset.public_id,
  };

  await preferences.save({ session });

  if (previousId && previousId !== asset.public_id) {
    // Don't block the DB update if deletion fails
    removeFiles(previousId).catch((err) => console.error("Cloudinary deletion failed:", err));
  }

  audit("user.profile_picture.update", { metadata: { public_id: asset.public_id } });

  return preferences.profilePicture;
};

export const removeProfilePicture = async (userId, session = null) => {
  // 1. Find the user's preferences
  const preferences = await Preferences.findOne({ userId }).session(session);

  if (!preferences || !preferences.profilePicture?.public_id) {
    throw new ErrorResponse(
      "No profile picture found to remove or it has already been removed.",
      400,
    );
  }

  const publicId = preferences.profilePicture.public_id;

  // 2. Clear the profilePicture object in the DB
  preferences.profilePicture = undefined;
  await preferences.save({ session });

  // 3. Remove the image from Cloudinary (best-effort)
  removeFiles(publicId).catch((err) => console.error("Cloudinary removal failed:", err));

  audit("user.profile_picture.remove", { metadata: { public_id: publicId } });

  return true;
};
