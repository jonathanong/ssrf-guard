import dns from "node:dns";
import net from "node:net";
import type { LookupAddress } from "node:dns";
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
  timeoutMs?: number;
  signal?: AbortSignal;
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

  const addresses = await lookupHostname(hostname, options);
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

function lookupHostname(
  hostname: string,
  options: ValidateUrlOptions | undefined,
): Promise<LookupAddress[]> {
  const lookupPromise = dns.promises.lookup(hostname, { all: true });
  const { signal, timeoutMs } = options ?? {};

  if (signal === undefined && timeoutMs === undefined) return lookupPromise;

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (): void => {
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    const settle = <T,>(callback: (value: T) => void, value: T): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const onAbort = (): void => {
      settle(reject, createAbortError(`DNS lookup for ${hostname} aborted`));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    if (timeoutMs !== undefined) {
      timeout = setTimeout(
        () => {
          settle(
            reject,
            createAbortError(`DNS lookup for ${hostname} timed out after ${timeoutMs}ms`),
          );
        },
        Math.max(0, timeoutMs),
      );
      timeout.unref?.();
    }

    lookupPromise.then(
      (addresses) => settle(resolve, addresses),
      (error: unknown) => settle(reject, error),
    );
  });
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
