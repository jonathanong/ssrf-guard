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

export const LOCALHOST_BLOCKED_HOSTNAME_POLICY = {
  exact: ["localhost"],
  suffixes: [".localhost", ".local"],
} as const satisfies BlockedHostnamePolicy;

export interface PublicHostnameOptions {
  blockedHostnames?: BlockedHostnamePolicy;
  allowSingleLabel?: boolean;
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
  let normalized = hostname.toLowerCase();
  while (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }
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

export function isPublicHostname(hostname: string, options?: PublicHostnameOptions): boolean {
  const normalizedHostname = normalizeUrlHostname(hostname);
  const policy = options?.blockedHostnames ?? LOCALHOST_BLOCKED_HOSTNAME_POLICY;
  if (isBlockedHostname(normalizedHostname, policy)) return false;
  if (isPrivateIp(normalizedHostname)) return false;
  if (
    options?.allowSingleLabel !== true &&
    !normalizedHostname.includes(".") &&
    !normalizedHostname.includes(":")
  ) {
    return false;
  }
  return isValidHostname(normalizedHostname);
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

function isValidHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false;
  if (hostname.includes(":")) return isValidIpv6Hostname(hostname);
  const labels = hostname.split(".");
  if (labels.every((label) => /^\d+$/.test(label))) return isValidCanonicalIpv4(labels);
  return labels.every(isValidHostnameLabel);
}

function isValidCanonicalIpv4(labels: string[]): boolean {
  return (
    labels.length === 4 &&
    labels.every((label) => {
      const value = Number(label);
      return Number.isInteger(value) && value >= 0 && value <= 255 && String(value) === label;
    })
  );
}

function isValidIpv6Hostname(hostname: string): boolean {
  try {
    new URL(`http://[${hostname}]/`);
    return true;
  } catch {
    return false;
  }
}

function isValidHostnameLabel(label: string): boolean {
  return label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

function createNullRouteDnsError(hostname: string, address?: string): Error {
  const addressDescription = address ? `null-route address: ${address}` : "no usable addresses";
  return Object.assign(new Error(`DNS resolved ${hostname} to ${addressDescription}`), {
    code: DNS_NULL_ROUTE_CODE,
  });
}
