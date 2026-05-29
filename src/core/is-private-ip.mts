// Special-use and private ranges for SSRF prevention
const V4_BLOCKED_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^192\.0\.0\.(?!9$|10$)(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/,
  /^192\.88\.99\./,
  /^192\.0\.2\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^198\.(1[89])\./,
  /^(22[4-9]|23\d)\./,
  /^(24\d|25[0-5])\./,
];

// Private/blocked IPv6 ranges (non-mapped)
const V6_BLOCKED_RANGES = [
  /^\[?::1\]?$/, // Loopback
  /^\[?::\]?$/, // Unspecified address
  /^\[?f[cd][0-9a-f]{2}:/i, // ULA fc00::/7 (covers fc** and fd**)
  /^\[?fe[89ab][0-9a-f]:/i, // Link-local fe80::/10 (covers fe80–febf)
  /^\[?ff[0-9a-f]{2}:/i, // Multicast ff00::/8
];

const IPV4_COMPONENT_BASE = 256;
const IPV4_MAX = IPV4_COMPONENT_BASE ** 4 - 1;
const IPV4_COMPONENT_MAX = IPV4_COMPONENT_BASE - 1;

function resolveIpv4MappedEmbedded(embedded: string): string | undefined {
  const normalized = normalizeIpv4Address(embedded);
  if (normalized) return normalized;
  if (embedded.includes(".")) return embedded;
  const hexMatch = embedded.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMatch) {
    const [, highHex, lowHex] = hexMatch;
    // v8 ignore next -- regex capture groups are always defined when hexMatch is truthy
    if (!highHex || !lowHex) return undefined;
    const high = parseInt(highHex, 16);
    const low = parseInt(lowHex, 16);
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
  }
  return undefined;
}

function normalizeIpv4Address(ip: string): string | undefined {
  const parts = ip.split(".");
  if (parts.length > 4 || parts.some((part) => part === "")) return undefined;
  const numbers: number[] = [];
  for (const part of parts) {
    const number = parseIpv4Component(part);
    if (number === undefined) return undefined;
    numbers.push(number);
  }
  const lastNumber = numbers.at(-1);
  // v8 ignore next -- unreachable: parts is always non-empty and all parts parsed above
  if (lastNumber === undefined) return undefined;
  const leadingNumbers = numbers.slice(0, -1);
  if (leadingNumbers.some((number) => number > IPV4_COMPONENT_MAX)) return undefined;
  const lastNumberMax = IPV4_COMPONENT_BASE ** (5 - numbers.length) - 1;
  if (lastNumber > lastNumberMax) return undefined;
  const addressNumber =
    leadingNumbers.reduce(
      (total, number, index) => total + number * IPV4_COMPONENT_BASE ** (3 - index),
      0,
    ) + lastNumber;
  // v8 ignore next -- unreachable: leading+last bounds already cap addressNumber at IPV4_MAX
  if (addressNumber > IPV4_MAX) return undefined;
  return [
    Math.floor(addressNumber / IPV4_COMPONENT_BASE ** 3) % IPV4_COMPONENT_BASE,
    Math.floor(addressNumber / IPV4_COMPONENT_BASE ** 2) % IPV4_COMPONENT_BASE,
    Math.floor(addressNumber / IPV4_COMPONENT_BASE) % IPV4_COMPONENT_BASE,
    addressNumber % IPV4_COMPONENT_BASE,
  ].join(".");
}

function parseIpv4Component(component: string): number | undefined {
  if (/^0[xX]/.test(component)) {
    return parseNumberComponent(component.slice(2), 16, /^[0-9a-f]+$/i);
  }
  if (component.length > 1 && component.startsWith("0")) {
    return parseNumberComponent(component.slice(1), 8, /^[0-7]*$/);
  }
  return parseNumberComponent(component, 10, /^\d+$/);
}

function parseNumberComponent(
  digits: string,
  radix: number,
  allowedDigits: RegExp,
): number | undefined {
  if (!allowedDigits.test(digits)) return undefined;
  // v8 ignore next -- unreachable: all callers use + regexes so empty digits always fail above
  const number = digits === "" ? 0 : Number.parseInt(digits, radix);
  if (!Number.isSafeInteger(number) || number > IPV4_MAX) return undefined;
  return number;
}

function isPrivateCanonicalIpv4(ip: string): boolean {
  return V4_BLOCKED_RANGES.some((re) => re.test(ip));
}

export function isPrivateIp(ip: string): boolean {
  if (V6_BLOCKED_RANGES.some((re) => re.test(ip))) return true;
  const ipv4MappedMatch = ip.match(/^\[?::ffff:([^\]]+)\]?$/i);
  if (ipv4MappedMatch) {
    const ipv4 = resolveIpv4MappedEmbedded(ipv4MappedMatch[1]);
    return ipv4 ? isPrivateCanonicalIpv4(ipv4) : false;
  }
  const normalizedIpv4 = normalizeIpv4Address(ip);
  return isPrivateCanonicalIpv4(normalizedIpv4 ?? ip);
}
