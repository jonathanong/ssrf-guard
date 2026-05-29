// The line numbers in the SonarCloud failure report:
// [WARNING] File: src/node/safe-fetch.mock.test.mts, Line: 99
// [WARNING] File: src/node/safe-fetch.mock.test.mts, Line: 137
// [WARNING] File: src/node/safe-fetch.mock.test.mts, Line: 98
// [WARNING] File: src/node/safe-fetch.mock.test.mts, Line: 123
// [WARNING] File: src/node/safe-fetch.mock.test.mts, Line: 136

// It seems SonarCloud is complaining about the duplication between lines 98-99 and lines 136-137.
// Oh, the report is from BEFORE my latest commit. The output says:
// Failed Check Run 1: SonarCloud Code Analysis ... [24.7% Duplication on New Code] ...
// And the lines 136-137 match `mockResolvedValueOnce(...)`.
// Wait, in my previous PR, the lines were duplicated. So it seems the `mockRedirect` extraction I just did in `fix-sonar2.mjs` fixes exactly that!
