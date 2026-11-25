import mongoose from "mongoose";
import { purgeDueAccounts } from "../../services/AccountDeletion.Service.js";

/** Delete (anonymise) accounts whose 14-day grace period is over. */
export const runAccountDeletions = async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const n = await purgeDueAccounts();
    if (n) console.log(`🚀 ~ Deleted ${n} closed account(s).`);
  } catch (err) {
    console.error('🚀 ~ Cron "account deletions" failed:', err);
  }
};
