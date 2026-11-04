import { getEnv } from "../config/dotenv.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { audit } from "../utils/audit.js";
import { getContext } from "../utils/requestContext.js";
import jwt from "jsonwebtoken";

const SECRET_KEY = getEnv("SECRET_KEY");

const verifyToken = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("No access token was provided.", 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new ErrorResponse("Token has expired.", 401));
    }
    // A bad signature or malformed token is a tampering signal, not normal expiry.
    audit("auth.token.invalid", { outcome: "failure", metadata: { reason: error.message } });
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  // Database check: blocked status, current role, and password changes are
  // read from the DB so they take effect immediately, not when the token expires.
  const user = await User.findById(decoded.user?.userID)
    .select("isBlocked role email passwordChangedAt")
    .lean();

  if (!user) {
    return next(new ErrorResponse("User no longer exists.", 404));
  }

  if (user.isBlocked) {
    audit("auth.blocked_user_access", {
      outcome: "failure",
      actor: user._id,
      actorEmail: user.email,
      metadata: { path: req.originalUrl, method: req.method },
    });
    return next(new ErrorResponse("Account is suspended. Please contact support.", 403));
  }

  // Tokens issued before the last password change are no longer valid.
  if (user.passwordChangedAt && decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
    return next(new ErrorResponse("Your session has expired. Please log in again.", 401));
  }

  req.userID = String(user._id);
  req.role = user.role;
  req.userEmail = user.email;

  // Expose the identity to the activity logs for the rest of this request.
  const context = getContext();
  context.userId = req.userID;
  context.role = req.role;
  context.userEmail = req.userEmail;

  next();
};

export default verifyToken;
