import ipaddr from "ipaddr.js";

const PUBLIC_RESERVED_IPV4_ADDRESSES = new Set(["192.0.0.9", "192.0.0.10"]);

// Deprecated IPv4-compatible IPv6 (RFC 4291 §2.5.5.1). ipaddr.js reports the hex
// spelling (`::7f00:1`) as unicast, and the WHATWG URL parser rewrites the dotted
// spelling into it, so the whole block is rejected rather than decoded.
// ipaddr.js reads the dotted spelling (`::8.8.8.8`) as IPv4-mapped instead, so
// that one is matched on its text.
const IPV4_COMPATIBLE_IPV6_RANGE = ipaddr.parseCIDR("::/96");

export function isPrivateIp(ip: string): boolean {
  const normalizedIp = normalizeIpForParsing(ip);
  try {
    const address = ipaddr.process(normalizedIp);
    if (isDottedIpv4CompatibleIpv6(normalizedIp)) return true;
    if (address.kind() === "ipv4" && PUBLIC_RESERVED_IPV4_ADDRESSES.has(address.toString())) {
      return false;
    }
    if (address.kind() === "ipv6" && address.match(IPV4_COMPATIBLE_IPV6_RANGE)) return true;
    return address.range() !== "unicast";
  } catch {
    return false;
  }
}

function isDottedIpv4CompatibleIpv6(ip: string): boolean {
  return ip.startsWith("::") && ip.includes(".") && !ip.includes(":", 2);
}

function normalizeIpForParsing(ip: string): string {
  let normalizedIp = ip;
  if (ip.startsWith("[") && ip.endsWith("]")) {
    normalizedIp = ip.slice(1, -1);
  }
  return normalizedIp.replace(/%.*$/, "");
}
