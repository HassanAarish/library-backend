import { describe, expect, test } from "vitest";
import { clientIp, isTrustedProxy } from "../utils/clientIp.js";

describe("trusted proxy hops", () => {
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
    expect(isTrustedProxy(addr)).toBe(true);
  });

  test.each(["198.51.100.7", "203.0.113.5", "8.8.8.8", "2001:db8::1", "", "not-an-ip", undefined])(
    "%p is not trusted",
    (addr) => {
      expect(isTrustedProxy(addr)).toBe(false);
    },
  );
});

describe("client address", () => {
  test("Render: client appended by the edge, then internal hops", () => {
    expect(clientIp("10.24.0.1", "198.51.100.7, 10.12.0.5")).toBe("198.51.100.7");
  });

  test("a header the client faked is ignored: the edge's entry wins", () => {
    expect(clientIp("10.24.0.1", "1.2.3.4, 198.51.100.7, 10.12.0.5")).toBe("198.51.100.7");
  });

  test("no proxy: the socket's own address", () => {
    expect(clientIp("198.51.100.9", undefined)).toBe("198.51.100.9");
    expect(clientIp("::ffff:198.51.100.9", "")).toBe("198.51.100.9");
  });

  test("only internal hops: the furthest one", () => {
    expect(clientIp("127.0.0.1", "10.0.0.2")).toBe("10.0.0.2");
  });
});
