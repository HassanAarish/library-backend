import { z } from "zod";
import "./dotenv.js";

/**
 * Startup check of the environment. Missing or malformed required settings
 * stop the server with a clear list instead of failing later at random
 * (first email, first upload, first login, …). Optional features that are
 * switched off only produce a warning.
 */

// An empty value counts as "not set".
const unsetIfEmpty = (schema) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const required = (schema) => unsetIfEmpty(schema);
const optional = (schema) => unsetIfEmpty(schema.optional());

const positiveInt = z.coerce
  .number({ message: "must be a whole positive number" })
  .int({ message: "must be a whole positive number" })
  .positive({ message: "must be a whole positive number" });
const url = z.url({ message: "must be a full URL, e.g. https://example.pk" });

const schema = z.object({
  NODE_ENV: optional(z.enum(["development", "production", "test"])),
  PORT: required(positiveInt),

  MONGO_URI: required(
    z.string().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  ),
  SECRET_KEY: required(z.string()),
  ACCESS_TOKEN_EXPIRATION: optional(z.string()),

  CLIENT_URL: optional(url), // required in production (see below)
  CORS_ORIGINS: optional(z.string()),

  CLOUDINARY_CLOUD_NAME: required(z.string()),
  CLOUDINARY_API_KEY: required(z.string()),
  CLOUDINARY_API_SECRET: required(z.string()),

  EMAIL: required(z.email({ message: "must be an email address" })),
  PASSWORD: required(z.string()),
  EMAIL_HOST: optional(z.string()),
  EMAIL_PORT: optional(positiveInt),

  REDIS_URL: optional(z.string().regex(/^rediss?:\/\//, "must start with redis:// or rediss://")),

  GOOGLE_CLIENT_ID: optional(z.string()),
  FACEBOOK_APP_ID: optional(z.string()),
  FACEBOOK_APP_SECRET: optional(z.string()),
  TWO_FA_ISSUER: optional(z.string()),
  OPENLIBRARY_CONTACT: optional(z.string()),

  EASYPAISA_ACCOUNT_TITLE: optional(z.string()),
  EASYPAISA_ACCOUNT_NUMBER: optional(
    z.string().regex(/^03\d{9}$/, "must be an 11-digit mobile number like 03001234567"),
  ),

  REQUEST_LOG_RETENTION_DAYS: optional(positiveInt),
  NOTIFICATION_RETENTION_DAYS: optional(positiveInt),
});

const isSet = (v) => typeof v === "string" && v.trim() !== "";

// Rules that involve more than one setting. Run on the raw values so they are
// reported even when other settings are invalid.
const crossChecks = (env) => {
  const errors = [];
  const production = env.NODE_ENV === "production";

  if (production && !isSet(env.CLIENT_URL)) {
    errors.push("CLIENT_URL is required in production (password-reset links and CORS use it)");
  }
  if (production && isSet(env.SECRET_KEY) && env.SECRET_KEY.length < 32) {
    errors.push("SECRET_KEY must be at least 32 characters in production");
  }
  if (isSet(env.EASYPAISA_ACCOUNT_TITLE) !== isSet(env.EASYPAISA_ACCOUNT_NUMBER)) {
    errors.push("set both EASYPAISA_ACCOUNT_TITLE and EASYPAISA_ACCOUNT_NUMBER, or neither");
  }
  if (isSet(env.FACEBOOK_APP_ID) !== isSet(env.FACEBOOK_APP_SECRET)) {
    errors.push("set both FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, or neither");
  }
  return errors;
};

const FEATURE_WARNINGS = [
  [
    (e) => !isSet(e.CLIENT_URL),
    "CLIENT_URL is not set: password-reset links will be broken and CORS allows only http://localhost:5173.",
  ],
  [
    (e) => !isSet(e.EASYPAISA_ACCOUNT_NUMBER),
    "Easypaisa is not configured: paid bookings and packages return 503.",
  ],
  [(e) => !isSet(e.GOOGLE_CLIENT_ID), "GOOGLE_CLIENT_ID is not set: Google sign-in is disabled."],
  [(e) => !isSet(e.FACEBOOK_APP_ID), "FACEBOOK_APP_ID is not set: Facebook sign-in is disabled."],
  [
    (e) => !isSet(e.REDIS_URL),
    "REDIS_URL is not set: rate limits, cache and sockets are per-instance.",
  ],
];

/**
 * @param {object} [env=process.env]
 * @returns {{ errors: string[], warnings: string[] }} values are never included
 */
export const checkEnv = (env = process.env) => {
  const result = schema.safeParse(env);

  const fieldErrors = result.success
    ? []
    : result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        return isSet(env[key]) ? `${key} ${issue.message}` : `${key} is required`;
      });

  const errors = [...fieldErrors, ...crossChecks(env)];

  const warnings = FEATURE_WARNINGS.filter(([isOff]) => isOff(env)).map(([, text]) => text);

  return { errors, warnings };
};

/** Print the check and stop the process if a required setting is wrong. */
export const validateEnvOrExit = () => {
  const { errors, warnings } = checkEnv();

  warnings.forEach((w) => console.warn(`⚠️  ${w}`));

  if (errors.length) {
    console.error("❌ Invalid environment configuration (.env):");
    errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }
};
