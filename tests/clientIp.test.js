import { describe, expect, test } from "vitest";
import { clientIp, clientIpFromHeaders, isCloudflare, isInternalHop } from "../utils/clientIp.js";

describe("hop types", () => {
  test.each([
    "127.0.0.1",
    "10.24.225.5",
    "172.20.1.1",
    "192.168.0.9",
    "100.64.3.2",
    "169.254.1.1",
    "::1",
    "fd12::1",
    "::ffff:10.1.2.3",
  ])("%s is an internal hop", (addr) => {
    expect(isInternalHop(addr)).toBe(true);
  });

  test.each([
    "198.51.100.7",
    "172.68.249.156",
    "8.8.8.8",
    "2001:db8::1",
    "",
    "not-an-ip",
    undefined,
  ])("%p is not an internal hop", (addr) => {
    expect(isInternalHop(addr)).toBe(false);
  });

  test.each(["172.68.249.156", "104.16.1.1", "162.159.0.1", "2606:4700::1", "2a06:98c0:3600::103"])(
    "%s is Cloudflare",
    (addr) => {
      expect(isCloudflare(addr)).toBe(true);
    },
  );

  test.each(["198.51.100.20", "10.0.0.1", "8.8.8.8"])("%s is not Cloudflare", (addr) => {
    expect(isCloudflare(addr)).toBe(false);
  });
});

describe("client address", () => {
  test("Render as seen live: reader, then Cloudflare, then Render's 10.x hop", () => {
    // Same shape as the live /admin/ip-check on 2026-11-25 (reader address replaced).
    expect(clientIp("::1", "198.51.100.20, 172.68.249.156, 10.31.62.7")).toBe("198.51.100.20");
  });

  test("an address the reader wrote themselves is ignored: the edge's entry wins", () => {
    expect(clientIp("::1", "1.2.3.4, 198.51.100.20, 172.68.249.156, 10.31.62.7")).toBe(
      "198.51.100.20",
    );
  });

  test("a Cloudflare Worker counts as its own address, not the one it wrote", () => {
    // The Worker's request leaves from a Cloudflare address, then reaches
    // Render through Cloudflare's edge like any other.
    expect(clientIp("::1", "203.0.113.99, 2a06:98c0:3600::103, 172.68.249.156, 10.31.62.7")).toBe(
      "2a06:98c0:3600::103",
    );
  });

  test("a reader whose own address is Cloudflare's (e.g. WARP) gets that address", () => {
    expect(clientIp("::1", "10.0.0.1, 104.16.5.5, 172.68.249.156, 10.31.62.7")).toBe("104.16.5.5");
  });

  test("no proxy: the socket's own address", () => {
    expect(clientIp("198.51.100.9", undefined)).toBe("198.51.100.9");
    expect(clientIp("::ffff:198.51.100.9", "")).toBe("198.51.100.9");
  });

  test("one internal proxy (tests, local): the address it forwarded", () => {
    expect(clientIp("127.0.0.1", "203.0.113.5")).toBe("203.0.113.5");
  });

  test("only internal hops (local network): the furthest one", () => {
    expect(clientIp("127.0.0.1", "10.0.0.2")).toBe("10.0.0.2");
  });

  test("a Cloudflare hop with nothing beyond it is the address", () => {
    expect(clientIp("::1", "172.68.249.156, 10.31.62.7")).toBe("172.68.249.156");
  });

  test("no address at all gives undefined, like Express", () => {
    expect(clientIp(undefined, undefined)).toBeUndefined();
  });
});

describe("Cloudflare's CF-Connecting-IP", () => {
  const chain = "1.2.3.4, 198.51.100.20, 172.68.249.156, 10.31.62.7";

  test("is used when the hop in front of Render is Cloudflare", () => {
    expect(clientIp("::1", chain, "198.51.100.21")).toBe("198.51.100.21");
  });

  test("is ignored when the request didn't come through Cloudflare", () => {
    // A client connecting straight in can't choose its address with the header.
    expect(clientIp("198.51.100.9", undefined, "203.0.113.7")).toBe("198.51.100.9");
    expect(clientIp("127.0.0.1", "198.51.100.30", "203.0.113.7")).toBe("198.51.100.30");
  });

  test("a value that isn't an address falls back to counting hops", () => {
    expect(clientIp("::1", chain, "nonsense")).toBe("198.51.100.20");
  });

  test("works straight from request headers (Express and Socket.IO)", () => {
    expect(
      clientIpFromHeaders("::1", {
        "x-forwarded-for": chain,
        "cf-connecting-ip": "198.51.100.22",
      }),
    ).toBe("198.51.100.22");
    expect(clientIpFromHeaders("::1", { "x-forwarded-for": chain })).toBe("198.51.100.20");
  });
});
