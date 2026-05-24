## 2024-05-25 - Credential Leakage on Cross-Origin Redirects

**Vulnerability:** The `safeFetch` wrapper forwarded sensitive HTTP request headers (like `Authorization` and `Cookie`) across cross-origin HTTP redirects. If an application makes a request to a trusted server with authentication headers, and that server is compromised or deliberately redirects the request to a malicious third-party server, the third-party server would receive the credentials.
**Learning:** This existed because `safeFetch` correctly implemented `redirect: "manual"` to pin DNS lookups to prevent SSRF DNS-rebinding, but re-sent the identical `fetchInit` configuration payload on every redirect hop within its internal loop.
**Prevention:** Always implement a cross-origin check (`currentUrl.origin !== nextUrl.origin`) and strip sensitive headers from the `fetchInit` configuration object before passing it to the HTTP client for the next hop. Also remember to avoid mutating a shared `RequestInit` options object across loop iterations.

## 2026-05-24 - [CRITICAL] Expanded Private IP Validation to Catch Cloud Metadata & SSRF Vectors
**Vulnerability:** The `isPrivateIp` logic missed several critical internal networks, such as `0.0.0.0/8`, the `100.64.0.0/10` CGNAT range (used by Alibaba Cloud for instance metadata, and Tailscale), and `240.0.0.0/4` Reserved ranges, among others.
**Learning:** Hardcoded, specific regexes for traditional private networks (10.x/172.16.x/192.168.x) were inadequate for defense-in-depth against cloud-specific and test-net SSRF attacks.
**Prevention:** Extend validation definitions with known non-routable, multicast, CGNAT, and broadcast IP ranges as part of `isPrivateIp`. Ensure unit tests actively assert unroutable metadata IPs block properly.
