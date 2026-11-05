// Must stay first: stops with a clear list if .env is missing a setting.
import "./config/checkEnvOnStartup.js";
import http from "node:http";
import { getEnv } from "./config/dotenv.js";
import { connectDB } from "./config/db.js";
import app, { CORS_ORIGINS } from "./app.js";
import { flushRequestLogs } from "./middlewares/requestLogger.js";
import { initSocket, closeSocket } from "./realtime/socket.js";
import "./cron/index.js";

const PORT = getEnv("PORT");
const NODE_ENV = getEnv("NODE_ENV");

connectDB();

// One HTTP server for both the REST API and Socket.IO (same port).
const server = http.createServer(app);

initSocket(server, { origins: CORS_ORIGINS });

server.listen(PORT, () => {
  console.log(`🚀 ~ Server running in ${NODE_ENV} mode on port ${PORT}`);
});

// Write any buffered request logs before the process exits.
const shutdown = async (signal) => {
  console.log(`${signal} received — flushing activity logs...`);
  closeSocket();
  await flushRequestLogs();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
