import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { oid, sleep, startTestServer, waitFor } from "./support/testServer.js";

let t;
let reader, other, quiet, admin;
let notify, notifyAdmins, pushContent, setPushTransport;
let sent = [];
let reply = () => ({ status: "ok" });

const tok = (s) => `ExponentPushToken[${s.padEnd(22, "x")}]`;
const devices = () => t.db.collection("pushdevices").find().toArray();

beforeAll(async () => {
  t = await startTestServer("push");
  ({ notify, notifyAdmins } = await import("../services/Notification.Service.js"));
  ({ pushContent, setPushTransport } = await import("../services/Push.Service.js"));
  setPushTransport(async (messages) => {
    sent.push(...messages);
    return messages.map((m) => reply(m));
  });

  reader = await t.mkUser("Reader");
  other = await t.mkUser("Other");
  quiet = await t.mkUser("Quiet");
  admin = await t.mkUser("Admin", { role: "admin" });
  await t.db
    .collection("preferences")
    .insertOne({ userId: oid(quiet.id), notifications: { email: true, push: false } });
});

beforeEach(() => {
  sent = [];
  reply = () => ({ status: "ok" });
});

afterAll(() => t?.close());

describe("registering a phone", () => {
  test("needs sign-in", async () => {
    const r = await t.api("POST", "/notification/devices", {
      body: { token: tok("a"), platform: "android" },
    });
    expect(r.status).toBe(401);
  });

  test.each([
    [{ token: "not-a-token", platform: "android" }],
    [{ token: tok("a"), platform: "windows" }],
    [{ platform: "android" }],
  ])("rejects a bad body %j", async (body) => {
    const r = await t.api("POST", "/notification/devices", { token: reader.token, body });
    expect(r.status).toBe(400);
  });

  test("saves the token, once, even when registered again", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await t.api("POST", "/notification/devices", {
        token: reader.token,
        body: { token: tok("reader"), platform: "android" },
      });
      expect(r.status).toBe(200);
    }
    const rows = (await devices()).filter((d) => d.token === tok("reader"));
    expect(rows).toHaveLength(1);
    expect(String(rows[0].user)).toBe(String(reader.id));
  });

  test("another account signing in on the same phone takes the token over", async () => {
    await t.api("POST", "/notification/devices", {
      token: other.token,
      body: { token: tok("shared"), platform: "android" },
    });
    await t.api("POST", "/notification/devices", {
      token: reader.token,
      body: { token: tok("shared"), platform: "android" },
    });
    const row = (await devices()).find((d) => d.token === tok("shared"));
    expect(String(row.user)).toBe(String(reader.id));
  });

  test("sign-out removes it, but only for the signed-in owner", async () => {
    const wrong = await t.api("DELETE", "/notification/devices", {
      token: other.token,
      body: { token: tok("shared") },
    });
    expect(wrong.status).toBe(200);
    expect((await devices()).some((d) => d.token === tok("shared"))).toBe(true);

    const r = await t.api("DELETE", "/notification/devices", {
      token: reader.token,
      body: { token: tok("shared") },
    });
    expect(r.status).toBe(200);
    expect((await devices()).some((d) => d.token === tok("shared"))).toBe(false);
  });
});

describe("sending", () => {
  beforeAll(async () => {
    for (const [user, name] of [
      [other, "other"],
      [quiet, "quiet"],
      [admin, "admin"],
    ]) {
      await t.api("POST", "/notification/devices", {
        token: user.token,
        body: { token: tok(name), platform: "android" },
      });
    }
  });

  test("a reader's notification reaches their phone with the app's wording", async () => {
    notify(reader.id, {
      type: "payment.approved",
      title: "Payment confirmed",
      message: "Rs 300 received for Sapiens.",
      data: { rentalId: "r1" },
      email: false,
    });
    const msg = await waitFor(() => sent.find((m) => m.to === tok("reader")));
    expect(msg).toMatchObject({
      title: "Booking confirmed",
      channelId: "default",
      data: { type: "payment.approved", data: { rentalId: "r1" } },
    });
    expect(msg.data.notificationId).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(msg)).not.toMatch(/Rs|payment confirmed|300/i);

    const saved = await t.db.collection("notifications").findOne({ type: "payment.approved" });
    expect(msg.data.notificationId).toBe(String(saved._id));
  });

  test("only to the recipient's own phones", async () => {
    notify(other.id, {
      type: "rental.started",
      title: "Your book is ready to read",
      message: "Happy reading!",
      email: false,
    });
    await waitFor(() => sent.length);
    await sleep(100);
    expect(sent.map((m) => m.to)).toEqual([tok("other")]);
    expect(sent[0]).toMatchObject({ title: "Your book is ready to read", body: "Happy reading!" });
  });

  test("not to someone who turned push off (the in-app notification still arrives)", async () => {
    notify(quiet.id, { type: "rental.started", title: "Ready", message: "Go", email: false });
    await waitFor(() =>
      t.db.collection("notifications").findOne({ recipient: oid(quiet.id), title: "Ready" }),
    );
    await sleep(150);
    expect(sent).toEqual([]);
  });

  test("admin notifications are never pushed", async () => {
    notifyAdmins({ type: "payment.submitted", title: "Payment to review", message: "Rs 300" });
    await waitFor(() =>
      t.db
        .collection("notifications")
        .findOne({ recipient: oid(admin.id), type: "payment.submitted" }),
    );
    await sleep(150);
    expect(sent).toEqual([]);
  });

  test("a phone Expo reports as gone is forgotten", async () => {
    reply = (m) =>
      m.to === tok("other")
        ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
        : { status: "ok" };
    notify(other.id, { type: "rental.ended", title: "Rental ended", message: "Bye", email: false });
    expect(
      await waitFor(async () => !(await devices()).some((d) => d.token === tok("other"))),
    ).toBe(true);
  });

  test("a failing push service doesn't break the in-app notification", async () => {
    const previous = setPushTransport(async () => {
      throw new Error("offline");
    });
    try {
      notify(reader.id, {
        type: "rental.ended",
        title: "Still saved",
        message: "ok",
        email: false,
      });
      expect(
        await waitFor(() => t.db.collection("notifications").findOne({ title: "Still saved" })),
      ).toBeTruthy();
      expect(await waitFor(() => t.logs.some((l) => l.includes("Push send failed")))).toBe(true);
    } finally {
      setPushTransport(previous);
    }
  });
});

describe("push wording", () => {
  test.each([
    [{ type: "payment.approved", data: { userPackageId: "p" } }, "Reading plan active"],
    [{ type: "payment.rejected", title: "Payment not confirmed" }, "Booking not confirmed"],
    [{ type: "refund.resolved", title: "Refund sent" }, "Update on a cancelled booking"],
    [{ type: "rental.hold_expired", title: "Booking released" }, "Booking released"],
  ])("%j has app wording", (n, title) => {
    const c = pushContent({ message: "Rs 300 refunded via Easypaisa", ...n });
    expect(c.title).toBe(title);
    expect(`${c.title} ${c.body}`).not.toMatch(/pay|refund|Rs|easypaisa/i);
  });

  test("a book that was added doesn't say 'rent it now'", () => {
    const c = pushContent({
      type: "book_request.fulfilled",
      title: '"Sapiens" is now in the library',
      message: "You can rent it now from the catalogue.",
    });
    expect(c.title).toBe('"Sapiens" is now in the library');
    expect(c.body).not.toMatch(/rent/i);
  });

  test("other text with payment words falls back to a neutral message", () => {
    const c = pushContent({ type: "rental.ended", title: "Ended", message: "Pay Rs 50 to extend" });
    expect(c).toEqual({
      title: "LibraryHub",
      body: "You have a new update. Open the app to see it.",
    });
  });

  test("'rental' is not mistaken for 'rent'", () => {
    expect(pushContent({ type: "rental.ended", title: "Rental ended", message: "Hi" }).title).toBe(
      "Rental ended",
    );
  });

  test("long text is shortened", () => {
    const c = pushContent({ type: "rental.started", title: "T", message: "word ".repeat(100) });
    expect(c.body.length).toBeLessThanOrEqual(240);
    expect(c.body.endsWith("…")).toBe(true);
  });

  test("admin types have no push", () => {
    expect(pushContent({ type: "book_request.created", title: "x", message: "y" })).toBeNull();
  });
});
