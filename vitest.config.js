import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // One in-memory MongoDB replica set (transactions need one) for the run.
    globalSetup: ["./tests/support/globalSetup.js"],
    // Test environment variables, set before any app module is loaded.
    setupFiles: ["./tests/support/env.js"],
    // Files share the database server and run their steps in order.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
