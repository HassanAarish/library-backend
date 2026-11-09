import { getEnv } from "./dotenv.js";

/**
 * Limits that spot someone copying a book. The real values live only in the
 * environment, because this repository is public: anyone who knew them could
 * stay just under them. Production won't start without them (config/env.js).
 *
 * The fallbacks are for development and tests only. Don't reuse them in
 * production, and don't write the production values in code or docs.
 */
const number = (name, fallback) => Number(getEnv(name)) || fallback;

export const getReaderPolicy = () => ({
  pagesPerMinute: number("READER_PAGES_PER_MINUTE", 40),
  maxNetworks: number("READER_MAX_NETWORKS", 3),
  networkWindowSeconds: number("READER_NETWORK_WINDOW_MINUTES", 30) * 60,
});

export default getReaderPolicy();
