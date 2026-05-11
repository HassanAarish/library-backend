import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select("-password");

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  const pref = await Preferences.findOne({ userId });

  // Return a single combined object
  return {
    user,
    preferences: pref || {}, // Nesting avoids ID conflicts
  };
};
