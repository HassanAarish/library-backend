import ErrorResponse from "../utils/errorResponse.js";
import morgan from "morgan";

// Middleware for handling errors

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.error("❌ Error Intercepted:", err);

  // 1. Mongoose Duplicate Key (Error Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
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

  // --- LOGGING LOGIC ---
  const errorDetails = [
    `Error: ${error.message || "Internal Server Error"}`,
    `Stack: ${err.stack || "No stack trace available"}`,
    `IP: ${req.ip}`,
    `URL: ${req.originalUrl}`,
    `Method: ${req.method}`,
    `Status Code: ${error.statusCode || 500}`,
  ].join(" | ");

  // Custom Morgan token for errors
  morgan.token("error-details", () => errorDetails);
  morgan(":method :url :status :error-details")(req, res, () => {});

  // Send the error response to the client
  res.status(error.statusCode || 500).json({
    success: false,
    // Keep the structure consistent with your other APIs
    error: error.message || "Internal Server Error",
  });
};

export default errorHandler;
