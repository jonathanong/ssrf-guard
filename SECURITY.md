# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue or pull request.

Use GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/jonathanong/ssrf-guard/security/advisories/new) and choose
**Report a vulnerability**.

Include the affected version, a description of the issue, and a minimal reproduction. A classifier
check such as `isPrivateIp("<address>")` is enough when the issue is a missed address range.

## Scope

In scope:

- An address, hostname, or URL spelling that `isPrivateIp`, `isPublicHostname`, `validateUrl`, or
  `safeFetch` treats as public when it reaches a private, loopback, link-local, or other
  special-use destination.
- A way to make `safeFetch` connect to an address other than the ones it validated.
- Credentials or sensitive headers sent to an origin they were not intended for.

Denylist-completeness gaps with no working exploit are still welcome; say so in the report.

## Supported versions

Only the latest published version receives security fixes.
