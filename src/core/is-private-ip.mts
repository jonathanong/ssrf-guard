import ipaddr from "ipaddr.js";

const PUBLIC_RESERVED_IPV4_ADDRESSES = new Set(["192.0.0.9", "192.0.0.10"]);

export function isPrivateIp(ip: string): boolean {
  const normalizedIp = normalizeIpForParsing(ip);
  try {
    const address = ipaddr.process(normalizedIp);
    if (address.kind() === "ipv4" && PUBLIC_RESERVED_IPV4_ADDRESSES.has(address.toString())) {
      return false;
    }
    return address.range() !== "unicast";
  } catch {
    return false;
  }
}

function normalizeIpForParsing(ip: string): string {
  let normalizedIp = ip;
  if (ip.startsWith("[") && ip.endsWith("]")) {
    normalizedIp = ip.slice(1, -1);
  }
  return normalizedIp.replace(/%.*$/, "");
}
