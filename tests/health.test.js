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

  test("records the reader's address behind Render's internal proxies", async () => {
    // Render's edge appends the real client; its internal hops are 10.x.
    const r = await t.api("POST", "/auth/login", {
      body: { authType: "email", email: "nobody-proxy@test.pk", password: "Wrong-pass1" },
      headers: { "X-Forwarded-For": "198.51.100.7, 10.12.0.5" },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(401);
    // Audit writes are fire-and-forget, so give it a moment to land.
    const { default: AuditLog } = await import("../models/AuditLog.Model.js");
    let entry = null;
    for (let i = 0; i < 20 && !entry; i++) {
      entry = await AuditLog.findOne({ actorEmail: "nobody-proxy@test.pk" }).lean();
      if (!entry) await new Promise((r) => setTimeout(r, 100));
    }
    expect(entry?.ip).toBe("198.51.100.7");
  });

  test("GET /admin/ip-check shows an admin the address the server sees", async () => {
    const admin = await t.mkUser("Admin", { role: "admin" });
    const reader = await t.mkUser("Reader");
    const headers = { "X-Forwarded-For": "198.51.100.8, 10.12.0.5" };

    const r = await t.api("GET", "/admin/ip-check", { token: admin.token, headers });
    expect(r.status).toBe(200);
    expect(r.json.data.ip).toBe("198.51.100.8");
    expect(r.json.data.forwardedFor).toBe("198.51.100.8, 10.12.0.5");

    const denied = await t.api("GET", "/admin/ip-check", { token: reader.token, headers });
    expect(denied.status).toBe(403);
  });

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
