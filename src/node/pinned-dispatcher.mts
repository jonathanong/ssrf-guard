import { Agent } from "undici";
import type { LookupFunction } from "node:net";
import type { ResolvedSafeAddress } from "../core/index.mts";

export function createPinnedLookup(
  resolvedAddresses: [ResolvedSafeAddress, ...ResolvedSafeAddress[]],
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
  resolvedAddresses: [ResolvedSafeAddress, ...ResolvedSafeAddress[]],
): Agent {
  return new Agent({
    connect: {
      lookup: createPinnedLookup(resolvedAddresses),
    },
  });
}
