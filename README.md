# ssrf-guard

SSRF protection for Node.js and Cloudflare Workers.

The key differentiator: **`validateUrl` returns the resolved IP addresses so you can pin them directly to the socket — eliminating the TOCTOU/DNS-rebind window that exists between a validation step and the actual fetch.** `safeFetch` does this automatically.

Unlike [`request-filtering-agent`](https://github.com/nicolo-ribaudo/request-filtering-agent), `ssrf-guard` exposes the resolved addresses to the caller, letting you reuse them across retries or pass them to your own HTTP client.

## Installation

```
pnpm add ssrf-guard
```

Requires Node.js ≥ 24. The `ssrf-guard` entry point (`isPrivateIp`, `validateResolvedAddresses`, etc.) is pure and also runs in Cloudflare Workers. The `ssrf-guard/node` entry point requires Node.js and uses `node:dns`, `node:net`, and `undici`.

## Quick start

### Check whether an IP is private (core, works everywhere)

```ts
import { isPrivateIp, isPublicHostname } from "ssrf-guard";

isPrivateIp("127.0.0.1"); // true
isPrivateIp("10.0.0.1"); // true
isPrivateIp("::ffff:10.0.0.1"); // true  (IPv4-mapped IPv6)
isPrivateIp("0x7f000001"); // true  (hex form of 127.0.0.1)
isPrivateIp("8.8.8.8"); // false

isPublicHostname("example.com"); // true
isPublicHostname("localhost"); // false
isPublicHostname("foo.localhost"); // false
isPublicHostname("10.0.0.1"); // false
```

### Validate a URL and get pinned addresses (Node.js)

```ts
import { validateUrl } from "ssrf-guard/node";

const addresses = await validateUrl("https://example.com/", {
  blockedHostnames: {
    exact: ["metadata.google.internal"],
    suffixes: [".local", ".internal"],
  },
});
// addresses: [{ address: '93.184.216.34', family: 4 }]

// Now use those addresses to build a pinned dispatcher — DNS won't be
// queried again so rebinding between check and fetch is impossible.
```

### Safe fetch with automatic pinning (Node.js)

```ts
import { safeFetch } from "ssrf-guard/node";

const response = await safeFetch("https://example.com/image.png", {
  blockedHostnames: {
    exact: ["metadata.google.internal"],
    suffixes: [".internal"],
  },
  headers: { "user-agent": "my-crawler/1.0" },
});
```

`safeFetch` resolves DNS once, validates the result, pins the addresses to the socket via an `undici` `Agent`, and follows redirects — re-validating each hop.
Both APIs always block `localhost`, localhost subdomains, and `.local` hostnames; a supplied
`blockedHostnames` policy adds to that baseline rather than replacing it.

## API reference

### `ssrf-guard` (core — pure, no Node built-ins)

#### `isPrivateIp(ip: string): boolean`

Returns `true` if `ip` is a private, loopback, link-local, unspecified, multicast, reserved, or other special-use address. Handles all RFC-legal IPv4 forms (dotted decimal, octal components, hex components, integer), IPv6, IPv4-mapped IPv6 (`::ffff:`), and special-use IPv6 ranges such as ULA, link-local, documentation, discard, NAT64, 6to4, and Teredo.

#### `normalizeUrlHostname(hostname: string): string`

Lowercases, strips trailing dots, and unwraps brackets from IPv6 hostnames as extracted from a `URL` object.

#### `isBlockedHostname(hostname: string, policy: BlockedHostnamePolicy): boolean`

Returns `true` if `hostname` matches an exact entry or a suffix in `policy`.

#### `mergeBlockedHostnamePolicies(...policies: BlockedHostnamePolicy[]): BlockedHostnamePolicy`

Returns the union of exact and suffix hostname entries from the supplied policies.

#### `isPublicHostname(hostname: string, options?: PublicHostnameOptions): boolean`

Returns `true` for DNS-free public host checks. It normalizes case/trailing dots/IPv6 brackets, rejects private or special-use IP literals, applies a blocked-hostname policy, and rejects single-label hostnames unless `allowSingleLabel: true` is set.

By default it uses `LOCALHOST_BLOCKED_HOSTNAME_POLICY`, which blocks `localhost`, `*.localhost`, and `*.local`.

```ts
interface PublicHostnameOptions {
  blockedHostnames?: BlockedHostnamePolicy;
  allowSingleLabel?: boolean;
}
```

#### `validateResolvedAddresses<T>(rawUrl, hostname, addresses): T[]`

Filters out null-route addresses (`0.0.0.0`, `::`), throws `UnsafeResolvedAddressError` for private IPs, and throws with `code: DNS_NULL_ROUTE_CODE` when no usable addresses remain.

#### `UnsafeResolvedAddressError`

Thrown by `validateResolvedAddresses`. Properties: `rawUrl: string`, `address: string`.

#### `DNS_NULL_ROUTE_CODE`

String constant `'DNS_NULL_ROUTE'` — the `code` property on the error thrown when DNS resolves only to null-route addresses.

#### `BlockedHostnamePolicy`

```ts
interface BlockedHostnamePolicy {
  exact: readonly string[];
  suffixes: readonly string[];
}
```

#### `ResolvedSafeAddress`

```ts
interface ResolvedSafeAddress {
  address: string;
  family: 4 | 6;
}
```

---

### `ssrf-guard/node` (Node.js ≥ 24 only)

#### `validateUrl(rawUrl: string, options?: ValidateUrlOptions): Promise<ResolvedSafeAddress[]>`

Validates a URL and returns the resolved addresses:

1. Parses the URL — throws `UnsafeUrlError` for invalid URLs.
2. Rejects protocols outside `allowedProtocols` (both `http:` and `https:` by default).
3. Checks against the localhost baseline plus the optional `blockedHostnames` policy.
4. Rejects literal private IP addresses without DNS lookup.
5. Resolves DNS and validates all returned addresses.

```ts
interface ValidateUrlOptions {
  blockedHostnames?: BlockedHostnamePolicy;
  allowedProtocols?: readonly ("http:" | "https:")[];
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

`AllowedProtocol` is the exported union type `"http:" | "https:"` used by both option objects.

#### `safeFetch(initialUrl: string | URL, options?: SafeFetchOptions): Promise<Response>`

Fetches a URL safely:

- Validates and pins DNS addresses before each hop.
- Follows redirects up to `maxRedirects` (default: 10), re-validating each.
- Passes remaining `RequestInit` options through to `undici`.

```ts
interface SafeFetchOptions extends Omit<RequestInit, "signal"> {
  blockedHostnames?: BlockedHostnamePolicy;
  allowedProtocols?: readonly ("http:" | "https:")[];
  maxRedirects?: number;
  signal?: AbortSignal;
}
```

#### `createPinnedDispatcher(resolvedAddresses: NonEmptyResolvedSafeAddresses, options?: PinnedDispatcherOptions): Agent`

Creates an `undici` `Agent` whose `lookup` callback is hardwired to the provided addresses, preventing any further DNS resolution.

`PinnedDispatcherOptions` accepts `connections`, `headersTimeout`, `bodyTimeout`,
`keepAliveTimeout`, `keepAliveMaxTimeout`, and `connect: { timeout?: number }`, which are passed to
Undici while the dispatcher keeps its pinned DNS lookup. `PinnedDispatcherCacheOptions` adds
`maxSize`.

#### `createPinnedDispatcherCache(options?): PinnedDispatcherCache`

Creates a small LRU cache for pinned `undici` dispatchers. This is useful for crawlers that validate DNS once per request but want to reuse sockets for repeated requests to the same validated address set.

```ts
const cache = createPinnedDispatcherCache({
  maxSize: 100,
  connections: 5,
  headersTimeout: 10_000,
  bodyTimeout: 30_000,
  keepAliveTimeout: 5_000,
  keepAliveMaxTimeout: 60_000,
  connect: { timeout: 5_000 },
});
const dispatcher = cache.get(resolvedAddresses);
await cache.close();
```

After `close()` begins, the cache is terminal: `get()` throws and repeated `close()` calls share the
same best-effort shutdown.

#### `UnsafeUrlError`

Thrown by `validateUrl` and `safeFetch`. Properties: `rawUrl: string`, `reason: string`.

## License

MIT
