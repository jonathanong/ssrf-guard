## 2025-02-18 - [Over-blocking False Positives in Private IP Regex Checks]
**Vulnerability:** [Hostnames like "10.evil.com" were incorrectly identified as private IP addresses, causing a potential denial of service or over-blocking of public hostnames.]
**Learning:** [The logic in `isPrivateIp` fell back to raw string regex matching if `normalizeIpv4Address` failed to parse the input. This caused valid hostnames starting with blocked prefixes (like "10.") to be incorrectly blocked.]
**Prevention:** [If an IP parsing function returns undefined for an invalid format, it should return false rather than falling back to string checks meant for canonical IPs.]
