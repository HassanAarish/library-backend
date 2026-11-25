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
    },
  );
  return accessToken;
};

/**
 * A short-lived token that proves the FIRST factor (password or social) passed
 * but the login isn't complete until the 2FA code is verified. Not a real
 * access token — it only carries `twoFactorPending` + the user id.
 */
const generatePendingToken = (userInfo) => {
  return jwt.sign({ twoFactorPending: true, userID: userInfo._id }, SECRET_KEY, {
    expiresIn: "5m",
  });
};

export { generateToken, generatePendingToken };
