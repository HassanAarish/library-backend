import ErrorResponse from "../utils/errorResponse.js";
import jwt from "jsonwebtoken";

const verifyUserToken = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization?.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("No access token was provided.", 401));
  }

  try {
    jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (err) {
        return next(new ErrorResponse("Invalid access token.", 401));
      }
      req.userID = decoded.user.userID;
      req.userRole = decoded.user.role;
      req.userEmail = decoded.user.userEmail;
      next();
    });
  } catch (error) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }
};

export default verifyUserToken;
