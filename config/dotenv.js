import dotenv from "dotenv";

// Tests configure their own environment and must never pick up the real
// .env (production database, SMTP, payment accounts, …).
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ quiet: true });
}

export const getEnv = (key) => {
  const value = process.env[key];
  return value;
};
