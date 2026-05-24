## 2026-05-24 - [CRITICAL] Expanded Private IP Validation to Catch Cloud Metadata & SSRF Vectors
**Vulnerability:** The `isPrivateIp` logic missed several critical internal networks, such as `0.0.0.0/8`, the `100.64.0.0/10` CGNAT range (used by Alibaba Cloud for instance metadata, and Tailscale), and `240.0.0.0/4` Reserved ranges, among others.
**Learning:** Hardcoded, specific regexes for traditional private networks (10.x/172.16.x/192.168.x) were inadequate for defense-in-depth against cloud-specific and test-net SSRF attacks.
**Prevention:** Extend validation definitions with known non-routable, multicast, CGNAT, and broadcast IP ranges as part of `isPrivateIp`. Ensure unit tests actively assert unroutable metadata IPs block properly.
