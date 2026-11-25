import { BlockList, isIP } from "node:net";

/**
 * Which proxy hops we trust when working out a reader's real address.
 *
 * On Render a request passes through more than one internal proxy before it
 * reaches us, so "trust one hop" gave Render's own 10.x address for everyone.
 * We trust only internal/private addresses: the reader's address is then the
 * first public one, reading X-Forwarded-For from the right. Render's edge
 * appends that itself, so a client can't fake it by sending its own header.
 *
 * Check it on the live server with GET /admin/ip-check (admin only).
 */
const internal = new BlockList();
for (const [net, prefix] of [
  ["127.0.0.0", 8], // loopback
  ["10.0.0.0", 8], // private
  ["172.16.0.0", 12], // private
  ["192.168.0.0", 16], // private
  ["100.64.0.0", 10], // carrier-grade NAT, used inside some cloud networks
  ["169.254.0.0", 16], // link-local
]) {
  internal.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
]) {
  internal.addSubnet(net, prefix, "ipv6");
}

/** "::ffff:10.0.0.1" → "10.0.0.1"; trims spaces. */
const normalise = (addr) => {
  const a = String(addr ?? "").trim();
  return a.toLowerCase().startsWith("::ffff:") && isIP(a.slice(7)) === 4 ? a.slice(7) : a;
};

/** True for an internal proxy hop we may look past. */
export const isTrustedProxy = (addr) => {
  const a = normalise(addr);
  const family = isIP(a);
  if (!family) return false;
  return internal.check(a, family === 4 ? "ipv4" : "ipv6");
};

/**
 * The client's address from the socket's address and the X-Forwarded-For
 * header, by the same rule Express uses for req.ip (see app.js).
 */
export const clientIp = (remoteAddress, forwardedFor) => {
  const hops = [
    normalise(remoteAddress),
    ...String(forwardedFor ?? "")
      .split(",")
      .map(normalise)
      .filter(Boolean)
      .reverse(),
  ];
  for (const hop of hops) {
    if (!isTrustedProxy(hop)) return hop;
  }
  return hops[hops.length - 1];
};
