// We can extract a `mockRedirectFlow(status, location)` function inside `safe-fetch.mock.test.mts`.
// Or just inline `vi.mocked(undiciFetch).mockResolvedValueOnce(makeResponse(status, { location }) as never).mockResolvedValueOnce(makeResponse(200) as never);`
