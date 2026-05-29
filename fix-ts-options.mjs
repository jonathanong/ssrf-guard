// It looks like `SafeFetchOptions` has `exactOptionalPropertyTypes: true` on the CI's TypeScript version (or in tsconfig), but we're passing it an object that includes `headers` which has a type mismatch, or `body` having `string` instead of `BodyInit`.
// Looking closely:
// [FAILURE] File: src/node/safe-fetch.mock.test.mts, Line: 160 (note: this was before deduplication, now line 140)
// Argument of type '{ method: string; body: string | undefined; ... }' is not assignable to parameter of type 'SafeFetchOptions' with 'exactOptionalPropertyTypes: true'.
// So `body: "secret-body"` and `headers: { "content-type": ... }` in tests might need type casting.
