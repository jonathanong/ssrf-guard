// TypeScript is complaining about `HeadersInit` imported from undici vs standard HeadersInit.
// Lines:
// 26: `function makeResponse(status: number, headers: Record<string, string> = {}): Response {`
// 121: `const secondHeaders = new Headers(secondCallInit?.headers as HeadersInit);`
// 160: `body: "secret-body"` and `headers: { "content-type": "application/json" }` missing in the other tests.

// Oh, the error output says:
// src/node/safe-fetch.mock.test.mts(26,10): error TS2352: Conversion of type 'Response' to type 'import("...undici/types/fetch").Response' may be a mistake...
// src/node/safe-fetch.mock.test.mts(121,39): error TS2345: Argument of type 'import("...undici/types/fetch").HeadersInit | undefined' is not assignable to parameter of type 'HeadersInit | undefined'.
// src/node/safe-fetch.mock.test.mts(160,47) ... (wait, line 160 is gone now, it was line 160 previously before I deduplicated tests, let me check the deduplicated version errors)
