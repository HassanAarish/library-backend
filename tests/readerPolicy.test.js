import { afterEach, describe, expect, test, vi } from "vitest";
import { getReaderPolicy } from "../config/readerPolicy.js";

afterEach(() => vi.unstubAllEnvs());

describe("reader limits", () => {
  test("come from the environment", () => {
    vi.stubEnv("READER_PAGES_PER_MINUTE", "11");
    vi.stubEnv("READER_MAX_NETWORKS", "5");
    vi.stubEnv("READER_NETWORK_WINDOW_MINUTES", "12");
    expect(getReaderPolicy()).toEqual({
      pagesPerMinute: 11,
      maxNetworks: 5,
      networkWindowSeconds: 720,
    });
  });

  test("fall back to development values when unset", () => {
    vi.stubEnv("READER_PAGES_PER_MINUTE", "");
    const policy = getReaderPolicy();
    expect(policy.pagesPerMinute).toBeGreaterThan(0);
    expect(policy.maxNetworks).toBeGreaterThan(0);
    expect(policy.networkWindowSeconds).toBeGreaterThan(0);
  });
});
