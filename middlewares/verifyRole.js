import ErrorResponse from "../utils/errorResponse.js";
import { audit } from "../utils/audit.js";

const verifyRole =
  (...roles) =>
  (req, res, next) => {
    if (!req?.role) {
      return next(new ErrorResponse("User role not found", 403));
    }

    // Check if the user's role is included in the roles passed to the middleware
    if (!roles.includes(req.role)) {
      audit("authz.denied", {
        outcome: "failure",
        metadata: { requiredRoles: roles, path: req.originalUrl, method: req.method },
      });
      return next(new ErrorResponse("Permission Denied", 403));
    }

    next();
  };

export default verifyRole;
