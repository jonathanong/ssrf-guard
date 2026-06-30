## 2026-06-09 - [CRITICAL] Fix IPv6 Uncompressed Representation SSRF Bypass

**Vulnerability:** The `isPrivateIp` function in `src/core/is-private-ip.mts` failed to catch uncompressed, partially compressed, and IPv4-mapped bypass representations of IPv6 loopback (`::1`) and unspecified (`::`) addresses (e.g., `0:0:0:0:0:0:0:1` or `0:0:0:0:0:ffff:127.0.0.1`).
**Learning:** The existing regexes (`/^\[?::1\]?$/` and `/^\[?::\]?$/`) were too strict and assumed IPv6 addresses would always be fully compressed, which is not guaranteed when parsing user input or DNS responses.
**Prevention:** Always account for all valid representations of IPv6 addresses (uncompressed, partially compressed, leading zeros) when writing validation regexes, or use a robust IPv6 parsing library instead of simple string matching.

## 2025-02-23 - [CRITICAL] Prevent ReDoS in IPv6 Regexes

**Vulnerability:** The regexes used for IPv6 detection in `src/core/is-private-ip.mts` (`/^\[?(?:0*:)*0*1\]?$/i`, `/^\[?(?:0*:)+0*\]?$/i`, `/^\[?(?:0*:)*?(?:ffff|FFFF):([^\]]+)\]?$/i`) were vulnerable to Regular Expression Denial of Service (ReDoS) due to unbounded matching (`*` and `+`) of groups.
**Learning:** Using unbounded matching on repeated capture groups in user-provided input can cause excessive backtracking or call stack limit exhaustion if the string is very long or crafted to defeat the engine.
**Prevention:** Always place a realistic bound on repeated regex patterns when parsing network identifiers like IP addresses (e.g. `{0,7}` since IPv6 has a max of 8 groups) to ensure constant-time matching and eliminate the risk of ReDoS.
