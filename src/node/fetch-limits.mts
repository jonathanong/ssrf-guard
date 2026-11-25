import type { PinnedDispatcherOptions } from "./pinned-dispatcher.mjs";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export interface FetchLimits {
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface FetchDeadline {
  signal: AbortSignal | undefined;
  clear(): void;
}

export function checkFetchLimits({ timeoutMs, maxResponseBytes }: FetchLimits): void {
  if (!(timeoutMs > 0) || (timeoutMs !== Infinity && !Number.isInteger(timeoutMs))) {
    throw new RangeError("timeoutMs must be a positive integer or Infinity");
  }
  if (
    !(maxResponseBytes >= 0) ||
    (maxResponseBytes !== Infinity && !Number.isInteger(maxResponseBytes))
  ) {
    throw new RangeError("maxResponseBytes must be a non-negative integer or Infinity");
  }
}

// One timer for the whole call: DNS, connect, and every redirect hop up to the final
// response headers. It is cleared once safeFetch settles, so it never cuts off a body
// the caller is still reading; the dispatcher's bodyTimeout bounds stalls there instead.
export function startDeadline(timeoutMs: number, callerSignal?: AbortSignal): FetchDeadline {
  if (timeoutMs === Infinity) return { signal: callerSignal, clear: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`safeFetch timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);
  const signal =
    callerSignal === undefined
      ? controller.signal
      : AbortSignal.any([callerSignal, controller.signal]);
  return { signal, clear: () => clearTimeout(timer) };
}

export function dispatcherLimits({
  timeoutMs,
  maxResponseBytes,
}: FetchLimits): PinnedDispatcherOptions {
  return {
    bodyTimeout: timeoutMs === Infinity ? 0 : timeoutMs,
    maxResponseSize: maxResponseBytes === Infinity ? -1 : maxResponseBytes,
  };
}
