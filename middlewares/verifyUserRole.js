import ErrorResponse from "../utils/errorResponse.js";

const verifyUserRole = (...roles) => {
  return (req, res, next) => {
    if (!req?.userRole) {
      return next(new ErrorResponse("User role not found", 404));
    }
    const allowedRoles = ["admin", "user"];
    const isAllowed = roles.some((role) => allowedRoles.includes(role));

    if (!isAllowed) {
      return next(new ErrorResponse("Permission Denied", 404));
    }
    next();
  };
};

export default verifyUserRole;
