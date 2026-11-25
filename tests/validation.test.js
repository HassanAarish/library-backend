import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestServer } from "./support/testServer.js";

let t;
let admin, user;
let book, category;

beforeAll(async () => {
  t = await startTestServer("validation");
  admin = await t.mkUser("Admin", { role: "admin" });
  user = await t.mkUser("Sana", { password: "currentPass1" });
  category = await t.mkCategory("History");
  book = await t.mkBook("Validation Book", { category });
});

afterAll(() => t?.close());

// Auth routes are rate limited per IP; give each auth request its own client
// address (the app trusts one proxy hop, so X-Forwarded-For sets req.ip).
let ipCounter = 0;
const freshIp = () => ({ "X-Forwarded-For": `10.0.0.${++ipCounter}` });

const expect400 = (r, message) => {
  expect(r.status).toBe(400);
  expect(r.json.success).toBe(false);
  if (message) expect(r.json.error).toMatch(message);
};

describe("auth", () => {
  test.each([
    ["a short password", { password: "abc1" }, /password: must be at least 8 characters/],
    ["a password without a number", { password: "abcdefgh" }, /password: must contain a number/],
    ["an invalid email", { email: "not-an-email" }, /email: must be a valid email address/],
    ["an unknown auth type", { authType: "apple" }, /authType: must be email, google or facebook/],
    ["a one-letter name", { name: "A" }, /name: must be at least 2 characters/],
  ])("register rejects %s", async (_, change, message) => {
    const body = {
      name: "Hina",
      email: "hina@t.pk",
      password: "goodPass1",
      authType: "email",
      ...change,
    };
    expect400(await t.api("POST", "/auth/register", { body, headers: freshIp() }), message);
  });

  test("several problems are reported together", async () => {
    const r = await t.api("POST", "/auth/register", { body: { email: "x" }, headers: freshIp() });
    expect400(r);
    expect(r.json.error.split("; ").length).toBeGreaterThan(1);
  });

  test("login accepts an older short password but requires the fields", async () => {
    expect400(
      await t.api("POST", "/auth/login", { body: { email: "a@t.pk" } }),
      /password: is required/,
    );
    const r = await t.api("POST", "/auth/login", {
      body: { email: "sana@t.pk", password: "short", authType: "email" },
    });
    expect(r.status).not.toBe(400); // reaches the credential check (wrong password → 401)
  });

  test("OTP must be six digits; a numeric OTP is accepted", async () => {
    expect400(
      await t.api("POST", "/auth/verify-otp", { body: { email: "sana@t.pk", otp: "12ab" } }),
      /otp: must be the 6-digit code/,
    );
    // Passes validation and reaches the service (Sana is already verified).
    const r = await t.api("POST", "/auth/verify-otp", {
      body: { email: "sana@t.pk", otp: 123456 },
    });
    expect(r.json.error).toBe("Invalid or expired verification code.");
  });

  test("reset-password reads the token from the link's query string", async () => {
    let r = await t.api("POST", "/auth/reset-password", { body: { password: "brandNew1" } });
    expect400(r, /token is required/);

    r = await t.api("POST", "/auth/reset-password?token=abc", { body: { password: "brandNew1" } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Invalid or Expired Link"); // got past validation to the token check
  });

  test("social login only knows Google and Facebook", async () => {
    expect400(
      await t.api("POST", "/auth/social", { body: { provider: "apple", token: "x" } }),
      /provider: must be google or facebook/,
    );
  });
});

describe("profile", () => {
  test("a wrong current password is a 400, so the session stays", async () => {
    expect400(
      await t.api("PATCH", "/user/password-update", {
        token: user.token,
        body: { currentPassword: "notThePassword1", newPassword: "Another1Pass" },
      }),
      /current password you entered is incorrect/,
    );
  });

  test("new password rules apply on change, and it must differ", async () => {
    expect400(
      await t.api("PATCH", "/user/password-update", {
        token: user.token,
        body: { currentPassword: "currentPass1", newPassword: "short" },
      }),
      /newPassword: must be at least 8 characters/,
    );
    expect400(
      await t.api("PATCH", "/user/password-update", {
        token: user.token,
        body: { currentPassword: "currentPass1", newPassword: "currentPass1" },
      }),
      /newPassword: must be different from the current password/,
    );
  });

  test("preferences are checked field by field", async () => {
    expect400(
      await t.api("PUT", "/user/profile-update", {
        token: user.token,
        body: { prefData: { gender: "robot", notifications: { email: "nope" } } },
      }),
      /prefData\.gender/,
    );
  });

  test("valid preferences are saved", async () => {
    const r = await t.api("PUT", "/user/profile-update", {
      token: user.token,
      body: { name: "Sana Khan", prefData: { notifications: { email: false }, bio: "  Reader  " } },
    });
    expect(r.status).toBe(200);
    const prefs = await t.db.collection("preferences").findOne({ userId: user.id });
    expect(prefs.bio).toBe("Reader");
    expect(prefs.notifications.email).toBe(false);
  });
});

describe("rentals and payments", () => {
  test("bookId must be a valid id", async () => {
    expect400(
      await t.api("POST", "/rental", { token: user.token, body: { bookId: "123" } }),
      /bookId: must be a valid id/,
    );
  });

  test("payment method and start date are checked", async () => {
    const r = await t.api("POST", "/rental", {
      token: user.token,
      body: { bookId: book, paymentMethod: "cash", startDate: "someday" },
    });
    expect400(r, /paymentMethod: must be "single" or "credit"/);
    expect(r.json.error).toMatch(/startDate: must be a valid date/);
  });

  test("fields the client must not control are dropped", async () => {
    const r = await t.api("POST", "/rental", {
      token: user.token,
      body: { bookId: book, price: 0, status: "active", renterId: admin.id },
    });
    expect(r.status).toBe(201);
    const rental = r.json.data.rental;
    expect(rental.status).toBe("pending_payment");
    expect(rental.price).toBe(300);
  });

  test("payment proof needs a Pakistani mobile number and an uploaded screenshot", async () => {
    const r = await t.api("POST", `/payment/${"a".repeat(24)}/proof`, {
      token: user.token,
      body: { transactionId: "123456789", senderNumber: "12345", screenshot: "http://x" },
    });
    expect400(r, /senderNumber: must be a mobile number like 03001234567/);
    expect(r.json.error).toMatch(/screenshot: must be an uploaded file/);
  });

  test("+92 numbers are normalised", async () => {
    const r = await t.api("POST", `/payment/${"a".repeat(24)}/proof`, {
      token: user.token,
      body: {
        transactionId: "123456789",
        senderNumber: "+92 300 1234567",
        screenshot: { public_id: "x" },
      },
    });
    expect(r.status).toBe(404); // valid input; the payment just doesn't exist
  });

  test("rejecting a payment needs a reason", async () => {
    expect400(
      await t.api("PATCH", `/payment/admin/${"a".repeat(24)}/reject`, {
        token: admin.token,
        body: {},
      }),
      /reason: is required/,
    );
  });
});

describe("admin catalogue and packages", () => {
  test("a package plan's numbers are checked; numeric strings are accepted", async () => {
    const bad = await t.api("POST", "/package/admin/plans", {
      token: admin.token,
      body: { name: "Huge", credits: 500, price: -1 },
    });
    expect400(bad, /credits: must be at most 100/);
    expect(bad.json.error).toMatch(/price: must be at least 0/);

    const r = await t.api("POST", "/package/admin/plans", {
      token: admin.token,
      body: { name: "5 Books", credits: "5", price: "1400" },
    });
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ credits: 5, price: 1400 });
  });

  test("an empty update is rejected", async () => {
    expect400(
      await t.api("PATCH", `/book/${book}`, { token: admin.token, body: {} }),
      /Send at least one field to update/,
    );
  });

  test("book prices must be whole rupees", async () => {
    expect400(
      await t.api("PATCH", `/book/${book}`, { token: admin.token, body: { price: 99.5 } }),
      /price: must be a whole number/,
    );
  });

  test("book status must be a known value", async () => {
    expect400(
      await t.api("PATCH", `/book/${book}/status`, {
        token: admin.token,
        body: { status: "deleted" },
      }),
      /status: must be draft, published or archived/,
    );
  });

  test("validation runs after the role check (users get 403, not 400)", async () => {
    const r = await t.api("PATCH", `/book/${book}`, { token: user.token, body: {} });
    expect(r.status).toBe(403);
  });
});

describe("community", () => {
  test("a review rating must be 1–5", async () => {
    expect400(
      await t.api("POST", `/review/${book}`, { token: user.token, body: { rating: 9 } }),
      /rating: must be at most 5/,
    );
  });

  test("category names are 2–60 characters", async () => {
    expect400(
      await t.api("POST", "/category", { token: user.token, body: { name: "x" } }),
      /name: must be at least 2 characters/,
    );
  });

  test("removing files needs public_id or publicIds", async () => {
    expect400(
      await t.api("POST", "/common/remove", { token: user.token, body: {} }),
      /Send public_id or publicIds/,
    );
  });

  test("at most 100 notifications can be marked at once", async () => {
    const ids = Array.from({ length: 101 }, () => "a".repeat(24));
    expect400(
      await t.api("PATCH", "/notification/read", { token: user.token, body: { ids } }),
      /ids: at most 100 ids at once/,
    );
  });
});
