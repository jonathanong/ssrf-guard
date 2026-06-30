## 2026-06-10 - Over-blocking False Positives in Private IP Regex Checks

**Vulnerability:** Hostnames like "10.evil.com" were incorrectly identified as private IP addresses, causing a potential denial of service or over-blocking of public hostnames.
**Learning:** The logic in `isPrivateIp` fell back to raw string regex matching if `normalizeIpv4Address` failed to parse the input. This caused valid hostnames starting with blocked prefixes (like "10.") to be incorrectly blocked.
**Prevention:** If an IP parsing function returns undefined for an invalid format, it should return false rather than falling back to string checks meant for canonical IPs.

## 2026-06-09 - [CRITICAL] Fix IPv6 Uncompressed Representation SSRF Bypass

**Vulnerability:** The `isPrivateIp` function in `src/core/is-private-ip.mts` failed to catch uncompressed, partially compressed, and IPv4-mapped bypass representations of IPv6 loopback (`::1`) and unspecified (`::`) addresses (e.g., `0:0:0:0:0:0:0:1` or `0:0:0:0:0:ffff:127.0.0.1`).
**Learning:** The existing regexes (`/^\[?::1\]?$/` and `/^\[?::\]?$/`) were too strict and assumed IPv6 addresses would always be fully compressed, which is not guaranteed when parsing user input or DNS responses.
**Prevention:** Always account for all valid representations of IPv6 addresses (uncompressed, partially compressed, leading zeros) when writing validation regexes, or use a robust IPv6 parsing library instead of simple string matching.
