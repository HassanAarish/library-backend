/**
 * Make the database indexes match the models: creates missing ones and DROPS
 * indexes no model defines any more (e.g. the old Rental unique index on
 * { renterId, bookId, status }, which would block repeat bookings).
 *
 *   node scripts/sync-indexes.js           # show what would change
 *   node scripts/sync-indexes.js --apply   # change it
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { getEnv } from "../config/dotenv.js";

const APPLY = process.argv.includes("--apply");
const modelsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models");

const run = async () => {
  for (const file of fs.readdirSync(modelsDir).filter((f) => f.endsWith(".Model.js"))) {
    await import(`../models/${file}`);
  }

  await mongoose.connect(getEnv("MONGO_URI"));
  console.log(APPLY ? "APPLYING\n" : "DRY RUN (use --apply to change)\n");

  for (const model of Object.values(mongoose.models)) {
    const diff = await model.diffIndexes();
    if (!diff.toDrop.length && !diff.toCreate.length) continue;

    console.log(`• ${model.modelName}`);
    diff.toDrop.forEach((name) => console.log(`    drop:   ${name}`));
    diff.toCreate.forEach((spec) => console.log(`    create: ${JSON.stringify(spec)}`));

    if (APPLY) await model.syncIndexes();
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Index sync failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
