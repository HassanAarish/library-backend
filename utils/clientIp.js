import { BlockList, isIP } from "node:net";

/**
 * Working out a reader's real address (rate limits, the reader's network check,
 * activity logs). Used for req.ip (app.js) and for live-update sockets.
 *
 * On Render a request reaches us as   reader → Cloudflare → Render (10.x) → app,
 * e.g. X-Forwarded-For "<reader>, 172.68.249.156, 10.31.62.7" (shape seen live
 * 2026-11-25). Reading X-Forwarded-For from the right we:
 *   1. skip internal hops (Render's 10.x proxies, loopback, …);
 *   2. if the next hop is Cloudflare's edge, use CF-Connecting-IP when present
 *      (Cloudflare overwrites it, so a client can't set it through Cloudflare);
 *   3. otherwise skip ONE Cloudflare hop, the edge, and take the next address.
 * Only one Cloudflare hop is skipped: a request sent from a Cloudflare Worker
 * leaves from a Cloudflare address too, and should count as that address rather
 * than whatever the Worker wrote further left (not yet checked with a real Worker).
 * Assumes the app is only reachable through Render; on a host where a client can
 * connect directly from a private network, it could choose its own address.
 *
 * Cloudflare's ranges rarely change; they're published at
 * https://www.cloudflare.com/ips-v4 and /ips-v6 (copied 2026-11-25). If they do
 * and Render's edge uses a new one, readers would share that address: check
 * with GET /admin/ip-check (admin only) after Render or Cloudflare changes.
 */

const blockList = (v4, v6) => {
  const list = new BlockList();
  for (const cidr of v4) {
    const [net, prefix] = cidr.split("/");
    list.addSubnet(net, Number(prefix), "ipv4");
  }
  for (const cidr of v6) {
    const [net, prefix] = cidr.split("/");
    list.addSubnet(net, Number(prefix), "ipv6");
  }
  return list;
};

const internal = blockList(
  [
    "127.0.0.0/8", // loopback
    "10.0.0.0/8", // private
    "172.16.0.0/12", // private
    "192.168.0.0/16", // private
    "100.64.0.0/10", // carrier-grade NAT, used inside some cloud networks
    "169.254.0.0/16", // link-local
  ],
  ["::1/128", "fc00::/7", "fe80::/10"], // loopback, unique local, link-local
);

const cloudflare = blockList(
  [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ],
  [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ],
);

/** "::ffff:10.0.0.1" → "10.0.0.1"; trims spaces. */
const normalise = (addr) => {
  const a = String(addr ?? "").trim();
  return a.toLowerCase().startsWith("::ffff:") && isIP(a.slice(7)) === 4 ? a.slice(7) : a;
};

const inList = (list, addr) => {
  const a = normalise(addr);
  const family = isIP(a);
  return family ? list.check(a, family === 4 ? "ipv4" : "ipv6") : false;
};

/** True for an internal hop (loopback, private, link-local): never a reader. */
export const isInternalHop = (addr) => inList(internal, addr);

/** True for an address in Cloudflare's published ranges. */
export const isCloudflare = (addr) => inList(cloudflare, addr);

/**
 * The client's address from the socket's address, the X-Forwarded-For header and
 * Cloudflare's CF-Connecting-IP header (see the rule above). Undefined when
 * there's no address at all, as Express's own req.ip would be.
 */
export const clientIp = (remoteAddress, forwardedFor, cfConnectingIp) => {
  const hops = [
    normalise(remoteAddress),
    ...String(forwardedFor ?? "")
      .split(",")
      .map(normalise)
      .filter(Boolean)
      .reverse(),
  ].filter(Boolean);
  if (hops.length === 0) return undefined;

  let i = 0;
  while (i < hops.length - 1 && isInternalHop(hops[i])) i++;
  if (isCloudflare(hops[i])) {
    // Cloudflare's own record of who connected to it, when Render passes it on.
    const fromEdge = normalise(cfConnectingIp);
    if (isIP(fromEdge)) return fromEdge;
    // Otherwise the one edge in front of Render, if there's an address beyond it.
    if (i < hops.length - 1) i++;
  }
  return hops[i];
};

/** The same, straight from a Node/Express request or a Socket.IO handshake. */
export const clientIpFromHeaders = (remoteAddress, headers = {}) =>
  clientIp(remoteAddress, headers["x-forwarded-for"], headers["cf-connecting-ip"]);
