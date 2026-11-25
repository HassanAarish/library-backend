import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestServer } from "./support/testServer.js";
import { formatUptime } from "../utils/uptime.js";

describe("uptime formatting", () => {
  test.each([
    [0, "0s"],
    [59, "59s"],
    [60, "1m 0s"],
    [3661, "1h 1m 1s"],
    [93784, "1d 2h 3m 4s"],
    [86400, "1d 0h 0m 0s"],
  ])("%i seconds is %s", (seconds, text) => {
    expect(formatUptime(seconds)).toBe(text);
  });
});

describe("GET /health", () => {
  let t;
  beforeAll(async () => {
    t = await startTestServer("health");
  });
  afterAll(() => t?.close());

  test("reports how long the server has been up", async () => {
    const r = await t.api("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    const { uptime } = r.json;
    expect(uptime.seconds).toBeGreaterThanOrEqual(0);
    expect(typeof uptime.human).toBe("string");
    expect(new Date(uptime.startedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
