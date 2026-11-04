import verifyToken from "./verifyToken.js";

/**
 * For public endpoints that show extra detail to logged-in users: verifies the
 * token when one is sent (rejecting a bad one), otherwise continues anonymously.
 */
const optionalAuth = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return verifyToken(req, res, next);
};

export default optionalAuth;
