import cron from "node-cron";
import {
  cleanupUnverifiedUsers,
  runRentalLifecycle,
  runPackageReminders,
  runAccountDeletions,
} from "./jobs/index.js";

// NOTE: if the API ever runs as several instances, run these on one only.

cron.schedule("*/10 * * * *", cleanupUnverifiedUsers, {
  timezone: "Asia/Karachi",
});

// Release unpaid holds, start/finish rentals, expire packages.
cron.schedule("* * * * *", runRentalLifecycle, {
  timezone: "Asia/Karachi",
});

// Credit expiry reminders, once a day at 10:00 PKT.
cron.schedule("0 10 * * *", runPackageReminders, {
  timezone: "Asia/Karachi",
});

// Accounts closed for deletion whose grace period is over, every hour.
cron.schedule("15 * * * *", runAccountDeletions, {
  timezone: "Asia/Karachi",
});
