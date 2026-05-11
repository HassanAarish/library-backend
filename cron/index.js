import cron from "node-cron";
import { cleanupUnverifiedUsers } from "./jobs/index.js";

cron.schedule("*/10 * * * *", cleanupUnverifiedUsers, {
  timezone: "Asia/Karachi",
});
