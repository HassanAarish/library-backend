import AuditLog from "../models/AuditLog.Model.js";
import Preferences from "../models/Preferences.Model.js";
import Rental from "../models/Rental.Model.js";
import RequestLog from "../models/RequestLog.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { afterCommit } from "../utils/requestContext.js";
import { disconnectUser } from "../realtime/socket.js";

// Never sent to any client — not even the admin.
const USER_SECRET_FIELDS = "-password -otp -resetPassword -twoFactor.secret";

export const getUserLists = async (req) => {
  const options = {
    select: USER_SECRET_FIELDS,
    sort: { createdAt: -1 },
    searchFields: ["name", "email"],
    filterFields: ["role", "isBlocked", "isVerified", "authType"],
  };
  const paginatedData = await helper.paginate(User, req, options);

  return paginatedData;
};

export const getUserData = async (userId) => {
  // 1. Fetch User and Preferences in parallel
  const [user, preferences, rentalCount] = await Promise.all([
    User.findById(userId).select(USER_SECRET_FIELDS).lean(),
    Preferences.findOne({ userId }).lean(),
    Rental.countDocuments({ renterId: userId }),
  ]);

  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }

  return {
    ...user,
    profile: preferences || {},
    stats: {
      totalRentals: rentalCount,
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

  // Targeted update: blocking must work even if some unrelated field of an
  // old account wouldn't pass today's validation.
  user.isBlocked = !user.isBlocked;
  await User.updateOne({ _id: user._id }, { $set: { isBlocked: user.isBlocked } }, { session });

  audit(user.isBlocked ? "admin.user.block" : "admin.user.unblock", {
    target: { type: "User", id: user._id },
    metadata: { email: user.email },
  });

  // A blocked user's open tabs lose live access at once (their next HTTP
  // request is refused by verifyToken anyway).
  if (user.isBlocked) afterCommit(() => disconnectUser(user._id));

  return {
    isBlocked: user.isBlocked,
    name: user.name,
  };
};

/**
 * Audit trail. Query params: action, outcome, severity, actor, ip, requestId,
 * target.id, search (action / email), from, to, page, limit.
 */
export const getAuditLogs = async (req) => {
  const { from, to } = req.query;

  return helper.paginate(AuditLog, req, {
    sort: { createdAt: -1 },
    searchFields: ["action", "actorEmail", "metadata.email"],
    filterFields: ["action", "outcome", "severity", "actor", "ip", "requestId", "target.id"],
    filters: helper.dateRangeFilter(from, to),
    populate: { path: "actor", select: "name email role" },
  });
};

/**
 * Raw HTTP request log. Query params: user, ip, method, status, requestId,
 * search (path), from, to, page, limit.
 */
export const getRequestLogs = async (req) => {
  const { from, to } = req.query;

  return helper.paginate(RequestLog, req, {
    sort: { createdAt: -1 },
    searchFields: ["path"],
    filterFields: ["user", "ip", "method", "status", "requestId"],
    filters: helper.dateRangeFilter(from, to),
    populate: { path: "user", select: "name email role" },
  });
};
