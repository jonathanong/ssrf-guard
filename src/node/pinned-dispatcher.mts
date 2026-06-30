import { Agent } from "undici";
import type { LookupFunction } from "node:net";
import type { ResolvedSafeAddress } from "../core/index.mjs";

export type NonEmptyResolvedSafeAddresses = [ResolvedSafeAddress, ...ResolvedSafeAddress[]];

export interface PinnedDispatcherOptions {
  connections?: number;
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
  const agentOptions =
    options?.connections === undefined ? {} : { connections: options.connections };
  return new Agent({
    ...agentOptions,
    connect: {
      lookup: createPinnedLookup(resolvedAddresses),
    },
  });
}

export function createPinnedDispatcherCache(
  options?: PinnedDispatcherCacheOptions,
): PinnedDispatcherCache {
  const { maxSize = 100, connections } = options ?? {};
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError("maxSize must be a positive integer");
  }

  const cache = new Map<string, Agent>();

  return {
    get size() {
      return cache.size;
    },

    get(resolvedAddresses) {
      const addresses = toNonEmptyAddresses(resolvedAddresses);
      const canonicalAddresses = sortPinnedDispatcherAddresses(addresses);
      const cacheKey = getPinnedDispatcherCacheKey(canonicalAddresses);
      const cachedDispatcher = cache.get(cacheKey);
      if (cachedDispatcher) {
        cache.delete(cacheKey);
        cache.set(cacheKey, cachedDispatcher);
        return cachedDispatcher;
      }

      const dispatcher =
        connections === undefined
          ? createPinnedDispatcher(canonicalAddresses)
          : createPinnedDispatcher(canonicalAddresses, { connections });
      evictPinnedDispatcherIfNeeded(cache, maxSize);
      cache.set(cacheKey, dispatcher);
      return dispatcher;
    },

    async close() {
      const dispatchers = Array.from(new Set(cache.values()));
      cache.clear();
      await Promise.all(
        dispatchers.map((dispatcher) =>
          dispatcher.close().catch(() => {
            // Closing is best-effort so shutdown/eviction is idempotent.
          }),
        ),
      );
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

function evictPinnedDispatcherIfNeeded(cache: Map<string, Agent>, maxSize: number): void {
  while (cache.size >= maxSize) {
    const oldestCacheKey = cache.keys().next().value!;
    const oldestDispatcher = cache.get(oldestCacheKey);
    cache.delete(oldestCacheKey);
    oldestDispatcher?.close().catch(() => {
      // Eviction should not fail because a dispatcher is already closed or unhealthy.
    });
  }
}
