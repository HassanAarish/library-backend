/**
 * Make an existing account an admin (there is no sign-up for admins).
 * Sign up on the website first, then:
 *
 *   node scripts/make-admin.js you@example.com
 *
 * Uses MONGO_URI from the environment (.env locally; on Render, run it from
 * the service's Shell tab). Recorded in the audit log.
 */
import mongoose from "mongoose";
import { getEnv } from "../config/dotenv.js";
import User from "../models/User.Model.js";
import { audit } from "../utils/audit.js";

const email = (process.argv[2] ?? "").trim().toLowerCase();

const run = async () => {
  if (!/.+@.+\..+/.test(email)) {
    console.error("Usage: node scripts/make-admin.js <email>");
    process.exit(1);
  }
  await mongoose.connect(getEnv("MONGO_URI"));

  const user = await User.findOne({ email });
  if (!user || user.deletedAt) {
    console.error(`No account for ${email}. Sign up on the website first.`);
    process.exit(1);
  }
  if (!user.isVerified) {
    console.error(`${email} hasn't verified its email yet. Finish sign-up first.`);
    process.exit(1);
  }
  if (user.role === "admin") {
    console.log(`${email} is already an admin.`);
  } else {
    await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });
    audit("system.user.make_admin", {
      actorEmail: "system",
      target: { type: "User", id: user._id },
      metadata: { email },
    });
    console.log(`${email} is now an admin. Reload the website to see the admin console.`);
  }

  // Let the audit write finish before closing.
  await new Promise((r) => setTimeout(r, 500));
  await mongoose.disconnect();
};

// Exit explicitly: the audit file logger keeps a file open otherwise.
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
