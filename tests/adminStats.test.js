import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestServer } from "./support/testServer.js";

let t;
let admin, reader;

const DAY = 86_400_000;

beforeAll(async () => {
  t = await startTestServer("adminStats");
  admin = await t.mkUser("Admin", { role: "admin" });
  reader = await t.mkUser("Reader");

  const now = Date.now();
  const book = await t.mkBook("Stats Book");
  await t.mkBook("Draft Book", { status: "draft" });
  await t.db.collection("payments").insertMany([
    {
      user: reader.id,
      purpose: "rental",
      amount: 300,
      method: "easypaisa",
      reference: "LH-A",
      status: "submitted",
    },
    {
      user: reader.id,
      purpose: "rental",
      amount: 450,
      method: "easypaisa",
      reference: "LH-B",
      status: "approved",
      reviewedAt: new Date(now - DAY),
    },
    {
      user: reader.id,
      purpose: "package",
      amount: 800,
      method: "easypaisa",
      reference: "LH-C",
      status: "approved",
      reviewedAt: new Date(now - 40 * DAY),
    },
    {
      user: reader.id,
      purpose: "rental",
      amount: 250,
      method: "easypaisa",
      reference: "LH-D",
      status: "cancelled",
      refund: { status: "requested" },
    },
  ]);
  await t.db.collection("rentals").insertMany([
    {
      bookId: book,
      renterId: reader.id,
      startDate: new Date(now - DAY),
      endDate: new Date(now + 5 * DAY),
      days: 6,
      status: "active",
      paymentMethod: "single",
      price: 0,
    },
    {
      bookId: book,
      renterId: reader.id,
      startDate: new Date(now + 6 * DAY),
      endDate: new Date(now + 9 * DAY),
      days: 3,
      status: "scheduled",
      paymentMethod: "single",
      price: 0,
    },
  ]);
  await t.db.collection("bookrequests").insertMany([
    { title: "A", titleKey: "a", status: "open", isOpen: true },
    { title: "B", titleKey: "b", status: "reviewing", isOpen: true },
    { title: "C", titleKey: "c", status: "fulfilled", isOpen: false },
  ]);
  await t.db
    .collection("categories")
    .insertOne({ name: "Pending", slug: "pending", status: "pending" });
});

afterAll(() => t?.close());

describe("admin dashboard stats", () => {
  test("is admin-only", async () => {
    expect((await t.api("GET", "/admin/stats", { token: reader.token })).status).toBe(403);
    expect((await t.api("GET", "/admin/stats")).status).toBe(401);
  });

  test("returns the to-do queues and totals", async () => {
    const r = await t.api("GET", "/admin/stats", { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({
      todo: { paymentsToReview: 1, refundsToSend: 1, openRequests: 2, pendingCategories: 1 },
      rentals: { readingNow: 1, upcoming: 1 },
      catalogue: { publishedBooks: 1 },
      people: { readers: 1, activePackages: 0 },
      // Only approvals in the last 30 days count.
      revenue30d: { amount: 450, payments: 1 },
    });
  });

  test("payments can be filtered to refunds still to send", async () => {
    const r = await t.api("GET", "/payment/admin?refund.status=requested", { token: admin.token });
    expect(r.json.data.results.map((p) => p.reference)).toEqual(["LH-D"]);
  });
});
