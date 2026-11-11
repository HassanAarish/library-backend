import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { oid, sleep, startTestServer, waitFor } from "./support/testServer.js";

const DAY = 86_400_000;
let t;
let purgeDueAccounts, notify;

const users = () => t.db.collection("users");
const status = (u) => t.api("GET", "/user/deletion", { token: u.token });
const del = (u, body = {}) =>
  t.api("POST", "/user/deletion", { token: u.token, body: { confirm: true, ...body } });
const login = (email, password) =>
  t.api("POST", "/auth/login", { body: { email, password, authType: "email" } });

beforeAll(async () => {
  t = await startTestServer("deletion");
  ({ purgeDueAccounts } = await import("../services/AccountDeletion.Service.js"));
  ({ notify } = await import("../services/Notification.Service.js"));
});

afterAll(() => t?.close());

const mkRental = (user, status, days = 0) =>
  t.db.collection("rentals").insertOne({
    bookId: oid("aaaaaaaaaaaaaaaaaaaaaaaa"),
    renterId: oid(user.id),
    status,
    startDate: new Date(Date.now() + days * DAY),
    endDate: new Date(Date.now() + (days + 14) * DAY),
    days: 14,
    paymentMethod: "single",
    createdAt: new Date(),
  });

describe("what stops a deletion", () => {
  test("a reader with nothing running can delete", async () => {
    const u = await t.mkUser("Clean");
    const r = await status(u);
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({
      canDelete: true,
      credits: 0,
      graceDays: 14,
      blockers: { reading: 0, upcoming: 0, unconfirmed: 0, refunds: 0 },
    });
  });

  test.each([
    ["a book being read", (u) => mkRental(u, "active"), "reading"],
    ["an upcoming booking", (u) => mkRental(u, "scheduled", 3), "upcoming"],
    ["a booking waiting to be confirmed", (u) => mkRental(u, "payment_review", 3), "unconfirmed"],
    [
      "a plan waiting to be confirmed",
      (u) =>
        t.db.collection("payments").insertOne({
          user: oid(u.id),
          purpose: "package",
          reference: "LH-T1",
          status: "submitted",
          amount: 1,
        }),
      "unconfirmed",
    ],
    [
      "a refund in progress",
      (u) =>
        t.db.collection("payments").insertOne({
          user: oid(u.id),
          purpose: "rental",
          reference: "LH-T2",
          status: "approved",
          amount: 1,
          refund: { status: "requested" },
        }),
      "refunds",
    ],
  ])("%s blocks it", async (name, setup, key) => {
    const u = await t.mkUser(`Busy${key}${name.length}`);
    await setup(u);
    const s = await status(u);
    expect(s.json.data.canDelete).toBe(false);
    expect(s.json.data.blockers[key]).toBe(1);

    const r = await del(u);
    expect(r.status).toBe(409);
    expect((await users().findOne({ _id: oid(u.id) })).deletion).toBeUndefined();
  });

  test("finished and cancelled rentals don't count", async () => {
    const u = await t.mkUser("Finished");
    await mkRental(u, "completed", -30);
    await mkRental(u, "cancelled", 5);
    expect((await status(u)).json.data.canDelete).toBe(true);
  });

  test("unused credits must be given up explicitly", async () => {
    const u = await t.mkUser("Credits");
    await t.db.collection("userpackages").insertOne({
      user: oid(u.id),
      status: "active",
      creditsTotal: 5,
      creditsUsed: 2,
      expiresAt: new Date(Date.now() + 100 * DAY),
      snapshot: { name: "Five", credits: 5 },
    });
    expect((await status(u)).json.data).toMatchObject({ canDelete: true, credits: 3 });

    expect((await del(u)).status).toBe(409);

    const r = await del(u, { giveUpCredits: true });
    expect(r.json).toMatchObject({ success: true });
    const plan = await t.db.collection("userpackages").findOne({ user: oid(u.id) });
    expect(plan.status).toBe("cancelled");
  });

  test("admins can't delete their account here", async () => {
    const a = await t.mkUser("Boss", { role: "admin" });
    expect((await del(a)).status).toBe(403);
  });

  test("needs an explicit confirm", async () => {
    const u = await t.mkUser("NoConfirm");
    const r = await t.api("POST", "/user/deletion", { token: u.token, body: {} });
    expect(r.status).toBe(400);
  });
});

describe("closing the account", () => {
  let u;
  beforeAll(async () => {
    u = await t.mkUser("Sara", { password: "Secret123!" });
    await t.db.collection("pushdevices").insertOne({
      user: oid(u.id),
      token: "ExponentPushToken[saraphone000000000000]",
      platform: "android",
    });
  });

  test("a password account must confirm with its password", async () => {
    // 400, not 401: a 401 would sign the reader out in the apps.
    expect((await del(u)).status).toBe(400);
    expect((await del(u, { password: "wrong-one" })).status).toBe(400);
    expect((await t.api("GET", "/user/profile", { token: u.token })).status).toBe(200);
  });

  test("closes it for 14 days and ends every session", async () => {
    const r = await del(u, { password: "Secret123!" });
    expect(r.status).toBe(200);
    expect(r.json.message).toMatch(/will be deleted on/);
    const days = (new Date(r.json.data.scheduledFor) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);

    const again = await t.api("GET", "/user/profile", { token: u.token });
    expect(again.status).toBe(401);
    expect(await t.db.collection("pushdevices").countDocuments({ user: oid(u.id) })).toBe(0);
  });

  test("nothing is sent to a closed account", async () => {
    notify(u.id, { type: "rental.ended", title: "Closed test", message: "x", email: false });
    await sleep(200);
    expect(await t.db.collection("notifications").findOne({ title: "Closed test" })).toBeNull();
  });

  test("signing in again keeps the account", async () => {
    const r = await login("sara@t.pk", "Secret123!");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ deletionCancelled: true });
    expect(r.json.message).toMatch(/will not be deleted/);

    const doc = await users().findOne({ _id: oid(u.id) });
    expect(doc.deletion?.scheduledFor).toBeUndefined();
    expect((await t.api("GET", "/user/profile", { token: r.json.token })).status).toBe(200);

    const next = await login("sara@t.pk", "Secret123!");
    expect(next.json.deletionCancelled).toBeUndefined();
  });

  test("a social account (no password) can delete without one", async () => {
    const s = await t.mkUser("Gul", { authType: "google", googleId: "g-123" });
    expect((await del(s)).status).toBe(200);
  });
});

describe("after the grace period", () => {
  let u, requestId;

  beforeAll(async () => {
    u = await t.mkUser("Hina", { password: "Secret123!" });
    await t.db
      .collection("preferences")
      .insertOne({ userId: oid(u.id), phoneNumber: "03001234567" });
    await t.db.collection("notifications").insertOne({
      recipient: oid(u.id),
      type: "rental.ended",
      title: "Old",
      message: "Old",
      createdAt: new Date(),
    });
    await t.db.collection("payments").insertOne({
      user: oid(u.id),
      purpose: "rental",
      reference: "LH-T3",
      status: "approved",
      amount: 300,
    });
    await t.db.collection("reviews").insertOne({
      bookId: oid("bbbbbbbbbbbbbbbbbbbbbbbb"),
      userId: oid(u.id),
      rating: 5,
      comment: "Lovely",
    });
    ({ insertedId: requestId } = await t.db.collection("bookrequests").insertOne({
      title: "Kite",
      titleKey: "kite",
      status: "open",
      isOpen: true,
      user: oid(u.id),
      followerCount: 2,
      followers: [
        { user: oid(u.id), note: "My phone is 0300", joinedAt: new Date() },
        { user: oid("cccccccccccccccccccccccc"), note: "Keep me", joinedAt: new Date() },
      ],
    }));
    expect((await del(u, { password: "Secret123!" })).status).toBe(200);
  });

  test("isn't touched before the date", async () => {
    expect(await purgeDueAccounts()).toBe(0);
    expect((await users().findOne({ _id: oid(u.id) })).name).toBe("Hina");
  });

  test("removes personal details and keeps records anonymised", async () => {
    await users().updateOne(
      { _id: oid(u.id) },
      { $set: { "deletion.scheduledFor": new Date(Date.now() - 1000) } },
    );
    expect(await purgeDueAccounts()).toBe(1);

    const doc = await users().findOne({ _id: oid(u.id) });
    expect(doc).toMatchObject({ name: "Former reader", email: `deleted-${u.id}@deleted.invalid` });
    expect(doc.deletedAt).toBeInstanceOf(Date);
    for (const field of ["password", "googleId", "facebookId", "twoFactor", "otp"]) {
      expect(doc[field]).toBeUndefined();
    }

    expect(await t.db.collection("preferences").countDocuments({ userId: oid(u.id) })).toBe(0);
    expect(await t.db.collection("notifications").countDocuments({ recipient: oid(u.id) })).toBe(0);
    // Kept, but no longer tied to a person.
    expect(await t.db.collection("payments").countDocuments({ user: oid(u.id) })).toBe(1);
    expect(await t.db.collection("reviews").countDocuments({ userId: oid(u.id) })).toBe(1);

    const req = await t.db.collection("bookrequests").findOne({ _id: requestId });
    expect(req.followerCount).toBe(2);
    expect(req.followers.find((f) => String(f.user) === String(u.id)).note).toBeUndefined();
    expect(req.followers.find((f) => String(f.user) !== String(u.id)).note).toBe("Keep me");
  });

  test("the old email and password no longer sign in, and the email is free again", async () => {
    expect((await login("hina@t.pk", "Secret123!")).status).toBe(401);
    expect(await users().countDocuments({ email: "hina@t.pk" })).toBe(0);
  });

  test("runs once", async () => {
    expect(await purgeDueAccounts()).toBe(0);
  });

  test("the unverified-account clean-up leaves anonymised accounts alone", async () => {
    await users().updateOne({ _id: oid(u.id) }, { $set: { isVerified: false } });
    const { cleanupUnverifiedUsers } = await import("../cron/jobs/userCleanUp.cron.js");
    await cleanupUnverifiedUsers();
    expect(await waitFor(() => users().findOne({ _id: oid(u.id) }))).toBeTruthy();
  });
});
