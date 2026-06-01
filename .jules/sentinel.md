## 2024-06-01 - SSRF Fetch Client Redirect Method Handling
**Vulnerability:** The internal `safeFetch` wrapper failed to modify the HTTP method (e.g., from POST to GET) and strip request bodies on 301/302/303 redirects, contrary to standard HTTP client behavior.
**Learning:** This occurs when a fetch wrapper manually handles redirects. If the method/body aren't explicitly modified, the payload (which could contain sensitive data) can be unexpectedly sent to the redirect target.
**Prevention:** Always implement standard fetch specification redirect method conversion (POST->GET for 301/302, unconditionally GET for 303 unless HEAD) and strip body-related headers/content when manually following redirects.
