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
    return res.status(401).json({
      message: "User unauthorized: ",
    });
  }

  try {
    jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message:
            "User unauthorized: Please login or signup to place the order",
        });
      }
      req.userID = decoded.user.userID;
      req.userRole = decoded.user.role;
      req.userEmail = decoded.user.userEmail;
      next();
    });
  } catch (error) {
    return res.status(401).json({
      message: "Not authorized to access this route: ",
    });
  }
};

export default verifyUserToken;
