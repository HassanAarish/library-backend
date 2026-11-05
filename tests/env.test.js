import { describe, expect, test } from "vitest";
import { checkEnv } from "../config/env.js";

const valid = {
  NODE_ENV: "production",
  PORT: "5000",
  MONGO_URI: "mongodb+srv://user:pass@cluster.example.net/library",
  SECRET_KEY: "x".repeat(40),
  CLIENT_URL: "https://libraryhub.pk",
  CLOUDINARY_CLOUD_NAME: "c",
  CLOUDINARY_API_KEY: "k",
  CLOUDINARY_API_SECRET: "s",
  EMAIL: "noreply@libraryhub.pk",
  PASSWORD: "p",
  REDIS_URL: "rediss://default:pw@redis.example.net:6379",
  GOOGLE_CLIENT_ID: "g",
  FACEBOOK_APP_ID: "f",
  FACEBOOK_APP_SECRET: "fs",
  EASYPAISA_ACCOUNT_TITLE: "Owner",
  EASYPAISA_ACCOUNT_NUMBER: "03001234567",
};

describe("environment check", () => {
  test("a complete production config passes with no warnings", () => {
    expect(checkEnv(valid)).toEqual({ errors: [], warnings: [] });
  });

  test("missing required settings are listed by name", () => {
    const { errors } = checkEnv({ ...valid, MONGO_URI: undefined, PASSWORD: "  " });
    expect(errors).toContain("MONGO_URI is required");
    expect(errors).toContain("PASSWORD is required");
  });

  test("malformed values are explained without echoing them", () => {
    const { errors } = checkEnv({
      ...valid,
      PORT: "abc",
      MONGO_URI: "postgres://secret@x",
      EMAIL: "nope",
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "PORT must be a whole positive number",
        "MONGO_URI must start with mongodb:// or mongodb+srv://",
        "EMAIL must be an email address",
      ]),
    );
    expect(errors.join(" ")).not.toContain("secret@x");
  });

  test("production needs a long SECRET_KEY and a CLIENT_URL", () => {
    const { errors } = checkEnv({ ...valid, SECRET_KEY: "short", CLIENT_URL: undefined });
    expect(errors).toContain("SECRET_KEY must be at least 32 characters in production");
    expect(errors).toContain(
      "CLIENT_URL is required in production (password-reset links and CORS use it)",
    );
  });

  test("development tolerates a short key and missing CLIENT_URL, with a warning", () => {
    const { errors, warnings } = checkEnv({
      ...valid,
      NODE_ENV: "development",
      SECRET_KEY: "short",
      CLIENT_URL: "",
    });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.startsWith("CLIENT_URL is not set"))).toBe(true);
  });

  test("paired settings must be set together", () => {
    const { errors } = checkEnv({
      ...valid,
      EASYPAISA_ACCOUNT_NUMBER: "",
      FACEBOOK_APP_SECRET: "",
    });
    expect(errors).toContain(
      "set both EASYPAISA_ACCOUNT_TITLE and EASYPAISA_ACCOUNT_NUMBER, or neither",
    );
    expect(errors).toContain("set both FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, or neither");
  });

  test("an Easypaisa number must look like a Pakistani mobile number", () => {
    const { errors } = checkEnv({ ...valid, EASYPAISA_ACCOUNT_NUMBER: "12345" });
    expect(errors[0]).toMatch(/^EASYPAISA_ACCOUNT_NUMBER must be an 11-digit mobile number/);
  });

  test("optional features that are off produce warnings, not errors", () => {
    const { errors, warnings } = checkEnv({
      ...valid,
      EASYPAISA_ACCOUNT_TITLE: "",
      EASYPAISA_ACCOUNT_NUMBER: "",
      REDIS_URL: "",
      GOOGLE_CLIENT_ID: "",
    });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(3);
  });
});
