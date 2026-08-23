import { Agent } from "undici";
import type { LookupFunction } from "node:net";
import type { ResolvedSafeAddress } from "../core/index.mjs";

export type NonEmptyResolvedSafeAddresses = [ResolvedSafeAddress, ...ResolvedSafeAddress[]];

export interface PinnedDispatcherOptions {
  connections?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  connect?: { timeout?: number };
}

export interface PinnedDispatcherCacheOptions extends PinnedDispatcherOptions {
  maxSize?: number;
}

export interface PinnedDispatcherCache {
  readonly size: number;
  get(resolvedAddresses: readonly ResolvedSafeAddress[]): Agent;
  close(): Promise<void>;
}

export function createPinnedLookup(
  resolvedAddresses: NonEmptyResolvedSafeAddresses,
): LookupFunction {
  return (_hostname, options, callback): void => {
    const [firstAddress, ...additionalAddresses] = resolvedAddresses;
    const first = { address: firstAddress.address, family: firstAddress.family };
    const addresses = [
      first,
      ...additionalAddresses.map(({ address, family }) => ({ address, family })),
    ];
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, first.address, first.family);
  };
}

export function createPinnedDispatcher(
  resolvedAddresses: NonEmptyResolvedSafeAddresses,
  options?: PinnedDispatcherOptions,
): Agent {
  const {
    connections,
    headersTimeout,
    bodyTimeout,
    keepAliveTimeout,
    keepAliveMaxTimeout,
    connect,
  } = options ?? {};
  return new Agent({
    ...(connections === undefined ? {} : { connections }),
    ...(headersTimeout === undefined ? {} : { headersTimeout }),
    ...(bodyTimeout === undefined ? {} : { bodyTimeout }),
    ...(keepAliveTimeout === undefined ? {} : { keepAliveTimeout }),
    ...(keepAliveMaxTimeout === undefined ? {} : { keepAliveMaxTimeout }),
    connect: {
      ...(connect?.timeout === undefined ? {} : { timeout: connect.timeout }),
      lookup: createPinnedLookup(resolvedAddresses),
    },
  });
}

export function createPinnedDispatcherCache(
  options?: PinnedDispatcherCacheOptions,
): PinnedDispatcherCache {
  const { maxSize = 100, ...dispatcherOptions } = options ?? {};
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError("maxSize must be a positive integer");
  }

  const cache = new Map<string, Agent>();
  const inFlightClosePromises = new Set<Promise<void>>();
  let closePromise: Promise<void> | undefined;
  let closing = false;

  const closeDispatcherBestEffort = (dispatcher: Agent): Promise<void> => {
    let dispatcherClosePromise: Promise<void>;
    try {
      dispatcherClosePromise = dispatcher.close();
    } catch {
      dispatcherClosePromise = Promise.resolve();
    }
    const trackedClosePromise = dispatcherClosePromise.catch(() => {
      // Closing is best-effort so shutdown/eviction is idempotent.
    });
    inFlightClosePromises.add(trackedClosePromise);
    void trackedClosePromise.finally(() => inFlightClosePromises.delete(trackedClosePromise));
    return trackedClosePromise;
  };

  return {
    get size() {
      return cache.size;
    },

    get(resolvedAddresses) {
      if (closing) {
        throw new Error("Pinned dispatcher cache is closed");
      }
      const addresses = toNonEmptyAddresses(resolvedAddresses);
      const canonicalAddresses = sortPinnedDispatcherAddresses(addresses);
      const cacheKey = getPinnedDispatcherCacheKey(canonicalAddresses);
      const cachedDispatcher = cache.get(cacheKey);
      if (cachedDispatcher) {
        cache.delete(cacheKey);
        cache.set(cacheKey, cachedDispatcher);
        return cachedDispatcher;
      }

      const dispatcher = createPinnedDispatcher(canonicalAddresses, dispatcherOptions);
      evictPinnedDispatcherIfNeeded(cache, maxSize, closeDispatcherBestEffort);
      cache.set(cacheKey, dispatcher);
      return dispatcher;
    },

    close() {
      if (closePromise !== undefined) return closePromise;

      closing = true;
      const dispatchers = Array.from(new Set(cache.values()));
      cache.clear();
      dispatchers.forEach(closeDispatcherBestEffort);
      closePromise = Promise.all(inFlightClosePromises).then(() => undefined);
      return closePromise;
    },
  };
}

function toNonEmptyAddresses(
  resolvedAddresses: readonly ResolvedSafeAddress[],
): NonEmptyResolvedSafeAddresses {
  const [firstAddress, ...additionalAddresses] = resolvedAddresses;
  if (firstAddress === undefined) throw new RangeError("resolvedAddresses must not be empty");
  return [firstAddress, ...additionalAddresses];
}

function sortPinnedDispatcherAddresses(
  resolvedAddresses: NonEmptyResolvedSafeAddresses,
): NonEmptyResolvedSafeAddresses {
  return toNonEmptyAddresses([...resolvedAddresses].sort(comparePinnedResolvedAddress));
}

function comparePinnedResolvedAddress(a: ResolvedSafeAddress, b: ResolvedSafeAddress): number {
  return a.family - b.family || a.address.localeCompare(b.address);
}

function getPinnedDispatcherCacheKey(resolvedAddresses: readonly ResolvedSafeAddress[]): string {
  return resolvedAddresses.map(({ address, family }) => `${family}:${address}`).join("|");
}

function evictPinnedDispatcherIfNeeded(
  cache: Map<string, Agent>,
  maxSize: number,
  closeDispatcher: (dispatcher: Agent) => Promise<void>,
): void {
  while (cache.size >= maxSize) {
    const oldestCacheKey = cache.keys().next().value!;
    const oldestDispatcher = cache.get(oldestCacheKey)!;
    cache.delete(oldestCacheKey);
    closeDispatcher(oldestDispatcher);
  }
}
