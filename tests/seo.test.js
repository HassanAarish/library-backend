import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestServer } from "./support/testServer.js";

let t;
let published;

beforeAll(async () => {
  t = await startTestServer("seo");
  published = await t.mkBook("Public Book");
  await t.mkBook("Hidden Draft", { status: "draft" });
});

afterAll(() => t?.close());

describe("sitemap", () => {
  test("lists the public pages and only published books", async () => {
    const res = await fetch(`${t.base}/seo/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain("/books</loc>");
    expect(xml).toContain("/privacy</loc>");
    expect(xml).toContain(`/books/${published}</loc>`);
    expect((xml.match(/<url>/g) ?? []).length).toBe(8); // 7 pages + 1 book
    expect(xml).not.toMatch(/\/(admin|account|read)\b/);
  });
});
