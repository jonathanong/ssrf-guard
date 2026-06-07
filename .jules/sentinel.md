## 2024-06-07 - [Redirect Body/Method Leak]
**Vulnerability:** Safe fetch client leaked POST bodies and executed unintended POST requests by failing to convert POST methods to GET and strip bodies on 301, 302, and 303 redirects (as required by the fetch spec).
**Learning:** Manual redirect loops (`redirect: "manual"`) bypass native safety mechanisms. When implementing custom HTTP redirect handlers, native fetch behavior must be strictly emulated to prevent sensitive data exposure.
**Prevention:** Always verify that custom HTTP clients handle HTTP method changes and body stripping securely during redirects, adhering to standard spec rules (especially for 301, 302, and 303 status codes).
