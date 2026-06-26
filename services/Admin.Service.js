import Book from "../models/Book.Model.js";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";

export const getUserLists = async (req) => {
  const options = {
    select: "-password", // Exclude sensitive info
    sort: { createdAt: -1 },
    searchFields: ["name", "email"],
  };
  const paginatedData = await helper.paginate(User, req, options);

  return paginatedData;
};

export const getUserData = async (userId) => {
  // 1. Fetch User and Preferences in parallel
  const [user, preferences, bookCount] = await Promise.all([
    User.findById(userId).select("-password").lean(),
    Preferences.findOne({ userId }).lean(),
    Book.countDocuments({ uploader: userId }),
  ]);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  return {
    ...user,
    profile: preferences || {},
    stats: {
      totalBooksUploaded: bookCount,
    },
  };
};

export const toggleUserBlock = async (userId, session = null) => {
  const user = await User.findById(userId).session(session);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  // Prevent admin from blocking themselves accidentally
  if (user.role === "admin") {
    throw new ErrorResponse("Administrative accounts cannot be blocked.", 400);
  }

  user.isBlocked = !user.isBlocked;

  await user.save({ session });

  return {
    isBlocked: user.isBlocked,
    name: user.name,
  };
};
