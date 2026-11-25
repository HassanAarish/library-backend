// Imported first by server.js: ES modules evaluate imports in order, so this
// runs before any other module reads the environment.
import { validateEnvOrExit } from "./env.js";

validateEnvOrExit();
