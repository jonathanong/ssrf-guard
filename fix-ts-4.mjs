// The local typecheck passes because I already casted `as HeadersInit` and `as BodyInit`.
// Let's verify what types it is actually looking for:
// `import("/home/runner/work/ssrf-guard/ssrf-guard/node_modules/.pnpm/undici@8.3.0/node_modules/undici/types/fetch").HeadersInit`
// This means the `undiciFetch` mock has `fetch(input: RequestInfo, init?: RequestInit)` where `RequestInit` comes from `undici/types/fetch`.
// And my `as HeadersInit` uses Node's global `HeadersInit` (which might be from `@types/node` dom fetch).

// We can just use `as never` or `as any` everywhere for the tests.
