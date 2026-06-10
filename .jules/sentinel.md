## 2026-06-09 - [CRITICAL] Fix IPv6 Uncompressed Representation SSRF Bypass

**Vulnerability:** The `isPrivateIp` function in `src/core/is-private-ip.mts` failed to catch uncompressed, partially compressed, and IPv4-mapped bypass representations of IPv6 loopback (`::1`) and unspecified (`::`) addresses (e.g., `0:0:0:0:0:0:0:1` or `0:0:0:0:0:ffff:127.0.0.1`).
**Learning:** The existing regexes (`/^\[?::1\]?$/` and `/^\[?::\]?$/`) were too strict and assumed IPv6 addresses would always be fully compressed, which is not guaranteed when parsing user input or DNS responses.
**Prevention:** Always account for all valid representations of IPv6 addresses (uncompressed, partially compressed, leading zeros) when writing validation regexes, or use a robust IPv6 parsing library instead of simple string matching.
