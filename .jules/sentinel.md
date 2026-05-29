## 2024-05-16 - SafeFetch Manual Redirect Security

**Vulnerability:** SafeFetch leaked sensitive headers (Authorization, Cookie) to cross-origin domains and resent POST bodies on 303 redirects.
**Learning:** When manually implementing redirect following (using `redirect: "manual"` in undici/fetch), the fetch polyfill does not apply its standard security rules (header stripping on cross-origin, method/body mutation on 303/302). Passing the same `fetchInit` unaltered in a loop bypasses standard fetch security mechanisms.
**Prevention:** Always manually re-implement fetch specification security rules (stripping sensitive headers on cross-origin redirects, updating methods, and dropping bodies) when using manual redirection loops.
