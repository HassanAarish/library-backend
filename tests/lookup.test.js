import { v2 as cloudinary } from "cloudinary";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { startTestServer } from "./support/testServer.js";

let t;
let admin, reader;

// Open Library is mocked: tests never call the real service.
const realFetch = globalThis.fetch;
const openLibraryCalls = [];
const OL_SEARCH = {
  docs: [
    {
      key: "/works/OL17930368W",
      title: "Atomic Habits",
      subtitle: "An Easy & Proven Way to Build Good Habits",
      author_name: ["James Clear"],
      first_publish_year: 2016,
      isbn: ["0735211299", "9780735211292"],
      language: ["eng"],
      cover_i: 12539702,
      number_of_pages_median: 320,
      subject: ["Habits", "Self-help"],
    },
    { key: "/works/OL1W" }, // no title → dropped
  ],
};
const OL_WORK = {
  title: "Atomic Habits",
  description: { value: "Tiny changes, remarkable results.\n----------\n([source][1])" },
  subjects: ["Habits"],
  covers: [-1, 12539702],
};

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    const href = String(url);
    if (!href.startsWith("https://openlibrary.org")) return realFetch(url, init);
    openLibraryCalls.push({ href, ua: init?.headers?.["User-Agent"] });
    const body = href.includes("/search.json")
      ? OL_SEARCH
      : href.includes("/works/OL17930368W")
        ? OL_WORK
        : null;
    return Promise.resolve(
      new Response(body ? JSON.stringify(body) : "{}", { status: body ? 200 : 404 }),
    );
  });

  t = await startTestServer("lookup");
  admin = await t.mkUser("Admin", { role: "admin" });
  reader = await t.mkUser("Reader");
});

afterEach(() => vi.mocked(cloudinary.uploader.upload).mockReset?.());
afterAll(() => t?.close());

describe("Open Library search", () => {
  test("needs a login", async () => {
    expect((await t.api("GET", "/lookup/books?q=atomic")).status).toBe(401);
  });

  test("returns cleaned results with cover URLs and a contactable User-Agent", async () => {
    const r = await t.api("GET", "/lookup/books?q=atomic habits", { token: reader.token });
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(1);
    expect(r.json.data[0]).toMatchObject({
      workKey: "OL17930368W",
      title: "Atomic Habits: An Easy & Proven Way to Build Good Habits",
      author: "James Clear",
      publishedYear: 2016,
      isbn: "9780735211292",
      language: "English",
      pageCount: 320,
      coverId: 12539702,
      coverUrl: "https://covers.openlibrary.org/b/id/12539702-M.jpg",
    });
    expect(openLibraryCalls[0].ua).toMatch(/^LibraryHub\/1\.0/);
  });

  test("results are cached", async () => {
    const before = openLibraryCalls.length;
    await t.api("GET", "/lookup/books?q=atomic habits", { token: reader.token });
    expect(openLibraryCalls.length).toBe(before);
  });

  test("ISBN search queries by isbn", async () => {
    const r = await t.api("GET", "/lookup/books?isbn=978-0-7352-1129-2", { token: admin.token });
    expect(r.status).toBe(200);
    expect(openLibraryCalls.at(-1).href).toContain("q=isbn%3A9780735211292");
  });

  test.each([
    ["too short a query", "/lookup/books?q=a"],
    ["a bad ISBN", "/lookup/books?isbn=123"],
    ["a bad work id", "/lookup/books/notawork"],
  ])("rejects %s", async (_, path) => {
    expect((await t.api("GET", path, { token: reader.token })).status).toBe(400);
  });

  test("work details strip Open Library's footnotes", async () => {
    const r = await t.api("GET", "/lookup/books/OL17930368W", { token: reader.token });
    expect(r.json.data).toMatchObject({
      description: "Tiny changes, remarkable results.",
      coverId: 12539702,
    });
  });

  test("an unknown work is a 404", async () => {
    const r = await t.api("GET", "/lookup/books/OL9W", { token: reader.token });
    expect(r.status).toBe(404);
  });
});

describe("cover import", () => {
  test("is admin-only and validated", async () => {
    let r = await t.api("POST", "/lookup/cover", { token: reader.token, body: { coverId: 1 } });
    expect(r.status).toBe(403);
    r = await t.api("POST", "/lookup/cover", { token: admin.token, body: { coverId: "x" } });
    expect(r.status).toBe(400);
  });

  test("copies the cover to Cloudinary from a server-built URL and records it as the admin's asset", async () => {
    const upload = vi.spyOn(cloudinary.uploader, "upload").mockResolvedValue({
      secure_url: "https://res.cloudinary.com/x/library/covers/abc.jpg",
      public_id: "library/covers/abc",
      resource_type: "image",
      type: "upload",
      format: "jpg",
      bytes: 1234,
    });

    const r = await t.api("POST", "/lookup/cover", {
      token: admin.token,
      body: { coverId: 12539702 },
    });
    expect(r.status).toBe(201);
    expect(upload).toHaveBeenCalledWith(
      "https://covers.openlibrary.org/b/id/12539702-L.jpg",
      expect.objectContaining({ folder: "library/covers" }),
    );

    const asset = await t.db.collection("assets").findOne({ public_id: "library/covers/abc" });
    expect(String(asset.owner)).toBe(String(admin.id));
    expect(asset.mimetype).toBe("image/jpeg");
  });
});

describe("public category list", () => {
  test("visitors see approved categories without who suggested them", async () => {
    await t.db.collection("categories").insertMany([
      { name: "Poetry", slug: "poetry", status: "approved", proposedBy: reader.id, bookCount: 0 },
      { name: "Secret", slug: "secret", status: "pending", proposedBy: reader.id, bookCount: 0 },
    ]);
    const r = await t.api("GET", "/category?limit=50");
    expect(r.status).toBe(200);
    const names = r.json.data.results.map((c) => c.name);
    expect(names).toContain("Poetry");
    expect(names).not.toContain("Secret");
    expect(JSON.stringify(r.json)).not.toContain(String(reader.id));
  });

  test("the admin still sees every status with the proposer", async () => {
    const r = await t.api("GET", "/category?status=pending", { token: admin.token });
    expect(r.json.data.results[0]).toMatchObject({
      name: "Secret",
      proposedBy: expect.objectContaining({ email: "reader@t.pk" }),
    });
  });
});
