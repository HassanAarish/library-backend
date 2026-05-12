import jwt from "jsonwebtoken";
import { getEnv } from "../config/dotenv.js";

const ACCESS_TOKEN_EXPIRATION = getEnv("ACCESS_TOKEN_EXPIRATION");
const SECRET_KEY = getEnv("SECRET_KEY");

const generateToken = (userInfo) => {
  const accessTokenExpiration = ACCESS_TOKEN_EXPIRATION || "30d";

  const accessToken = jwt.sign(
    {
      user: {
        userEmail: userInfo.email,
        userID: userInfo._id,
        role: userInfo.role,
      },
    },
    SECRET_KEY,
    {
      expiresIn: accessTokenExpiration,
    }
  );
  return accessToken;
};

export { generateToken };
