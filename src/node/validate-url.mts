import dns from "node:dns";
import net from "node:net";
import type { LookupAddress, LookupAllOptions } from "node:dns";
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
type LookupAllOptionsWithSignal = LookupAllOptions & { signal?: AbortSignal };

export async function validateUrl(
  rawUrl: string,
  options?: ValidateUrlOptions,
): Promise<ResolvedSafeAddress[]> {
  const policy = options?.blockedHostnames ?? EMPTY_POLICY;

  const url = URL.parse(rawUrl);
  if (url === null) {
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
  const { signal, timeoutMs } = options ?? {};
  if (signal?.aborted) {
    return Promise.reject(createAbortErrorForSignal(hostname, signal));
  }

  const lookupOptions: LookupAllOptionsWithSignal =
    signal === undefined ? { all: true } : { all: true, signal };
  const lookupPromise = dns.promises.lookup(hostname, lookupOptions) as Promise<LookupAddress[]>;

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

    const onAbort = (): void => settle(reject, createAbortErrorForSignal(hostname, signal));

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

function createAbortErrorForSignal(hostname: string, signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error && !isDefaultAbortReason(signal.reason)) {
    return signal.reason;
  }
  return createAbortError(`DNS lookup for ${hostname} aborted`, signal?.reason);
}

function isDefaultAbortReason(reason: Error): boolean {
  return reason.name === "AbortError" && reason.message === "This operation was aborted";
}

function createAbortError(message: string, cause?: unknown): Error {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  error.name = "AbortError";
  return error;
}
