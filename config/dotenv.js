import dotenv from "dotenv";
dotenv.config();

export const getEnv = (key) => {
  const value = process.env[key];
  return value;
};
