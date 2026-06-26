import { getEnv } from "../config/dotenv.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
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

  try {
    // 1. Verify Token Synchronously (or use util.promisify)
    const decoded = jwt.verify(token, SECRET_KEY);

    // 2. Database Check (Critical for Blocked Status)
    const user = await User.findById(decoded.user.userID).select("isBlocked");

    if (!user) {
      return next(new ErrorResponse("User no longer exists.", 404));
    }

    if (user.isBlocked) {
      return next(new ErrorResponse("Account is suspended. Please contact support.", 403));
    }

    // 3. Attach to Request
    req.userID = decoded.user.userID;
    req.role = decoded.user.role;
    req.userEmail = decoded.user.userEmail;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new ErrorResponse("Token has expired.", 401));
    }
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }
};

export default verifyToken;
