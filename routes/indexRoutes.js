import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routeFiles = fs
  .readdirSync(__dirname)
  .filter((file) => file.endsWith(".Routes.js") && file !== "indexRoutes.js");

for (const file of routeFiles) {
  const module = await import(`./${file}`);
  const routes = module?.default;

  if (!routes) {
    continue;
  }

  const baseName = file.replace(/\.Routes\.js$/i, "");
  const mountPath = `/${baseName.toLowerCase()}`;
  router.use(mountPath, routes);
}

export default router;
