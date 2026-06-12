## 2026-06-09 - [CRITICAL] Fix IPv6 Uncompressed Representation SSRF Bypass

**Vulnerability:** The `isPrivateIp` function in `src/core/is-private-ip.mts` failed to catch uncompressed, partially compressed, and IPv4-mapped bypass representations of IPv6 loopback (`::1`) and unspecified (`::`) addresses (e.g., `0:0:0:0:0:0:0:1` or `0:0:0:0:0:ffff:127.0.0.1`).
**Learning:** The existing regexes (`/^\[?::1\]?$/` and `/^\[?::\]?$/`) were too strict and assumed IPv6 addresses would always be fully compressed, which is not guaranteed when parsing user input or DNS responses.
**Prevention:** Always account for all valid representations of IPv6 addresses (uncompressed, partially compressed, leading zeros) when writing validation regexes, or use a robust IPv6 parsing library instead of simple string matching.
## 2026-06-12 - [HIGH] Strip Host Header on Cross-Origin Redirects
**Vulnerability:** The `safeFetch` implementation did not strip the `host` header during cross-origin redirects.
**Learning:** This could lead to Host Header Injection attacks if an internal server relies on the Host header, as an attacker could forward a malicious Host header through a redirect chain. Standard HTTP clients generally regenerate the Host header, but custom implementations need to be explicitly told to drop the original one if provided manually.
**Prevention:** Always add `host` to the list of sensitive headers to strip when performing cross-origin HTTP redirects.
