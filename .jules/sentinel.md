## 2024-05-26 - Cross-Origin Redirect Credential Leak in safeFetch

**Vulnerability:** \`safeFetch\` forwarded sensitive headers (\`authorization\`, \`cookie\`, \`cookie2\`, \`proxy-authorization\`) when following cross-origin redirects.
**Learning:** Manual redirect handling in \`undici\` requires manual header sanitization on cross-origin redirects, unlike standard \`fetch\` behavior which strips them automatically.
**Prevention:** When manually implementing redirect following, always check if \`nextUrl.origin !== currentUrl.origin\` and delete sensitive headers from \`fetchInit.headers\` before the next fetch hop.
