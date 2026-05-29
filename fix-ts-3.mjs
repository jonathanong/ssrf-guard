// The failure annotations from CI:
// File: src/node/safe-fetch.mock.test.mts, Line: 185 -> Argument of type 'HeadersInit' ...
// Wait, my file is only 153 lines long.
// So the CI ran on an OLDER version of my PR before the previous fix, or there are multiple commits that CI runs on.
// Ah, the CI output explicitly says:
// GITHUB_EVENT_PULL_REQUEST_HEAD_SHA: 8b7a1d6b1086545071d1784de9e0940ef6216cc2
// The previous run was 89dee1c227fb6b2c3e5ef2c8c4bf7eef4deeb18e.
// Wait, I just successfully ran `pnpm run typecheck` locally without any issues. The only thing different is that local is v10 and remote is v11 pnpm, but the TypeScript version is the same.
