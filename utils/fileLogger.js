import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep app logs alongside the existing morgan access.log (config/logs is
// already gitignored).
const logsDir = path.join(__dirname, "..", "config", "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Append a timestamped line to config/logs/<file>. Fire-and-forget and
 * fail-soft: a logging error is reported to the console but never thrown, so it
 * can't break the caller (e.g. a cron job).
 *
 * @param {string} file - log filename, e.g. "deleted-users.log"
 * @param {string} message - the line to write (timestamp is added automatically)
 */
export const writeLog = (file, message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(path.join(logsDir, file), line, (err) => {
    if (err) console.error("Log write failed:", err.message);
  });
};
