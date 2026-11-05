import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { oid, sleep, startTestServer, waitFor } from "./support/testServer.js";

const DAY = 86_400_000;

let t;
let admin, A, B, C, D, P, blocked;
let anon, adminS, aS, aS2, bS, cS, dS;
let paidBook, freeBook, holdBook, shot;
let aPay;

const notif = (events, type) => () =>
  events.find((e) => e.event === "notification:new" && e.payload?.type === type);

beforeAll(async () => {
  t = await startTestServer("realtime");
  admin = await t.mkUser("Admin", { role: "admin" });
  [A, B, C, D] = await Promise.all(["Ali", "Bilal", "Chand", "Dua"].map((n) => t.mkUser(n)));
  P = await t.mkUser("Parveen", { password: "oldPassword1" });
  blocked = await t.mkUser("Blocked", { isBlocked: true });

  paidBook = await t.mkBook("Paid Book");
  freeBook = await t.mkBook("Free Book", { price: 0, rentalDays: 7 });
  holdBook = await t.mkBook("Hold Book");
  shot = await t.mkPrivateImage(A);
});

afterAll(() => t?.close());

describe("socket authentication", () => {
  test("anonymous sockets may connect", async () => {
    anon = await t.connect();
    expect(anon.socket.connected).toBe(true);
  });

  test.each([
    ["a malformed token", () => "not-a-jwt", /Not authorized/],
    ["a blocked user", () => blocked.token, /suspended/],
    ["an expired token", () => t.tokenFor(A.id, "user", { expiresIn: -10 }), /expired/],
    [
      "a token signed with another secret",
      () => jwt.sign({ user: { userID: A.id } }, "wrong"),
      /Not authorized/,
    ],
  ])("%s is refused", async (_, token, message) => {
    await expect(t.connect(token())).rejects.toThrow(message);
  });

  test("users and the admin connect with their tokens", async () => {
    [adminS, aS, aS2, bS, cS, dS] = await Promise.all(
      [admin, A, A, B, C, D].map((u) => t.connect(u.token)),
    );
    expect([adminS, aS, aS2, bS, cS, dS].every((s) => s.socket.connected)).toBe(true);
  });

  test("a blocked user's socket attempt is in the audit log", async () => {
    expect(
      await waitFor(() =>
        t.db.collection("auditlogs").findOne({
          action: "auth.blocked_user_access",
          "metadata.transport": "socket",
        }),
      ),
    ).toBeTruthy();
  });
});

describe("watching books", () => {
  const watch = (s, id) => s.socket.timeout(2000).emitWithAck("book:watch", id);

  test("a bad book id is rejected", async () => {
    expect(await watch(anon, "nope")).toMatchObject({ ok: false });
  });

  test("anonymous viewers can watch up to 20 books", async () => {
    expect(await watch(anon, String(paidBook))).toEqual({ ok: true });
    for (let i = 0; i < 19; i++) await watch(anon, new mongoose.Types.ObjectId().toString());
    const ack = await watch(anon, new mongoose.Types.ObjectId().toString());
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/20/);
  });

  test("booking a watched book pings watchers with only its id", async () => {
    const r = await t.api("POST", "/rental", { token: A.token, body: { bookId: paidBook } });
    expect(r.status).toBe(201);
    aPay = r.json.data.payment;

    const ev = await waitFor(() =>
      anon.events.find(
        (e) => e.event === "book:availability" && e.payload?.bookId === String(paidBook),
      ),
    );
    expect(ev.payload).toEqual({ bookId: String(paidBook) });
    expect(bS.events.some((e) => e.event === "book:availability")).toBe(false);
  });
});

describe("payment notifications", () => {
  test("submitting proof alerts the admin live", async () => {
    const r = await t.api("POST", `/payment/${aPay._id}/proof`, {
      token: A.token,
      body: { transactionId: "99887766554", senderNumber: "0311-1111111", screenshot: shot },
    });
    expect(r.status).toBe(200);

    const ev = await waitFor(notif(adminS.events, "payment.submitted"));
    expect(ev.payload.message).toContain(aPay.reference);
    expect(String(ev.payload.data.paymentId)).toBe(String(aPay._id));
    expect(
      await waitFor(() =>
        adminS.events.find(
          (e) => e.event === "admin:activity" && e.payload.type === "payment.submitted",
        ),
      ),
    ).toBeTruthy();
  });

  test("regular users never receive admin events", () => {
    expect(aS.events.some((e) => e.event === "admin:activity")).toBe(false);
    expect(notif(bS.events, "payment.submitted")()).toBeUndefined();
  });

  test("approval reaches every tab of the payer and nobody else", async () => {
    const r = await t.api("PATCH", `/payment/admin/${aPay._id}/approve`, { token: admin.token });
    expect(r.status).toBe(200);

    const ev = await waitFor(notif(aS.events, "payment.approved"));
    expect(ev.payload.data.rentalId).toBeTruthy();
    expect(String(ev.payload.data.bookId)).toBe(String(paidBook));
    expect(await waitFor(notif(aS2.events, "payment.approved"))).toBeTruthy();
    expect(notif(bS.events, "payment.approved")()).toBeUndefined();
  });
});

describe("inbox", () => {
  let firstId;

  test("lists the user's own notifications with an unread count", async () => {
    const r = await t.api("GET", "/notification", { token: A.token });
    expect(r.status).toBe(200);
    expect(r.json.data.results.some((n) => n.type === "payment.approved")).toBe(true);
    expect(r.json.data.unreadCount).toBeGreaterThanOrEqual(1);

    const other = await t.api("GET", "/notification", { token: B.token });
    expect(other.json.data.results.every((n) => n.type !== "payment.approved")).toBe(true);
  });

  test("marking one read lowers the count and syncs other tabs", async () => {
    const before = (await t.api("GET", "/notification/unread-count", { token: A.token })).json.data
      .unreadCount;
    firstId = (await t.api("GET", "/notification?unread=true", { token: A.token })).json.data
      .results[0]._id;

    const r = await t.api("PATCH", "/notification/read", {
      token: A.token,
      body: { ids: [firstId] },
    });
    expect(r.json.data.unreadCount).toBe(before - 1);
    expect(
      await waitFor(() =>
        aS2.events.find((e) => e.event === "notification:read" && Array.isArray(e.payload.ids)),
      ),
    ).toBeTruthy();
  });

  test("users can't touch other people's notifications", async () => {
    let r = await t.api("PATCH", "/notification/read", {
      token: B.token,
      body: { ids: [firstId] },
    });
    expect(r.json.data.updated).toBe(0);
    r = await t.api("DELETE", `/notification/${firstId}`, { token: B.token });
    expect(r.status).toBe(404);
  });

  test("invalid ids are rejected by validation", async () => {
    const r = await t.api("PATCH", "/notification/read", { token: A.token, body: { ids: ["x"] } });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/ids\.0: must be a valid id/);
  });

  test("read-all and delete work; the inbox needs a login", async () => {
    let r = await t.api("PATCH", "/notification/read-all", { token: A.token });
    expect(r.json.data.unreadCount).toBe(0);
    r = await t.api("DELETE", `/notification/${firstId}`, { token: A.token });
    expect(r.status).toBe(200);
    r = await t.api("GET", "/notification");
    expect(r.status).toBe(401);
  });
});

describe("early start when a book frees up", () => {
  let cRental, bRental;

  test("the next reader is told live they can start now", async () => {
    let r = await t.api("POST", "/rental", { token: C.token, body: { bookId: freeBook } });
    cRental = r.json.data.rental;
    expect(cRental.status).toBe("active");

    r = await t.api("POST", "/rental", { token: B.token, body: { bookId: freeBook } });
    bRental = r.json.data.rental;
    expect(bRental.status).toBe("scheduled");
    expect(new Date(bRental.startDate) > new Date()).toBe(true);

    r = await t.api("POST", `/rental/${cRental._id}/return`, { token: C.token });
    expect(r.status).toBe(200);

    const ev = await waitFor(notif(bS.events, "rental.can_start_early"));
    expect(String(ev.payload.data.rentalId)).toBe(String(bRental._id));
  });

  test("and starting now works", async () => {
    const r = await t.api("POST", `/rental/${bRental._id}/start-now`, { token: B.token });
    expect(r.status).toBe(200);
    expect(new Date(r.json.data.startDate) <= new Date()).toBe(true);
  });
});

describe("category suggestions", () => {
  let suggestionId;

  test("a reader's suggestion alerts the admin", async () => {
    const r = await t.api("POST", "/category", {
      token: D.token,
      body: { name: "Urdu Poetry", description: "Ghazals and nazms" },
    });
    expect(r.status).toBe(201);
    const ev = await waitFor(notif(adminS.events, "category.proposed"));
    expect(ev.payload.message).toContain("Urdu Poetry");
    suggestionId = (await t.db.collection("categories").findOne({ name: "Urdu Poetry" }))._id;
  });

  test("approving with a note tells the reader and shows in /category/mine", async () => {
    const r = await t.api("PATCH", `/category/${suggestionId}`, {
      token: admin.token,
      body: { status: "approved", note: "Great idea!" },
    });
    expect(r.status).toBe(200);

    const ev = await waitFor(notif(dS.events, "category.approved"));
    expect(ev.payload.message).toContain("Great idea!");

    const mine = await t.api("GET", "/category/mine", { token: D.token });
    expect(mine.json.data.results[0]).toMatchObject({
      status: "approved",
      reviewNote: "Great idea!",
    });
  });

  test("an over-long name is rejected", async () => {
    const r = await t.api("POST", "/category", { token: D.token, body: { name: "x".repeat(80) } });
    expect(r.status).toBe(400);
  });
});

describe("book request notifications", () => {
  test("a new request alerts the admin and status changes reach followers live", async () => {
    let r = await t.api("POST", "/bookrequest", {
      token: C.token,
      body: { title: "Raja Gidh", author: "Bano Qudsia" },
    });
    expect(r.status).toBe(201);
    const created = await waitFor(notif(adminS.events, "book_request.created"));
    expect(created.payload.message).toContain("Raja Gidh");

    r = await t.api("PATCH", `/bookrequest/admin/${r.json.data.request._id}/status`, {
      token: admin.token,
      body: { status: "planned" },
    });
    expect(r.status).toBe(200);
    const updated = await waitFor(notif(cS.events, "book_request.updated"));
    expect(updated.payload.data.requestId).toBeTruthy();
  });
});

describe("account events", () => {
  test("blocking a user tells them, disconnects them, and stops their notifications", async () => {
    const disconnected = new Promise((resolve) => dS.socket.on("disconnect", () => resolve(true)));

    const r = await t.api("PATCH", `/admin/toggle-user-block/${D.id}`, { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.isBlocked).toBe(true);

    expect(await Promise.race([disconnected, sleep(4000).then(() => false)])).toBe(true);
    expect(dS.events.some((e) => e.event === "account:blocked")).toBe(true);
    await expect(t.connect(D.token)).rejects.toThrow(/suspended/);

    const before = await t.db.collection("notifications").countDocuments({ recipient: D.id });
    await t.db.collection("categories").insertOne({
      name: "Blocked Test",
      slug: "blocked-test",
      status: "pending",
      proposedBy: D.id,
    });
    const cat = await t.db.collection("categories").findOne({ name: "Blocked Test" });
    await t.api("PATCH", `/category/${cat._id}`, {
      token: admin.token,
      body: { status: "rejected" },
    });
    await sleep(500);
    expect(await t.db.collection("notifications").countDocuments({ recipient: D.id })).toBe(before);
  });

  test("changing the password drops sockets opened with older tokens", async () => {
    const oldSocket = await t.connect(P.token);
    const dropped = new Promise((resolve) =>
      oldSocket.socket.on("disconnect", () => resolve(true)),
    );

    const r = await t.api("PATCH", "/user/password-update", {
      token: P.token,
      body: { currentPassword: "oldPassword1", newPassword: "newPassword2" },
    });
    expect(r.status).toBe(200);
    expect(await Promise.race([dropped, sleep(4000).then(() => false)])).toBe(true);

    // The old token no longer works for HTTP or sockets.
    expect((await t.api("GET", "/notification", { token: P.token })).status).toBe(401);
    await expect(t.connect(P.token)).rejects.toThrow(/expired/);

    // A token issued after the change does.
    await sleep(1100); // JWT iat has 1-second precision
    const fresh = t.tokenFor(P.id);
    expect((await t.connect(fresh)).socket.connected).toBe(true);
  });

  test("an event flood disconnects the socket and is audited", async () => {
    const flood = await t.connect(C.token);
    const gone = new Promise((resolve) => flood.socket.on("disconnect", () => resolve(true)));
    for (let i = 0; i < 80; i++) flood.socket.emit("book:unwatch", String(paidBook));
    expect(await Promise.race([gone, sleep(4000).then(() => false)])).toBe(true);
    expect(
      await waitFor(() =>
        t.db.collection("auditlogs").findOne({ action: "security.socket_flood" }),
      ),
    ).toBeTruthy();
  });
});

describe("lifecycle notifications", () => {
  test("hold expiry and a booked rental starting are notified", async () => {
    const { runRentalLifecycle } = await import("../cron/jobs/rentalLifecycle.cron.js");

    const r = await t.api("POST", "/rental", { token: C.token, body: { bookId: holdBook } });
    const hold = r.json.data.rental;
    await t.db
      .collection("rentals")
      .updateOne({ _id: oid(hold._id) }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });

    const { insertedId: scheduled } = await t.db.collection("rentals").insertOne({
      bookId: freeBook,
      renterId: A.id,
      startDate: new Date(Date.now() - 1000),
      endDate: new Date(Date.now() + 7 * DAY),
      days: 7,
      status: "scheduled",
      paymentMethod: "single",
      price: 0,
      createdAt: new Date(),
    });

    await runRentalLifecycle();

    const notes = t.db.collection("notifications");
    expect(
      await waitFor(() => notes.findOne({ recipient: C.id, type: "rental.hold_expired" })),
    ).toBeTruthy();
    expect(
      await waitFor(() =>
        notes.findOne({ recipient: A.id, type: "rental.started", "data.rentalId": scheduled }),
      ),
    ).toBeTruthy();
  });
});
