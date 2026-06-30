import { isPrivateIp } from "./is-private-ip.mjs";

export const DNS_NULL_ROUTE_CODE = "DNS_NULL_ROUTE";

export interface ResolvedSafeAddress {
  address: string;
  family: 4 | 6;
}

interface ResolvedAddressLike {
  address: string;
  family: number;
}

export interface BlockedHostnamePolicy {
  exact: readonly string[];
  suffixes: readonly string[];
}

export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
      return u.href;
    }
    return url;
  } catch {
    return url.replace(/^((?:[a-z0-9+.-]+:)?(?:\/\/)?)([^\s/?#]+)@/i, "$1***:***@");
  }
}

export class UnsafeResolvedAddressError extends Error {
  readonly rawUrl: string;
  readonly address: string;

  constructor(rawUrl: string, address: string) {
    super(`DNS resolved to private IP: ${address}`);
    this.rawUrl = sanitizeUrl(rawUrl);
    this.address = address;
  }
}

export function normalizeUrlHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

// NOSONAR
export function isBlockedHostname(hostname: string, policy: BlockedHostnamePolicy): boolean {
  const isExactMatch = policy.exact.some((exact) => exact.toLowerCase() === hostname);
  if (isExactMatch) return true;
  return policy.suffixes.some((suffix) => hostname.endsWith(suffix.toLowerCase()));
}

export function validateResolvedAddresses<T extends ResolvedAddressLike>(
  rawUrl: string,
  hostname: string,
  addresses: readonly T[],
): T[] {
  const usableAddresses = addresses.filter(({ address }) => !isNullRouteAddress(address));
  for (const { address } of usableAddresses) {
    if (isPrivateIp(address)) throw new UnsafeResolvedAddressError(rawUrl, address);
  }
  if (usableAddresses.length === 0) {
    throw createNullRouteDnsError(hostname, addresses[0]?.address);
  }
  return usableAddresses;
}

function isNullRouteAddress(address: string): boolean {
  return address === "::" || address === "0.0.0.0";
}

function createNullRouteDnsError(hostname: string, address?: string): Error {
  const addressDescription = address ? `null-route address: ${address}` : "no usable addresses";
  return Object.assign(new Error(`DNS resolved ${hostname} to ${addressDescription}`), {
    code: DNS_NULL_ROUTE_CODE,
  });
}
