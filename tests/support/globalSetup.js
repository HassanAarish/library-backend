import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Starts a single-node in-memory replica set once per test run. Each test
 * file uses its own database on it (see testServer.js). Nothing ever touches
 * the real database.
 */
export default async function setup({ provide }) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 120_000 }],
  });

  provide("mongoUri", replSet.getUri());

  return async () => {
    await replSet.stop();
  };
}
