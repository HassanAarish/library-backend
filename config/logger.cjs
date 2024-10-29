const winston = require("winston");
const fs = require("fs");
const path = require("path");

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

const logDir = path.join(__dirname, "logs");

// Create the log directory if it does not exist

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "info.log"),
      level: "info",
    }), // Info logs to info.log
    new winston.transports.File({
      filename: path.join(logDir, "warn.log"),
      level: "warn",
    }), // Warn logs to warn.log
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }), // Error logs to error.log
  ],
});

module.exports = logger;
