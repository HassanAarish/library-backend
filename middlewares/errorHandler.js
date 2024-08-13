import ErrorResponse from "../utils/errorResponse.js";
import logger from "../config/logger.cjs";

// Middleware for handling errors

const errorHandler = (err, req, res, next) => {
  console.error(err);

  let error = { ...err };
  error.message = err.message;

  // Duplicate key error
  if (error.name === "MongoError" && error.code === 11000) {
    const message = "Duplicate field value entered";
    error = new ErrorResponse(message, 400);
  }

  // MongoDB CastError (Invalid ID)

  if (error.name === "CastError") {
    const message = "Resource not found";
    error = new ErrorResponse(message, 404);
  }

  // MongoDB validation error

  if (err.name === "ValidationError") {
    const message = Object.values(err.erroors)
      .map((error) => error.message)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  // Log to error using the configured logger, including the complete traceback
  logger.error(error.message || "Internal Server Error", {
    stack: error.stack,
  });

  // Send the error response to the client

  res.status(error.statusCode || 500).json({
    success: false,
    data: { error: error.message || "Internal Server Error" },
  });
};

export default errorHandler;
