## 2024-05-25 - Credential Leakage on Cross-Origin Redirects

**Vulnerability:** The `safeFetch` wrapper forwarded sensitive HTTP request headers (like `Authorization` and `Cookie`) across cross-origin HTTP redirects. If an application makes a request to a trusted server with authentication headers, and that server is compromised or deliberately redirects the request to a malicious third-party server, the third-party server would receive the credentials.
**Learning:** This existed because `safeFetch` correctly implemented `redirect: "manual"` to pin DNS lookups to prevent SSRF DNS-rebinding, but re-sent the identical `fetchInit` configuration payload on every redirect hop within its internal loop.
**Prevention:** Always implement a cross-origin check (`currentUrl.origin !== nextUrl.origin`) and strip sensitive headers from the `fetchInit` configuration object before passing it to the HTTP client for the next hop. Also remember to avoid mutating a shared `RequestInit` options object across loop iterations.

## 2026-05-24 - [CRITICAL] Expanded Private IP Validation to Catch Cloud Metadata & SSRF Vectors

**Vulnerability:** The `isPrivateIp` logic missed several critical internal networks, such as `0.0.0.0/8`, the `100.64.0.0/10` CGNAT range (used by Alibaba Cloud for instance metadata, and Tailscale), and `240.0.0.0/4` Reserved ranges, among others.
**Learning:** Hardcoded, specific regexes for traditional private networks (10.x/172.16.x/192.168.x) were inadequate for defense-in-depth against cloud-specific and test-net SSRF attacks.
**Prevention:** Extend validation definitions with known non-routable, multicast, CGNAT, and broadcast IP ranges as part of `isPrivateIp`. Ensure unit tests actively assert unroutable metadata IPs block properly.

## 2025-02-28 - HTTP Request Redirect Method & Body Leakage

**Vulnerability:** The custom `safeFetch` implementation followed redirects manually but failed to enforce standard fetch redirect handling rules (changing POST to GET and dropping the request body for 301, 302, and 303 redirects).
**Learning:** When building an HTTP client or wrapper that manually handles redirects, you cannot rely entirely on the underlying library if you use `redirect: "manual"`. The wrapper assumes responsibility for HTTP spec compliance, including preventing sensitive body leakage during redirect method changes without user consent.
**Prevention:** Explicitly inspect HTTP redirect response codes against the active request method. Strip the body and body-related headers (Content-Type, Content-Length, etc.) and convert the method to GET when redirecting a POST on a 301/302, or any non-GET/HEAD method on a 303.

## 2026-05-30 - [Credential Leakage in Error Messages]

**Vulnerability:** URL credentials (username/password) were being leaked in error messages and error properties when validation failed (e.g., `UnsafeUrlError` and `UnsafeResolvedAddressError`).
**Learning:** Error classes often store raw input for debugging, which can inadvertently expose sensitive data if the input contains credentials.
**Prevention:** Sanitize raw inputs (like URLs) before storing them in error properties or including them in error messages.

## 2023-10-27 - [CRITICAL] Fix IPv6 Uncompressed Representation SSRF Bypass
**Vulnerability:** The `isPrivateIp` function in `src/core/is-private-ip.mts` failed to catch uncompressed, partially compressed, and IPv4-mapped bypass representations of IPv6 loopback (`::1`) and unspecified (`::`) addresses (e.g., `0:0:0:0:0:0:0:1` or `0:0:0:0:0:ffff:127.0.0.1`).
**Learning:** The existing regexes (`/^\[?::1\]?$/` and `/^\[?::\]?$/`) were too strict and assumed IPv6 addresses would always be fully compressed, which is not guaranteed when parsing user input or DNS responses.
**Prevention:** Always account for all valid representations of IPv6 addresses (uncompressed, partially compressed, leading zeros) when writing validation regexes, or use a robust IPv6 parsing library instead of simple string matching.
