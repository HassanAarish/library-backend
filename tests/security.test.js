import jwt from "jsonwebtoken";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { oid, startTestServer, waitFor } from "./support/testServer.js";

// Port of the Phase 0/1 smoke script: security hardening, activity logging,
// books/catalogue, reader and uploads. Steps share state and run in order
// (the auth rate limiter counts every /auth call from 127.0.0.1).

const PASSWORD = "Passw0rd!";

let t;
let admin, U1, U2, Unverified;
let u2ForgedAdmin;
let u1New;
let u1Hash;
let cat, bookId, draftId, novelId;

const audits = () => t.db.collection("auditlogs");
const reqLogs = () => t.db.collection("requestlogs");

/** Like t.tokenFor, but issued `secondsAgo` in the past. */
const backdatedToken = (userId, role, secondsAgo) =>
  jwt.sign(
    { user: { userID: userId, role }, iat: Math.floor(Date.now() / 1000) - secondsAgo },
    process.env.SECRET_KEY,
    { expiresIn: "1h" },
  );

/** Multipart upload (t.api always sends JSON). */
const upload = (path, token, field, name, type, bytes) => {
  const fd = new FormData();
  fd.append(field, new Blob([bytes], { type }), name);
  return fetch(t.base + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
};

beforeAll(async () => {
  t = await startTestServer("security");
  const now = new Date();
  admin = await t.mkUser("Admin", { role: "admin", password: PASSWORD });
  U1 = await t.mkUser("U1", {
    password: PASSWORD,
    otp: { code: 111111, expiry: now },
    resetPassword: { token: "leak-me" },
    twoFactor: { enabled: false, secret: "SECRET2FA" },
  });
  U2 = await t.mkUser("U2", { password: PASSWORD });
  Unverified = await t.mkUser("Unverified", {
    password: PASSWORD,
    isVerified: false,
    otp: { code: 123456, expiry: new Date(Date.now() + 5 * 60000), attempts: 0 },
  });
  await t.db.collection("preferences").insertMany([{ userId: U1.id }, { userId: U2.id }]);
  u1Hash = (await t.db.collection("users").findOne({ _id: U1.id })).password;

  // A token that CLAIMS admin but belongs to a user — role must come from the DB.
  u2ForgedAdmin = t.tokenFor(U2.id, "admin");
  // Issued well before the password change below, so it must stop working.
  U1.token = backdatedToken(U1.id, "user", 10);
});

afterAll(() => t?.close());

describe("uploads ownership", () => {
  test("upload without token is rejected (401)", async () => {
    const r = await t.api("POST", "/common/upload");
    expect(r.status).toBe(401);
  });

  test("user cannot delete another user's upload (403)", async () => {
    await t.db.collection("assets").insertOne({
      public_id: "library/u1-pic",
      owner: U1.id,
      resourceType: "image",
      url: "https://x/u1.png",
      mimetype: "image/png",
      name: "u1.png",
    });
    const r = await t.api("POST", "/common/remove", {
      token: u2ForgedAdmin,
      body: { public_id: "library/u1-pic" },
    });
    expect(r.status).toBe(403);
  });

  test("user cannot claim another user's upload as profile picture", async () => {
    const r = await t.api("PATCH", "/user/profile-picture", {
      token: u2ForgedAdmin,
      body: { profilePicture: { public_id: "library/u1-pic", url: "https://evil" } },
    });
    expect(r.status).toBe(400);
  });
});

describe("roles come from the DB and admin data never leaks secrets", () => {
  test("forged admin role in JWT is ignored (403)", async () => {
    const r = await t.api("GET", "/admin/users", { token: u2ForgedAdmin });
    expect(r.status).toBe(403);
  });

  test("admin user list works with hostile search + huge limit", async () => {
    const r = await t.api("GET", "/admin/users?limit=100000&search=(a%2B)%2B%24", {
      token: admin.token,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.limit).toBe(100);
  });

  test("admin user list hides otp / reset token / 2FA secret / password", async () => {
    const r = await t.api("GET", "/admin/users", { token: admin.token });
    const body = JSON.stringify(r.json);
    expect(r.status).toBe(200);
    expect(body).not.toContain("leak-me");
    expect(body).not.toContain("SECRET2FA");
    expect(body).not.toContain("111111");
    expect(body).not.toContain(u1Hash);
  });

  test("non-whitelisted query filters are ignored", async () => {
    const r = await t.api("GET", "/admin/users?resetPassword.token=leak-me", {
      token: admin.token,
    });
    expect(r.json?.data?.totalDocs).toBe(4);
  });
});

describe("login", () => {
  test("wrong password -> 401", async () => {
    const r = await t.api("POST", "/auth/login", {
      body: { email: U1.email, password: "wrong", authType: "email" },
    });
    expect(r.status).toBe(401);
  });

  test("unknown email -> 401", async () => {
    const r = await t.api("POST", "/auth/login", {
      body: { email: "ghost@t.pk", password: "x", authType: "email" },
    });
    expect(r.status).toBe(401);
  });

  test("correct login -> 200 + token; responses carry X-Request-Id", async () => {
    const r = await t.api("POST", "/auth/login", {
      body: { email: U1.email, password: PASSWORD, authType: "email" },
    });
    expect(r.status).toBe(200);
    expect(r.json.token).toBeTruthy();
    expect(r.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("OTP lockout survives aborted transactions", () => {
  let lastStatus;

  test("wrong OTP attempts are counted despite rollback; the 6th is locked (429)", async () => {
    for (let i = 0; i < 6; i++) {
      lastStatus = (
        await t.api("POST", "/auth/verify-otp", {
          body: { email: Unverified.email, otp: "000000" },
        })
      ).status;
    }
    const user = await t.db.collection("users").findOne({ _id: Unverified.id });
    expect(user.otp.attempts).toBe(5);
    expect(lastStatus).toBe(429);
  });

  test("correct OTP is refused once locked", async () => {
    const r = await t.api("POST", "/auth/verify-otp", {
      body: { email: Unverified.email, otp: "123456" },
    });
    expect(r.status).toBe(429);
  });
});

describe("profile and password", () => {
  test("profile update is committed by the time the response arrives and cannot rewrite userId", async () => {
    const r = await t.api("PUT", "/user/profile-update", {
      token: U1.token,
      body: { name: "U1 new", prefData: { bio: "hello", userId: String(U2.id) } },
    });
    const pref = await t.db.collection("preferences").findOne({ userId: U1.id });
    expect(r.status).toBe(200);
    expect(pref).toBeTruthy();
    expect(pref.bio).toBe("hello");
  });

  test("password change -> 200", async () => {
    const r = await t.api("PATCH", "/user/password-update", {
      token: U1.token,
      body: { currentPassword: PASSWORD, newPassword: "N3wPassw0rd!" },
    });
    expect(r.status).toBe(200);
  });

  test("old token rejected after password change (401)", async () => {
    const r = await t.api("GET", "/user/profile", { token: U1.token });
    expect(r.status).toBe(401);
  });

  test("auth limiter blocks the 11th attempt (429)", async () => {
    const r = await t.api("POST", "/auth/login", {
      body: { email: U1.email, password: "N3wPassw0rd!", authType: "email" },
    });
    expect(r.status).toBe(429);
  });

  test("fresh token after password change works", async () => {
    u1New = t.tokenFor(U1.id, "user"); // issued after the change, like a fresh login
    const r = await t.api("GET", "/user/profile", { token: u1New });
    expect(r.status).toBe(200);
  });
});

describe("categories", () => {
  beforeAll(async () => {
    await t.db.collection("categories").insertMany([
      { name: "Approved", slug: "approved", status: "approved" },
      { name: "Pending", slug: "pending", status: "pending" },
    ]);
    cat = await t.db.collection("categories").findOne({ name: "Approved" });
  });

  test("users cannot list pending categories", async () => {
    const r = await t.api("GET", "/category?status=pending", { token: u1New });
    expect(r.json.data.results).toHaveLength(1);
    expect(r.json.data.results.every((c) => c.status === "approved")).toBe(true);
  });

  test("admin can filter categories by status", async () => {
    const r = await t.api("GET", "/category?status=pending", { token: admin.token });
    expect(r.json.data.results).toHaveLength(1);
    expect(r.json.data.results[0].status).toBe("pending");
  });
});

describe("catalogue, reviews and rentals", () => {
  beforeAll(async () => {
    bookId = await t.mkBook("Secret Book", {
      price: 100,
      category: cat._id,
      createdBy: admin.id,
      file: { public_id: "library/books/secret", name: "secret.pdf", pages: 3 },
      pageCount: 3,
      coverImage: { url: "https://cdn/cover.png" },
    });
    draftId = await t.mkBook("Draft Book", {
      price: 100,
      category: cat._id,
      createdBy: admin.id,
      file: { public_id: "library/books/draft", name: "draft.pdf", pages: 3 },
      pageCount: 3,
      status: "draft",
    });
  });

  test("public catalogue works without login, published only, no file", async () => {
    const r = await t.api("GET", "/book");
    const body = JSON.stringify(r.json);
    expect(r.status).toBe(200);
    expect(r.json.data.results).toHaveLength(1);
    expect(body).not.toContain("library/books/secret");
    expect(body).not.toContain("createdBy");
  });

  test("review requires having rented the book (403)", async () => {
    const r = await t.api("POST", `/review/${bookId}`, { token: u1New, body: { rating: 5 } });
    expect(r.status).toBe(403);
  });

  test("client-supplied payment data can't create a free rental (payments unconfigured -> 503)", async () => {
    const saved = {
      title: process.env.EASYPAISA_ACCOUNT_TITLE,
      number: process.env.EASYPAISA_ACCOUNT_NUMBER,
    };
    delete process.env.EASYPAISA_ACCOUNT_TITLE;
    delete process.env.EASYPAISA_ACCOUNT_NUMBER;
    try {
      const r = await t.api("POST", "/rental", {
        token: u1New,
        body: { bookId, amountPaid: 0, paymentIntentId: "fake" },
      });
      expect(r.status).toBe(503);
    } finally {
      process.env.EASYPAISA_ACCOUNT_TITLE = saved.title;
      process.env.EASYPAISA_ACCOUNT_NUMBER = saved.number;
    }
    expect(await t.db.collection("rentals").countDocuments({ renterId: U1.id })).toBe(0);
  });
});

describe("books (admin)", () => {
  const baseBook = () => ({
    title: "Novel",
    author: "Writer",
    description: "A story",
    price: 250,
    categoryId: String(cat._id),
    coverImage: { public_id: "library/cover1" },
  });

  beforeAll(async () => {
    // Admin-owned assets: a public PDF (wrong), a private PDF (right), a cover.
    await t.db.collection("assets").insertMany([
      {
        public_id: "library/public.pdf",
        owner: admin.id,
        resourceType: "image",
        deliveryType: "upload",
        url: "https://x/p.pdf",
        mimetype: "application/pdf",
        name: "p.pdf",
        pages: 10,
      },
      {
        public_id: "library/books/novel",
        owner: admin.id,
        resourceType: "image",
        deliveryType: "authenticated",
        url: "https://x/a",
        mimetype: "application/pdf",
        name: "novel.pdf",
        format: "pdf",
        pages: 120,
      },
      {
        public_id: "library/cover1",
        owner: admin.id,
        resourceType: "image",
        deliveryType: "upload",
        url: "https://x/c.png",
        mimetype: "image/png",
        name: "c.png",
      },
    ]);
  });

  test("draft book is not visible publicly (404)", async () => {
    const r = await t.api("GET", `/book/${draftId}`);
    expect(r.status).toBe(404);
  });

  test("published book details are public", async () => {
    const r = await t.api("GET", `/book/${bookId}`);
    expect(r.status).toBe(200);
    expect(r.json.data.title).toBe("Secret Book");
    expect(r.json.data.file).toBeUndefined();
  });

  test("users cannot create books or open the admin book list (403)", async () => {
    expect((await t.api("POST", "/book", { token: u1New, body: {} })).status).toBe(403);
    expect((await t.api("GET", "/book/admin", { token: u1New })).status).toBe(403);
  });

  test("book file must be a PRIVATE upload", async () => {
    const r = await t.api("POST", "/book", {
      token: admin.token,
      body: { ...baseBook(), file: { public_id: "library/public.pdf" } },
    });
    expect(r.status).toBe(400);
  });

  test("fractional rupee price rejected", async () => {
    const r = await t.api("POST", "/book", {
      token: admin.token,
      body: { ...baseBook(), price: 99.5, file: { public_id: "library/books/novel" } },
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("price: must be a whole number");
  });

  test("admin creates + publishes a book", async () => {
    const r = await t.api("POST", "/book", {
      token: admin.token,
      body: { ...baseBook(), status: "published", file: { public_id: "library/books/novel" } },
    });
    expect(r.status).toBe(201);
    novelId = r.json.data._id;
  });

  test("book gets pageCount from the PDF, rentalDays 14, PKR, cover from asset record", async () => {
    const novel = await t.db.collection("books").findOne({ _id: oid(novelId) });
    expect(novel).toMatchObject({ pageCount: 120, rentalDays: 14, currency: "PKR" });
    expect(novel.coverImage.url).toBe("https://x/c.png");
  });

  test("publishing increments category bookCount", async () => {
    const c = await t.db.collection("categories").findOne({ _id: cat._id });
    expect(c.bookCount).toBe(1);
  });

  test("archiving decrements category bookCount", async () => {
    const r = await t.api("PATCH", `/book/${novelId}/status`, {
      token: admin.token,
      body: { status: "archived" },
    });
    const c = await t.db.collection("categories").findOne({ _id: cat._id });
    expect(r.status).toBe(200);
    expect(c.bookCount).toBe(0);
  });

  test("admin edit applies whitelisted fields only", async () => {
    const r = await t.api("PATCH", `/book/${novelId}`, {
      token: admin.token,
      body: { price: 300, rentalDays: 21, createdBy: String(U1.id) },
    });
    const after = await t.db.collection("books").findOne({ _id: oid(novelId) });
    expect(r.status).toBe(200);
    expect(after).toMatchObject({ price: 300, rentalDays: 21 });
    expect(String(after.createdBy)).toBe(String(admin.id));
  });

  test("admin book list filters by status and shows file meta", async () => {
    const r = await t.api("GET", "/book/admin?status=archived", { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.results).toHaveLength(1);
    expect(r.json.data.results[0].file?.public_id).toBe("library/books/novel");
  });
});

describe("upload content checks (magic bytes)", () => {
  test("fake PNG (wrong bytes) rejected", async () => {
    const res = await upload(
      "/common/upload",
      u1New,
      "files",
      "evil.png",
      "image/png",
      Buffer.from("<script>alert(1)</script> not a png"),
    );
    expect(res.status).toBe(400);
  });

  test("PDF no longer accepted on the public image upload", async () => {
    const res = await upload(
      "/common/upload",
      u1New,
      "files",
      "doc.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7 ..."),
    );
    expect(res.status).toBe(400);
  });

  test("users cannot upload book files (403)", async () => {
    const res = await upload(
      "/book/upload-file",
      u1New,
      "file",
      "b.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7 ..."),
    );
    expect(res.status).toBe(403);
  });

  test("fake PDF rejected on book upload", async () => {
    const res = await upload(
      "/book/upload-file",
      admin.token,
      "file",
      "b.pdf",
      "application/pdf",
      Buffer.from("MZ this is an exe"),
    );
    expect(res.status).toBe(400);
  });
});

describe("reader", () => {
  test("reader: no rental -> 403", async () => {
    const r = await t.api("GET", `/reader/${bookId}`, { token: u1New });
    expect(r.status).toBe(403);
  });

  test("reader: active rental opens the book", async () => {
    await t.db.collection("rentals").insertOne({
      bookId,
      renterId: U1.id,
      status: "active",
      paymentMethod: "single",
      price: 100,
      days: 14,
      startDate: new Date(Date.now() - 60000),
      endDate: new Date(Date.now() + 14 * 86400000),
    });
    const r = await t.api("GET", `/reader/${bookId}`, { token: u1New });
    expect(r.status).toBe(200);
    expect(r.json.data.pageCount).toBe(3);
    expect(r.json.data.accessUntil).toBeTruthy();
    expect(JSON.stringify(r.json)).not.toContain("library/books");
  });

  test("reader: out-of-range page -> 400", async () => {
    const r = await t.api("GET", `/reader/${bookId}/pages/99`, { token: u1New });
    expect(r.status).toBe(400);
  });

  test("reader: draft book hidden from users (404)", async () => {
    const r = await t.api("GET", `/reader/${draftId}`, { token: u1New });
    expect(r.status).toBe(404);
  });

  test("reader: admin can proof a draft", async () => {
    const r = await t.api("GET", `/reader/${draftId}`, { token: admin.token });
    expect(r.status).toBe(200);
  });

  test("reader: Cloudinary failure is a clean 502, no internals", async () => {
    const r = await t.api("GET", `/reader/${bookId}/pages/1`, { token: u1New });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain("cloudinary");
  });

  test("reader: pulling pages too fast is throttled", async () => {
    // Many networks -> critical flag (spoofed X-Forwarded-For through trust proxy).
    for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]) {
      await t.api("GET", `/reader/${bookId}/pages/1`, {
        token: u1New,
        headers: { "X-Forwarded-For": ip },
      });
    }
    // Scraping speed -> 429 + critical flag.
    let throttled = 0;
    for (let i = 0; i < 45; i++) {
      const s = (await t.api("GET", `/reader/${bookId}/pages/0`, { token: u1New })).status;
      if (s === 429) throttled++;
    }
    expect(throttled).toBeGreaterThan(0);
  });
});

describe("watermark", () => {
  test("watermark: produces a JPEG with visible marks", async () => {
    const { watermarkPage } = await import("../utils/watermark.js");
    const blank = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const marked = await watermarkPage(
      blank,
      "LibraryHub · 6a1b2c · ab***@gmail.com · 04/11/2026, 14:05",
    );
    const stats = await sharp(marked).stats();
    expect(marked[0]).toBe(0xff);
    expect(marked[1]).toBe(0xd8);
    expect(stats.channels[0].min).toBeLessThan(250);
  });
});

describe("audit log", () => {
  const found = (filter) => waitFor(() => audits().findOne(filter));
  const counted = (filter, n) =>
    waitFor(async () => (await audits().countDocuments(filter)) === n, 1500);

  test("audit: wrong password logged", async () => {
    expect(
      await found({
        action: "auth.login",
        outcome: "failure",
        "metadata.reason": "wrong_password",
        actor: U1.id,
      }),
    ).toBeTruthy();
  });

  test("audit: unknown email logged", async () => {
    expect(
      await found({
        action: "auth.login",
        "metadata.reason": "unknown_email",
        "metadata.email": "ghost@t.pk",
      }),
    ).toBeTruthy();
  });

  test("audit: successful login logged with IP", async () => {
    expect(
      await found({
        action: "auth.login",
        outcome: "success",
        actor: U1.id,
        ip: { $exists: true },
      }),
    ).toBeTruthy();
  });

  test("audit: permission denied logged", async () => {
    expect(await found({ action: "authz.denied", actor: U2.id })).toBeTruthy();
  });

  test("audit: foreign upload delete attempt logged", async () => {
    expect(await found({ action: "upload.remove", outcome: "failure" })).toBeTruthy();
  });

  test("audit: OTP lockout logged", async () => {
    expect(await found({ action: "auth.otp.locked" })).toBeTruthy();
  });

  test("audit: password change logged", async () => {
    expect(await found({ action: "user.password.change", outcome: "success" })).toBeTruthy();
  });

  test("audit: rate-limit hit logged once", async () => {
    await counted({ action: "security.rate_limited" }, 1);
    expect(await audits().countDocuments({ action: "security.rate_limited" })).toBe(1);
  });

  test("audit: book create/status/update logged", async () => {
    const filter = {
      action: { $in: ["admin.book.create", "admin.book.status", "admin.book.update"] },
    };
    await counted(filter, 3);
    expect(await audits().countDocuments(filter)).toBe(3);
  });

  test("audit: reader denied + opened logged", async () => {
    expect(await found({ action: "reader.denied" })).toBeTruthy();
    expect(await found({ action: "reader.open", actor: U1.id })).toBeTruthy();
  });

  test("audit: many-networks reader flagged CRITICAL", async () => {
    expect(
      await found({
        action: "reader.suspicious",
        severity: "critical",
        "metadata.reason": "many_networks",
      }),
    ).toBeTruthy();
  });

  test("audit: scraping-speed reader flagged CRITICAL once", async () => {
    const filter = { action: "reader.suspicious", "metadata.reason": "rate_limit" };
    await counted(filter, 1);
    expect(await audits().countDocuments(filter)).toBe(1);
  });

  test("audit logs cannot be deleted through the app", async () => {
    const { default: AuditLog } = await import("../models/AuditLog.Model.js");
    await expect(AuditLog.deleteMany({})).rejects.toThrow();
    expect(await audits().countDocuments()).toBeGreaterThan(0);
  });
});

describe("request log", () => {
  beforeAll(async () => {
    const { flushRequestLogs } = await import("../middlewares/requestLogger.js");
    await flushRequestLogs();
  });

  test("request log: every page view recorded with reader", async () => {
    expect(
      await reqLogs().findOne({ path: `/reader/${bookId}/pages/1`, user: U1.id }),
    ).toBeTruthy();
  });

  test("request log: login recorded, password redacted", async () => {
    const loginLog = await reqLogs().findOne({ path: "/auth/login", status: 200 });
    expect(loginLog).toBeTruthy();
    expect(loginLog.body?.password).toBe("[REDACTED]");
  });

  test("request log: authenticated user attached", async () => {
    const authedLog = await reqLogs().findOne({ path: "/user/profile", status: 200 });
    expect(String(authedLog?.user)).toBe(String(U1.id));
  });

  test("request log: error reason stored", async () => {
    const failLog = await reqLogs().findOne({ path: `/review/${bookId}` });
    expect(failLog?.error).toBeTruthy();
  });
});

describe("admin log queries", () => {
  test("admin can query audit logs", async () => {
    const r = await t.api("GET", "/admin/audit-logs?action=auth.login&outcome=failure", {
      token: admin.token,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.totalDocs).toBe(2);
  });

  test("admin can query request logs by user", async () => {
    const r = await t.api("GET", `/admin/request-logs?user=${U1.id}`, { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.json.data.totalDocs).toBeGreaterThanOrEqual(1);
  });

  test("invalid date filter -> 400", async () => {
    const r = await t.api("GET", "/admin/audit-logs?from=not-a-date", { token: admin.token });
    expect(r.status).toBe(400);
  });
});
