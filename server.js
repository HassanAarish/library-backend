// Must stay first: stops with a clear list if .env is missing a setting.
import "./config/checkEnvOnStartup.js";
import http from "node:http";
import { getEnv } from "./config/dotenv.js";
import { connectDB } from "./config/db.js";
import app, { CORS_ORIGINS } from "./app.js";
import { flushRequestLogs } from "./middlewares/requestLogger.js";
import { initSocket, closeSocket } from "./realtime/socket.js";
import "./cron/index.js";
import { audit } from "./utils/audit.js";
import { uptimeInfo } from "./utils/uptime.js";

const PORT = getEnv("PORT");
const NODE_ENV = getEnv("NODE_ENV");

// Start and stop are recorded in the admin Logs page. A stop can't tell why it
// happened: on Render, sleeping (free plan), a deploy and a restart all send
// the same SIGTERM, so the entry gives the uptime and leaves the cause open.
connectDB().then(() => {
  audit("system.server.start", { metadata: { mode: NODE_ENV } });
});

// One HTTP server for both the REST API and Socket.IO (same port).
const server = http.createServer(app);

initSocket(server, { origins: CORS_ORIGINS });

server.listen(PORT, () => {
  console.log(`🚀 ~ Server running in ${NODE_ENV} mode on port ${PORT}`);
});

// Give the stop entry a moment to reach the database, but never hang on it.
const STOP_LOG_TIMEOUT_MS = 5000;
let stopping = false;

// Record the stop and write any buffered request logs before the process exits.
const shutdown = async (signal) => {
  if (stopping) return;
  stopping = true;
  const uptime = uptimeInfo();
  console.log(
    `🛑 ${signal} received after ${uptime.human} up (sleep, deploy or restart) — flushing logs...`,
  );
  closeSocket();
  await Promise.race([
    Promise.all([
      audit("system.server.stop", { metadata: { signal, uptime } }),
      flushRequestLogs(),
    ]),
    new Promise((resolve) => setTimeout(resolve, STOP_LOG_TIMEOUT_MS)),
  ]);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
