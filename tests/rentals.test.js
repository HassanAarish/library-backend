import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { oid, startTestServer, waitFor } from "./support/testServer.js";

// One shared flow: rentals on a one-copy queue, Easypaisa manual payments,
// credit packages, fair use, cancel/extend/return/start-now and the lifecycle
// cron. Kept in one file because every section builds on the state before it.
// Note: exactly 10 proof submissions are made, the authLimiter allowance.

const DAY = 86400000;
const inDays = (n) => new Date(Date.now() + n * DAY);
const near = (a, b, ms = 1000) => Math.abs(new Date(a) - new Date(b)) < ms;

let t;
let runRentalLifecycle, runPackageReminders;
let admin, A, B, C, D, E;
let book1, book2, book3, book4, book5, book6;
const shots = {};
let aRental, aPay, bRental, bPay, cRental, cPay;
let plan5, cPkgPay, pkgDoc;
let cBook2, cFuture, b2;

const rentals = () => t.db.collection("rentals");
const packages = () => t.db.collection("userpackages");
const book = (token, body) => t.api("POST", "/rental", { token, body });
const proof = (payment, user, transactionId, senderNumber, screenshot = shots[user.key]) =>
  t.api("POST", `/payment/${payment._id}/proof`, {
    token: user.token,
    body: { transactionId, senderNumber, screenshot },
  });
const approve = (payment, token = admin.token) =>
  t.api("PATCH", `/payment/admin/${payment._id}/approve`, { token });

beforeAll(async () => {
  t = await startTestServer("rentals");
  ({ runRentalLifecycle, runPackageReminders } =
    await import("../cron/jobs/rentalLifecycle.cron.js"));

  admin = await t.mkUser("Admin", { role: "admin" });
  [A, B, C, D, E] = await Promise.all(
    ["Ali", "Bilal", "Chand", "Dua", "Eman"].map((n) => t.mkUser(n)),
  );
  Object.assign(A, { key: "A" });
  Object.assign(B, { key: "B" });
  Object.assign(C, { key: "C" });

  const category = await t.mkCategory("Fiction");
  [book1, book2, book3, book4, book5, book6] = await Promise.all(
    ["b1", "b2", "b3", "b4", "b5", "b6"].map((title) =>
      t.mkBook(title, { category, createdBy: admin.id }),
    ),
  );

  for (const u of [A, B, C]) shots[u.key] = await t.mkPrivateImage(u);
  await t.db.collection("assets").insertOne({
    public_id: "library/public-shot",
    owner: A.id,
    resourceType: "image",
    deliveryType: "upload",
    url: "https://x/p",
    mimetype: "image/png",
    name: "p.png",
  });
});

afterAll(() => t?.close());

describe("payment methods and availability", () => {
  test("Easypaisa is listed as a payment method without leaking the account number", async () => {
    const r = await t.api("GET", "/payment/methods");
    expect(r.json.data[0].method).toBe("easypaisa");
    expect(JSON.stringify(r.json)).not.toContain("03001234567");
  });

  test("availability is public; a free book is available now", async () => {
    const r = await t.api("GET", `/rental/availability/${book1}`);
    expect(r.status).toBe(200);
    expect(r.json.data.availableNow).toBeTruthy();
    expect(r.json.data.peopleAhead).toBe(0);
  });
});

describe("booking and the one-copy queue", () => {
  test("a single booking is pending_payment with Easypaisa instructions", async () => {
    const r = await book(A.token, { bookId: book1 });
    aRental = r.json.data.rental;
    aPay = r.json.data.payment;
    expect(r.status).toBe(201);
    expect(aRental.status).toBe("pending_payment");
    expect(aPay.instructions.accountNumber).toBe("03001234567");
    expect(aPay.reference).toMatch(/^LH-[A-Z2-9]{8}$/);
    expect(aPay.amount).toBe(300);
  });

  test("a held slot shows as rented; next start = A's end; 1 person ahead", async () => {
    const r = await t.api("GET", `/rental/availability/${book1}`, { token: B.token });
    expect(r.json.data.isRentedNow).toBeTruthy();
    expect(r.json.data.peopleAhead).toBe(1);
    expect(near(r.json.data.nextAvailableStart, aRental.endDate)).toBe(true);
  });

  test("B is auto-queued for the slot right after A", async () => {
    const r = await book(B.token, { bookId: book1 });
    bRental = r.json.data.rental;
    bPay = r.json.data.payment;
    expect(r.status).toBe(201);
    expect(near(bRental.startDate, aRental.endDate)).toBe(true);
  });

  test("B sees their own place in line (#1 after the current reader)", async () => {
    const r = await t.api("GET", `/rental/availability/${book1}`, { token: B.token });
    expect(r.json.data.myBooking.placeInLine).toBe(1);
    expect(r.json.data.queueLength).toBe(1);
  });

  test("an overlapping start date is rejected with the next free date", async () => {
    const r = await book(C.token, { bookId: book1, startDate: inDays(3) });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/earliest available start/);
  });

  test("the same user can't hold two bookings of one book", async () => {
    expect((await book(A.token, { bookId: book1 })).status).toBe(409);
  });

  test("a past start date is rejected", async () => {
    expect((await book(C.token, { bookId: book1, startDate: inDays(-1) })).status).toBe(400);
  });

  test("a start more than 60 days ahead is rejected", async () => {
    expect((await book(C.token, { bookId: book6, startDate: inDays(61) })).status).toBe(400);
  });

  test("no reading before payment is approved", async () => {
    expect((await t.api("GET", `/reader/${book1}`, { token: A.token })).status).toBe(403);
  });
});

describe("proof submission", () => {
  test("a public (non-private) screenshot is rejected", async () => {
    const r = await proof(aPay, A, "12345678901", "03111111111", {
      public_id: "library/public-shot",
    });
    expect(r.status).toBe(400);
  });

  test("can't submit proof for someone else's payment", async () => {
    expect((await proof(aPay, B, "12345678901", "03111111111")).status).toBe(404);
  });

  test("a malformed transaction id is rejected", async () => {
    expect((await proof(aPay, A, "12 34", "03111111111")).status).toBe(400);
  });

  test("a valid proof is accepted", async () => {
    expect((await proof(aPay, A, " 12345678901 ", "03111111111")).status).toBe(200);
  });

  test("the rental moves to payment_review and its hold no longer expires", async () => {
    const doc = await rentals().findOne({ _id: oid(aRental._id) });
    expect(doc.status).toBe("payment_review");
    expect(doc.holdExpiresAt).toBeFalsy();
  });

  test("a re-used transaction id is rejected (409)", async () => {
    expect((await proof(bPay, B, "12345678901", "03222222222")).status).toBe(409);
  });
});

describe("admin review", () => {
  test("non-admins cannot approve payments", async () => {
    expect((await approve(aPay, B.token)).status).toBe(403);
  });

  test("admin sees submitted payments with a signed screenshot link", async () => {
    const r = await t.api("GET", "/payment/admin?status=submitted", { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.results).toHaveLength(1);
    expect(r.json.data.results[0].screenshotUrl).toMatch(/\/image\/authenticated\/s--/);
  });

  test("approval activates A's rental", async () => {
    const r = await approve(aPay);
    expect(r.status).toBe(200);
    expect((await rentals().findOne({ _id: oid(aRental._id) })).status).toBe("active");
  });

  test("a payment can't be approved twice", async () => {
    expect((await approve(aPay)).status).toBe(400);
  });

  test("A can read after approval", async () => {
    expect((await t.api("GET", `/reader/${book1}`, { token: A.token })).status).toBe(200);
  });

  test("rejecting requires a reason", async () => {
    // B pays with a new transaction id first.
    await proof(bPay, B, "98765432100", "03222222222");
    const r = await t.api("PATCH", `/payment/admin/${bPay._id}/reject`, {
      token: admin.token,
      body: {},
    });
    expect(r.status).toBe(400);
  });

  test("rejection cancels the booking (payment_rejected)", async () => {
    const r = await t.api("PATCH", `/payment/admin/${bPay._id}/reject`, {
      token: admin.token,
      body: { reason: "No matching transfer received" },
    });
    expect(r.status).toBe(200);
    const doc = await rentals().findOne({ _id: oid(bRental._id) });
    expect(doc).toMatchObject({ status: "cancelled", cancelReason: "payment_rejected" });
  });
});

describe("hold expiry", () => {
  test("a freed slot can be booked again", async () => {
    const r = await book(C.token, { bookId: book1 });
    cRental = r.json.data.rental;
    cPay = r.json.data.payment;
    expect(r.status).toBe(201);
  });

  test("an expired hold stops blocking immediately (before the cron)", async () => {
    await rentals().updateOne(
      { _id: oid(cRental._id) },
      { $set: { holdExpiresAt: new Date(Date.now() - 1000) } },
    );
    const r = await t.api("GET", `/rental/availability/${book1}`);
    expect(r.json.data.queueLength).toBe(0);
  });

  test("a proof after the hold expired is refused", async () => {
    expect((await proof(cPay, C, "55555555555", "03333333333")).status).toBe(400);
  });

  test("the cron cancels the expired hold and expires its payment", async () => {
    await runRentalLifecycle();
    const doc = await rentals().findOne({ _id: oid(cRental._id) });
    const pay = await t.db.collection("payments").findOne({ _id: oid(cPay._id) });
    expect(doc).toMatchObject({ status: "cancelled", cancelReason: "payment_timeout" });
    expect(pay.status).toBe("expired");
  });
});

describe("packages", () => {
  test("users cannot create package plans", async () => {
    const r = await t.api("POST", "/package/admin/plans", {
      token: C.token,
      body: { name: "x", credits: 5, price: 1 },
    });
    expect(r.status).toBe(403);
  });

  test("the public plan list shows 3/5/10 packages valid for 1 year", async () => {
    for (const [credits, price] of [
      [3, 900],
      [5, 1400],
      [10, 2500],
    ]) {
      const created = await t.api("POST", "/package/admin/plans", {
        token: admin.token,
        body: { name: `${credits} Books`, credits, price, sortOrder: credits },
      });
      expect(created.status).toBe(201);
    }
    const r = await t.api("GET", "/package/plans");
    plan5 = r.json.data.find((p) => p.credits === 5);
    expect(r.json.data).toHaveLength(3);
    expect(plan5).toMatchObject({ price: 1400, validityDays: 365 });
  });

  test("a package purchase is pending with instructions", async () => {
    const r = await t.api("POST", "/package/purchase", {
      token: C.token,
      body: { planId: plan5._id },
    });
    cPkgPay = r.json.data.payment;
    expect(r.status).toBe(201);
    expect(cPkgPay.amount).toBe(1400);
    expect(cPkgPay.instructions).toBeTruthy();
  });

  test("only one pending package purchase at a time", async () => {
    const r = await t.api("POST", "/package/purchase", {
      token: C.token,
      body: { planId: plan5._id },
    });
    expect(r.status).toBe(409);
  });

  test("no credits before the package is approved", async () => {
    expect((await book(C.token, { bookId: book2, paymentMethod: "credit" })).status).toBe(400);
  });

  test("an approved package has 5 credits and expires ~1 year from approval", async () => {
    expect((await proof(cPkgPay, C, "77777777777", "03333333333")).status).toBe(200);
    expect((await approve(cPkgPay)).status).toBe(200);
    const r = await t.api("GET", "/package/mine", { token: C.token });
    const pkg = r.json.data.packages[0];
    expect(r.json.data.creditsAvailable).toBe(5);
    expect(pkg.status).toBe("active");
    expect(near(pkg.expiresAt, Date.now() + 365 * DAY, 60000)).toBe(true);
  });

  test("plan edits don't change what was already bought", async () => {
    await t.api("PATCH", `/package/admin/plans/${plan5._id}`, {
      token: admin.token,
      body: { price: 1600 },
    });
    const r = await t.api("GET", "/package/mine", { token: C.token });
    expect(r.json.data.packages[0].snapshot.price).toBe(1400);
  });
});

describe("credit rentals and fair use", () => {
  test("a credit rental is confirmed instantly (active, price 0)", async () => {
    const r = await book(C.token, { bookId: book2, paymentMethod: "credit" });
    cBook2 = r.json.data.rental;
    expect(r.status).toBe(201);
    expect(cBook2).toMatchObject({ status: "active", price: 0 });
    expect(r.json.data.payment).toBeNull();
  });

  test("a second active rental is allowed", async () => {
    expect((await book(C.token, { bookId: book3, paymentMethod: "credit" })).status).toBe(201);
  });

  test("a third active rental is blocked (fair use: 2 at a time)", async () => {
    const r = await book(C.token, { bookId: book4, paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/up to 2 books/);
  });

  test("a future booking is allowed while 2 are active", async () => {
    const r = await book(C.token, { bookId: book4, paymentMethod: "credit", startDate: inDays(2) });
    cFuture = r.json.data.rental;
    expect(r.status).toBe(201);
    expect(cFuture.status).toBe("scheduled");
  });

  test("3 credits are used", async () => {
    pkgDoc = await packages().findOne({ user: C.id, status: "active" });
    expect(pkgDoc.creditsUsed).toBe(3);
  });

  test("cancelling before the start returns the credit", async () => {
    const r = await t.api("POST", `/rental/${cFuture._id}/cancel`, { token: C.token });
    pkgDoc = await packages().findOne({ user: C.id, status: "active" });
    expect(r.status).toBe(200);
    expect(r.json.data.creditReturned).toBeTruthy();
    expect(pkgDoc.creditsUsed).toBe(2);
  });

  test("an active rental can't be cancelled", async () => {
    expect((await t.api("POST", `/rental/${cBook2._id}/cancel`, { token: C.token })).status).toBe(
      400,
    );
  });

  test("upcoming bookings are capped at 3", async () => {
    const upcoming = [];
    for (const b of [book4, book5, book6]) {
      upcoming.push(
        (await book(C.token, { bookId: b, paymentMethod: "credit", startDate: inDays(20) })).status,
      );
    }
    expect(upcoming).toEqual([201, 201, 201]);
    const r = await book(C.token, {
      bookId: book1,
      paymentMethod: "credit",
      startDate: inDays(40),
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/3 upcoming/);

    // Clean up for later tests (direct DB edit, so hand the 3 credits back too).
    await rentals().updateMany(
      { renterId: C.id, status: "scheduled" },
      { $set: { status: "cancelled" } },
    );
    await packages().updateOne({ _id: pkgDoc._id }, { $inc: { creditsUsed: -3 } });
  });

  test("a credit can't be used for a start after the package expires", async () => {
    await packages().updateOne({ _id: pkgDoc._id }, { $set: { expiresAt: inDays(1) } });
    const r = await book(C.token, { bookId: book5, paymentMethod: "credit", startDate: inDays(2) });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/no package credits/);
  });
});

describe("extension", () => {
  test("a free 7-day extension when nobody is waiting", async () => {
    const r = await t.api("POST", `/rental/${cBook2._id}/extend`, { token: C.token });
    expect(r.status).toBe(200);
    expect(near(r.json.data.endDate, new Date(cBook2.endDate).getTime() + 7 * DAY)).toBe(true);
  });

  test("only one extension per rental", async () => {
    expect((await t.api("POST", `/rental/${cBook2._id}/extend`, { token: C.token })).status).toBe(
      400,
    );
  });

  test("no extension when someone is booked right after", async () => {
    // B books book1 right after A, pays and is approved -> scheduled.
    const r = await book(B.token, { bookId: book1 });
    b2 = r.json.data;
    expect(r.status).toBe(201);
    expect((await proof(b2.payment, B, "44444444444", "03222222222")).status).toBe(200);
    expect((await approve(b2.payment)).status).toBe(200);

    const ext = await t.api("POST", `/rental/${aRental._id}/extend`, { token: A.token });
    expect(ext.status).toBe(409);
  });
});

describe("early return and start-now", () => {
  test("can't start early while the current reader still has it", async () => {
    const r = await t.api("POST", `/rental/${b2.rental._id}/start-now`, { token: B.token });
    expect(r.status).toBe(409);
  });

  test("an early return completes the rental", async () => {
    expect((await t.api("POST", `/rental/${aRental._id}/return`, { token: A.token })).status).toBe(
      200,
    );
  });

  test("a returned book is no longer readable", async () => {
    expect((await t.api("GET", `/reader/${book1}`, { token: A.token })).status).toBe(403);
  });

  test("the next reader can start right away after an early return", async () => {
    const r = await t.api("POST", `/rental/${b2.rental._id}/start-now`, { token: B.token });
    expect(r.status).toBe(200);
    expect(new Date(r.json.data.startDate).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("...and can read immediately", async () => {
    expect((await t.api("GET", `/reader/${book1}`, { token: B.token })).status).toBe(200);
  });
});

describe("refunds", () => {
  let aB5;

  test("cancelling a paid future booking requests a refund", async () => {
    let r = await book(A.token, { bookId: book5, startDate: inDays(5) });
    aB5 = r.json.data;
    expect(r.status).toBe(201);
    expect((await proof(aB5.payment, A, "33333333333", "03111111111")).status).toBe(200);
    expect((await approve(aB5.payment)).status).toBe(200);

    r = await t.api("POST", `/rental/${aB5.rental._id}/cancel`, { token: A.token });
    expect(r.status).toBe(200);
    expect(r.json.data.refundRequested).toBeTruthy();
  });

  test("admin records the refund", async () => {
    const r = await t.api("PATCH", `/payment/admin/${aB5.payment._id}/refund`, {
      token: admin.token,
      body: { status: "refunded", note: "Sent back via Easypaisa" },
    });
    expect(r.status).toBe(200);
  });
});

describe("concurrency", () => {
  test("concurrent bookings never double-book one copy", async () => {
    const race = await Promise.all([D, E].map((u) => book(u.token, { bookId: book6 })));
    const statuses = race.map((x) => x.status).sort();
    const live = await rentals()
      .find({
        bookId: book6,
        status: { $in: ["pending_payment", "active"] },
        startDate: { $lte: new Date() },
      })
      .toArray();
    expect(live).toHaveLength(1);
    expect([
      [201, 201],
      [201, 409],
    ]).toContainEqual(statuses);

    if (statuses.join() === "201,201") {
      // Both succeeded only if the second was queued AFTER the first.
      const all = await rentals()
        .find({ bookId: book6, status: { $ne: "cancelled" } })
        .sort({ startDate: 1 })
        .toArray();
      expect(all).toHaveLength(2);
      expect(all[1].startDate.getTime()).toBeGreaterThanOrEqual(all[0].endDate.getTime());
    }
  });
});

describe("lifecycle cron", () => {
  test("scheduled -> active when the start passes; active -> completed at the end", async () => {
    const { insertedId: lateStart } = await rentals().insertOne({
      bookId: book3,
      renterId: D.id,
      status: "scheduled",
      paymentMethod: "single",
      price: 1,
      days: 1,
      startDate: new Date(Date.now() - 60000),
      endDate: inDays(1),
    });
    const { insertedId: ended } = await rentals().insertOne({
      bookId: book4,
      renterId: D.id,
      status: "active",
      paymentMethod: "single",
      price: 1,
      days: 1,
      startDate: inDays(-2),
      endDate: new Date(Date.now() - 1000),
    });
    await runRentalLifecycle();
    const [ls, en] = await Promise.all(
      [lateStart, ended].map((id) => rentals().findOne({ _id: id })),
    );
    expect(ls.status).toBe("active");
    expect(en.status).toBe("completed");
  });

  test("the expiry reminder is sent once for the 7-day window", async () => {
    await packages().updateOne({ _id: pkgDoc._id }, { $set: { expiresAt: inDays(5) } });
    await runPackageReminders();
    await runPackageReminders(); // second run must not resend
    pkgDoc = await packages().findOne({ _id: pkgDoc._id });
    expect(pkgDoc.remindersSent).toEqual([7]);
  });

  test("the cron expires packages past their date", async () => {
    await packages().updateOne(
      { _id: pkgDoc._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await runRentalLifecycle();
    pkgDoc = await packages().findOne({ _id: pkgDoc._id });
    expect(pkgDoc.status).toBe("expired");
  });
});

describe("lists and audit trail", () => {
  test("a user sees their rentals with book details", async () => {
    const r = await t.api("GET", "/rental/mine", { token: A.token });
    expect(r.status).toBe(200);
    expect(r.json.data.results.length).toBeGreaterThanOrEqual(2);
    expect(r.json.data.results[0].bookId.title).toBeTruthy();
  });

  test("the admin rental list filters by status", async () => {
    const r = await t.api("GET", "/rental/admin?status=active", { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.results.every((x) => x.status === "active")).toBe(true);
  });

  test("admin sees package purchases", async () => {
    const r = await t.api("GET", "/package/admin/purchases", { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.totalDocs).toBeGreaterThanOrEqual(1);
  });

  test.each([
    "rental.create",
    "payment.proof_submitted",
    "admin.payment.approve",
    "admin.payment.reject",
    "rental.cancel",
    "rental.extend",
    "rental.return",
    "rental.start_now",
    "package.purchase",
    "admin.package_plan.create",
    "admin.package_plan.update",
    "admin.refund.refunded",
    "system.rental.hold_expired",
    "system.package.expired",
  ])("audit log records %s", async (action) => {
    expect(await waitFor(() => t.db.collection("auditlogs").findOne({ action }))).toBeTruthy();
  });

  test("a re-used transaction id is flagged CRITICAL in the audit log", async () => {
    const hit = await waitFor(() =>
      t.db
        .collection("auditlogs")
        .findOne({ action: "payment.duplicate_transaction_id", severity: "critical" }),
    );
    expect(hit).toBeTruthy();
  });
});
