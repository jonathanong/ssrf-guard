import dns from "node:dns";
import net from "node:net";
import {
  isPrivateIp,
  isBlockedHostname,
  normalizeUrlHostname,
  UnsafeResolvedAddressError,
  validateResolvedAddresses,
  type BlockedHostnamePolicy,
  type ResolvedSafeAddress,
} from "../core/index.mjs";
import { UnsafeUrlError } from "./errors.mjs";

export type { BlockedHostnamePolicy, ResolvedSafeAddress };

export interface ValidateUrlOptions {
  blockedHostnames?: BlockedHostnamePolicy;
}

const EMPTY_POLICY: BlockedHostnamePolicy = { exact: [], suffixes: [] };

export async function validateUrl(
  rawUrl: string,
  options?: ValidateUrlOptions,
): Promise<ResolvedSafeAddress[]> {
  const policy = options?.blockedHostnames ?? EMPTY_POLICY;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(rawUrl, "invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(rawUrl, `scheme not allowed: ${url.protocol}`);
  }

  const hostname = normalizeUrlHostname(url.hostname);

  if (isBlockedHostname(hostname, policy)) {
    throw new UnsafeUrlError(rawUrl, `hostname not allowed: ${hostname}`);
  }

  if (net.isIP(hostname) !== 0 && isPrivateIp(hostname)) {
    throw new UnsafeUrlError(rawUrl, `IP address is private: ${hostname}`);
  }

  const addresses = await dns.promises.lookup(hostname, { all: true });
  try {
    return validateResolvedAddresses(rawUrl, hostname, addresses).map(({ address, family }) => ({
      address,
      family: family as 4 | 6,
    }));
  } catch (error) {
    if (error instanceof UnsafeResolvedAddressError) {
      throw new UnsafeUrlError(rawUrl, error.message);
    }
    throw error;
  }
}
