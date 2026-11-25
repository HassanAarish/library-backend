// Loaded before every test file. config/dotenv.js skips the real .env when
// NODE_ENV is "test", so only these values are used.
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "0",
  SECRET_KEY: "test-secret-key-that-is-long-enough-123",
  CLIENT_URL: "http://localhost:5173",
  REDIS_URL: "",

  CLOUDINARY_CLOUD_NAME: "test",
  CLOUDINARY_API_KEY: "test",
  CLOUDINARY_API_SECRET: "test",

  // A port nothing listens on: every email fails fast and is logged
  // ("Failed to send ..."), which tests use to count notifications.
  EMAIL: "noreply@libraryhub.test",
  PASSWORD: "test",
  EMAIL_HOST: "127.0.0.1",
  EMAIL_PORT: "9",

  EASYPAISA_ACCOUNT_TITLE: "LibraryHub Owner",
  EASYPAISA_ACCOUNT_NUMBER: "03001234567",
});
