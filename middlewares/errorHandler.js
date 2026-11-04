import ErrorResponse from "../utils/errorResponse.js";
import { getEnv } from "../config/dotenv.js";

const IS_PRODUCTION = getEnv("NODE_ENV") === "production";

// Middleware for handling errors

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.error("❌ Error Intercepted:", err);

  // 1. Mongoose Duplicate Key (Error Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "value";
    const message = `Duplicate field value entered: ${field}. Please use another value.`;
    error = new ErrorResponse(message, 400);
  }

  // 2. Mongoose CastError (Invalid ObjectId)
  if (err.name === "CastError") {
    const message = `Resource not found. Invalid ID format: ${err.value}`;
    error = new ErrorResponse(message, 404);
  }

  // 3. Mongoose ValidationError
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  // 4. Multer File Size Limit
  if (err.code === "LIMIT_FILE_SIZE") {
    const message = "File is too large. Maximum limit is 10MB.";
    error = new ErrorResponse(message, 400);
  }

  // 5. Multer File Count Limit
  if (err.code === "LIMIT_FILE_COUNT") {
    const message = "Too many files uploaded. Maximum limit is 10 files.";
    error = new ErrorResponse(message, 400);
  }

  // 6. Malformed JSON body
  if (err.type === "entity.parse.failed") {
    error = new ErrorResponse("Malformed JSON in request body.", 400);
  }

  // 7. Body too large
  if (err.type === "entity.too.large") {
    error = new ErrorResponse("Request body is too large.", 413);
  }

  const statusCode = error.statusCode || 500;

  // The real reason always goes to the activity log (RequestLog.error)…
  res.locals.errorMessage =
    statusCode >= 500 && err.stack ? err.stack : error.message || err.message;

  // …but unexpected 500s never leak internals to the client in production.
  const clientMessage =
    statusCode >= 500 && IS_PRODUCTION
      ? "Internal Server Error"
      : error.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    // Keep the structure consistent with your other APIs
    error: clientMessage,
    requestId: req.requestId,
  });
};

export default errorHandler;
