import ErrorResponse from "../utils/errorResponse.js";

const verifyRole =
  (...roles) =>
  (req, res, next) => {
    if (!req?.role) {
      return next(new ErrorResponse("User role not found", 403));
    }

    // Check if the user's role is included in the roles passed to the middleware
    if (!roles.includes(req.role)) {
      return next(new ErrorResponse("Permission Denied", 403));
    }

    next();
  };

export default verifyRole;
