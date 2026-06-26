import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getEnv = (key) => {
  const value = process.env[key];
  return value;
};
