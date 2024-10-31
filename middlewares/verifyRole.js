import ErrorResponse from "../utils/errorResponse.js";

const verifyRole = (...roles) => {
  try {
    return async (req, res, next) => {
      if (!req?.role) {
        return next(new ErrorResponse("User role not found", 403));
      }

      // Check if the user's role is included in the roles passed to the middleware
      const isAllowed = roles.includes(req.role);

      if (!isAllowed) {
        return next(new ErrorResponse("Permission Denied", 403));
      }

      next();
    };
  } catch (error) {
    return next(error);
  }
};

export default verifyRole;
