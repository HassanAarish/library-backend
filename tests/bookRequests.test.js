import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { oid, sleep, startTestServer, waitFor } from "./support/testServer.js";

let t;
let admin, A, B, C, D, E, F, G;
let alch, dupAlch, atomic;

beforeAll(async () => {
  t = await startTestServer("bookRequests");
  admin = await t.mkUser("Admin", { role: "admin" });
  [A, B, C, D, E, F, G] = await Promise.all(
    ["Ali", "Bilal", "Chand", "Dua", "Eman", "Faraz", "Ghazal"].map((n) => t.mkUser(n)),
  );
});

afterAll(() => t?.close());

const updateMails = () => t.mailFailures("Update on your book request");

describe("creating and merging duplicate requests", () => {
  test("the partial unique index on title+author exists", async () => {
    const indexes = await t.db.collection("bookrequests").indexes();
    expect(
      indexes.some((i) => i.unique && i.key.titleKey === 1 && i.partialFilterExpression?.isOpen),
    ).toBe(true);
  });

  test("a first request is created with one follower and hides private fields", async () => {
    const r = await t.api("POST", "/bookrequest", {
      token: A.token,
      body: { title: "The Alchemist", author: "Paulo Coelho", note: "Urdu edition please" },
    });
    alch = r.json.data.request;
    expect(r.status).toBe(201);
    expect(r.json.data.joined).toBe(false);
    expect(alch).toMatchObject({ followerCount: 1, following: true });
    expect(alch).not.toHaveProperty("followers");
    expect(alch).not.toHaveProperty("requestedBy");
    expect(alch).not.toHaveProperty("titleKey");
  });

  test("the same title with punctuation and no author joins it", async () => {
    const r = await t.api("POST", "/bookrequest", {
      token: B.token,
      body: { title: "alchemist!" },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.joined).toBe(true);
    expect(String(r.json.data.request._id)).toBe(String(alch._id));
    expect(r.json.data.request.followerCount).toBe(2);
  });

  test("asking again is idempotent", async () => {
    const r = await t.api("POST", "/bookrequest", { token: B.token, body: { title: "ALCHEMIST" } });
    expect(r.json.data.alreadyFollowing).toBe(true);
    expect(r.json.data.request.followerCount).toBe(2);
  });

  test("a differently typed author still matches", async () => {
    const r = await t.api("POST", "/bookrequest", {
      token: C.token,
      body: { title: "Alchemist", author: "paulo  coelho." },
    });
    expect(r.json.data.joined).toBe(true);
    expect(r.json.data.request.followerCount).toBe(3);
  });

  test("the same title by a different author is a separate request", async () => {
    const r = await t.api("POST", "/bookrequest", {
      token: D.token,
      body: { title: "The Alchemist", author: "Someone Else" },
    });
    dupAlch = r.json.data.request;
    expect(r.status).toBe(201);
    expect(String(dupAlch._id)).not.toBe(String(alch._id));
  });

  test("a matching ISBN joins even with a typo in the title", async () => {
    let r = await t.api("POST", "/bookrequest", {
      token: E.token,
      body: { title: "Atomic Habits", author: "James Clear", isbn: "978-0-7352-1129-2" },
    });
    atomic = r.json.data.request;
    expect(r.status).toBe(201);

    r = await t.api("POST", "/bookrequest", {
      token: A.token,
      body: { title: "Atomic habit", isbn: "9780735211292" },
    });
    expect(r.json.data.joined).toBe(true);
    expect(String(r.json.data.request._id)).toBe(String(atomic._id));
  });

  test.each([
    ["bad ISBN", { title: "X", isbn: "123" }],
    ["blank title", { title: "   " }],
    ["over-long title", { title: "y".repeat(300) }],
  ])("%s is rejected with 400", async (_, body) => {
    const r = await t.api("POST", "/bookrequest", { token: A.token, body });
    expect(r.status).toBe(400);
  });

  test("anonymous users can't create requests", async () => {
    const r = await t.api("POST", "/bookrequest", { body: { title: "Anon" } });
    expect(r.status).toBe(401);
  });

  test("a book already in the catalogue is returned instead", async () => {
    await t.mkBook("Existing Book");
    const r = await t.api("POST", "/bookrequest", {
      token: A.token,
      body: { title: "existing book", author: "writer" },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.alreadyInLibrary.title).toBe("Existing Book");
    expect(await t.db.collection("bookrequests").findOne({ titleKey: "existing book" })).toBeNull();
  });

  test("two identical requests at the same moment end up as one", async () => {
    const results = await Promise.all(
      [A, B].map((u) =>
        t.api("POST", "/bookrequest", {
          token: u.token,
          body: { title: "Race Book", author: "Q" },
        }),
      ),
    );
    results.forEach((r) => expect([200, 201, 409]).toContain(r.status));
    expect(
      await t.db.collection("bookrequests").countDocuments({ titleKey: "race book", isOpen: true }),
    ).toBe(1);
  });
});

describe("reading requests", () => {
  test("the community list is public, most wanted first, without user data", async () => {
    const r = await t.api("GET", "/bookrequest");
    expect(r.status).toBe(200);
    expect(String(r.json.data.results[0]._id)).toBe(String(alch._id));
    expect(JSON.stringify(r.json)).not.toMatch(/followers|requestedBy|@t\.pk/);
    expect(r.json.data.results.every((x) => x.following === undefined)).toBe(true);
  });

  test("logged-in users see which requests they follow", async () => {
    const r = await t.api("GET", "/bookrequest", { token: D.token });
    const following = Object.fromEntries(
      r.json.data.results.map((x) => [String(x._id), x.following]),
    );
    expect(following[String(dupAlch._id)]).toBe(true);
    expect(following[String(alch._id)]).toBe(false);
  });

  test("details are public; the following flag needs a login", async () => {
    let r = await t.api("GET", `/bookrequest/${alch._id}`);
    expect(r.status).toBe(200);
    expect(r.json.data.following).toBeUndefined();
    expect(r.json.data.history).toHaveLength(1);

    r = await t.api("GET", `/bookrequest/${alch._id}`, { token: B.token });
    expect(r.json.data.following).toBe(true);

    r = await t.api("GET", "/bookrequest/not-an-id");
    expect(r.status).toBe(404);
  });

  test("/mine lists what the user asked for or joined", async () => {
    const r = await t.api("GET", "/bookrequest/mine", { token: A.token });
    const titles = r.json.data.results.map((x) => x.title);
    expect(titles).toEqual(expect.arrayContaining(["The Alchemist", "Atomic Habits"]));
  });
});

describe("admin review", () => {
  test("admin endpoints are admin-only", async () => {
    expect((await t.api("GET", "/bookrequest/admin", { token: A.token })).status).toBe(403);
    const r = await t.api("PATCH", `/bookrequest/admin/${alch._id}/status`, {
      token: A.token,
      body: { status: "planned" },
    });
    expect(r.status).toBe(403);
  });

  test("the admin list and detail show requesters, followers and notes", async () => {
    let r = await t.api("GET", "/bookrequest/admin?status=open", { token: admin.token });
    expect(r.json.data.results.some((x) => x.requestedBy?.email === "ali@t.pk")).toBe(true);

    r = await t.api("GET", `/bookrequest/admin/${alch._id}`, { token: admin.token });
    expect(r.json.data.followers).toHaveLength(3);
    expect(r.json.data.followers).toContainEqual(
      expect.objectContaining({
        note: "Urdu edition please",
        user: expect.objectContaining({ email: "ali@t.pk" }),
      }),
    );
  });

  test("rejecting needs a reason; fulfilled can't be set directly", async () => {
    let r = await t.api("PATCH", `/bookrequest/admin/${alch._id}/status`, {
      token: admin.token,
      body: { status: "rejected" },
    });
    expect(r.status).toBe(400);

    r = await t.api("PATCH", `/bookrequest/admin/${alch._id}/status`, {
      token: admin.token,
      body: { status: "fulfilled" },
    });
    expect(r.status).toBe(400);
  });

  test("a status update is recorded and every follower is emailed", async () => {
    const r = await t.api("PATCH", `/bookrequest/admin/${alch._id}/status`, {
      token: admin.token,
      body: { status: "planned", note: "Ordering a copy this week" },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({
      status: "planned",
      statusNote: "Ordering a copy this week",
    });
    expect(r.json.data.history).toHaveLength(2);
    expect(await waitFor(() => updateMails() === 3)).toBe(true);
  });

  test("merging moves followers and closes the duplicate", async () => {
    let r = await t.api("POST", `/bookrequest/admin/${dupAlch._id}/merge`, {
      token: admin.token,
      body: { intoId: dupAlch._id },
    });
    expect(r.status).toBe(400);

    r = await t.api("POST", `/bookrequest/admin/${dupAlch._id}/merge`, {
      token: admin.token,
      body: { intoId: alch._id },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.followerCount).toBe(4);

    const source = await t.db.collection("bookrequests").findOne({ _id: oid(dupAlch._id) });
    expect(source).toMatchObject({ status: "merged", isOpen: false });
    expect(String(source.mergedInto)).toBe(String(alch._id));

    // Only the moved follower (D) is told.
    expect(await waitFor(() => updateMails() === 4)).toBe(true);
  });

  test("following a merged request points to the one it was merged into", async () => {
    const r = await t.api("POST", `/bookrequest/${dupAlch._id}/follow`, { token: E.token });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain(String(alch._id));
  });
});

describe("following", () => {
  test("follow and unfollow adjust the count", async () => {
    let r = await t.api("POST", `/bookrequest/${alch._id}/follow`, {
      token: E.token,
      body: { note: "me too" },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.request.followerCount).toBe(5);

    r = await t.api("DELETE", `/bookrequest/${alch._id}/follow`, { token: E.token });
    expect(r.json.data).toMatchObject({ followerCount: 4, following: false });

    r = await t.api("DELETE", `/bookrequest/${alch._id}/follow`, { token: E.token });
    expect(r.status).toBe(404);
  });

  test("when the last follower leaves, the request is withdrawn and can be asked again", async () => {
    await t.api("DELETE", `/bookrequest/${atomic._id}/follow`, { token: E.token });
    let r = await t.api("DELETE", `/bookrequest/${atomic._id}/follow`, { token: A.token });
    expect(r.json.data).toMatchObject({ status: "withdrawn", followerCount: 0 });

    r = await t.api("POST", "/bookrequest", {
      token: B.token,
      body: { title: "Atomic Habits", author: "James Clear" },
    });
    expect(r.status).toBe(201);
    expect(String(r.json.data.request._id)).not.toBe(String(atomic._id));
  });
});

describe("fulfilling", () => {
  test("only a published book can fulfil a request", async () => {
    const draft = await t.mkBook("Alchemist Draft", { status: "draft" });
    const r = await t.api("POST", `/bookrequest/admin/${alch._id}/fulfill`, {
      token: admin.token,
      body: { bookId: draft },
    });
    expect(r.status).toBe(400);
  });

  test("fulfilling links the book, closes the request and emails followers who opted in", async () => {
    await t.db
      .collection("preferences")
      .insertOne({ userId: C.id, notifications: { email: false, push: true, sms: false } });
    const real = await t.mkBook("The Alchemist (Urdu)");

    const r = await t.api("POST", `/bookrequest/admin/${alch._id}/fulfill`, {
      token: admin.token,
      body: { bookId: real, note: "Urdu edition, as asked." },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ status: "fulfilled", book: String(real) });
    expect(r.json.data.closedAt).toBeTruthy();

    // A, B, D are emailed; C turned email off.
    const title = `"The Alchemist (Urdu)" is now in the library`;
    expect(await waitFor(() => t.mailFailures(title) === 3)).toBe(true);
    await sleep(300);
    expect(t.mailFailures(title)).toBe(3);
  });

  test("a closed request can't change status", async () => {
    const r = await t.api("PATCH", `/bookrequest/admin/${alch._id}/status`, {
      token: admin.token,
      body: { status: "open" },
    });
    expect(r.status).toBe(400);
  });

  test("fulfilled requests are listed publicly with their book", async () => {
    let r = await t.api("GET", "/bookrequest?status=fulfilled");
    expect(r.json.data.results[0].book.title).toBe("The Alchemist (Urdu)");

    r = await t.api("GET", "/bookrequest?status=merged");
    expect(
      r.json.data.results.every((x) => ["open", "reviewing", "planned"].includes(x.status)),
    ).toBe(true);
  });
});

describe("limits and audit trail", () => {
  test("a user can follow at most 20 open requests", async () => {
    const now = new Date();
    await t.db.collection("bookrequests").insertMany(
      Array.from({ length: 20 }, (_, i) => ({
        title: `Followed ${i}`,
        titleKey: `followed ${i}`,
        authorKey: "",
        status: "open",
        isOpen: true,
        requestedBy: G.id,
        followers: [{ user: G.id, joinedAt: now }],
        followerCount: 1,
        history: [{ status: "open", at: now }],
        createdAt: now,
        updatedAt: now,
      })),
    );
    const r = await t.api("POST", "/bookrequest", {
      token: G.token,
      body: { title: "One Too Many" },
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/20 open requests/);
  });

  test("creating or joining is rate limited to 20 an hour", async () => {
    const codes = [];
    for (let i = 0; i < 21; i++) {
      codes.push(
        (await t.api("POST", "/bookrequest", { token: F.token, body: { title: `Spam ${i}` } }))
          .status,
      );
    }
    expect(codes.slice(0, 20).every((c) => c === 201)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  test.each([
    "book_request.create",
    "book_request.follow",
    "book_request.unfollow",
    "admin.book_request.status",
    "admin.book_request.merge",
    "admin.book_request.fulfill",
  ])("audit log records %s", async (action) => {
    expect(await waitFor(() => t.db.collection("auditlogs").findOne({ action }))).toBeTruthy();
  });
});
