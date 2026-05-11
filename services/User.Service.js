import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { v2 as cloudinary } from "cloudinary";

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select("-password");

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

  if (name) {
    await User.findByIdAndUpdate(userId, { name }, { session });
  }

  const updatedPrefs = await Preferences.findOneAndUpdate(
    { userId },
    { $set: prefData },
    {
      returnDocument: "after",
      runValidators: true,
      session,
      upsert: true, // Creates the doc if it doesn't exist yet
    }
  );

  return true;
};

export const updatePassword = async (userId, body, session = null) => {
  const { currentPassword, newPassword } = body;

  // 1. Find user and explicitly select password (since it's usually hidden)
  const user = await User.findById(userId).select("+password").session(session);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  // 2. Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ErrorResponse(
      "The current password you entered is incorrect.",
      401
    );
  }

  // 3. Prevent using the same password
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ErrorResponse(
      "New password cannot be the same as the current password.",
      400
    );
  }

  // 4. Update password
  // We set the plain text; the pre-save hook in User.Model handles hashing automatically
  user.password = newPassword;

  await user.save({ session });

  return true;
};

export const addOrUpdateProfilePicture = async (body, session = null) => {
  const { userId, profilePicture } = body;

  if (!profilePicture || !profilePicture.public_id) {
    throw new ErrorResponse("Please provide the uploaded image details.", 400);
  }

  const preferences = await Preferences.findOne({ userId }).session(session);

  if (!preferences) {
    throw new ErrorResponse("User preferences not found.", 404);
  }

  if (preferences.profilePicture && preferences.profilePicture.public_id) {
    try {
      await cloudinary.uploader.destroy(preferences.profilePicture.public_id);
    } catch (err) {
      console.error("Cloudinary deletion failed:", err);
      // We don't throw here to avoid blocking the DB update if deletion fails
    }
  }

  preferences.profilePicture = {
    name: profilePicture.name,
    url: profilePicture.url,
    public_id: profilePicture.public_id,
  };

  await preferences.save({ session });

  return preferences.profilePicture;
};

export const removeProfilePicture = async (userId, session = null) => {
  // 1. Find the user's preferences
  const preferences = await Preferences.findOne({ userId }).session(session);

  if (!preferences || !preferences.profilePicture?.public_id) {
    throw new ErrorResponse(
      "No profile picture found to remove or it has already been removed.",
      400
    );
  }

  // 2. Remove the image from Cloudinary
  try {
    await cloudinary.uploader.destroy(preferences.profilePicture.public_id);
  } catch (err) {
    console.error("Cloudinary removal failed:", err);
    // Optional: You could throw here if you want to ensure the DB only
    // updates if Cloudinary successfully deletes.
  }

  // 3. Clear the profilePicture object in the DB
  preferences.profilePicture = undefined;
  await preferences.save({ session });

  return true;
};
