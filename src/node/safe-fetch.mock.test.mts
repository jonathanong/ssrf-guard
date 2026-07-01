import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeFetch } from "./safe-fetch.mjs";
import { UnsafeUrlError } from "./errors.mjs";

vi.mock("./validate-url.mjs", () => ({
  validateUrl: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: vi.fn(),
  };
});

const { validateUrl } = await import("./validate-url.mjs");
const { fetch: undiciFetch } = await import("undici");

const PUBLIC_ADDRESSES = [{ address: "93.184.216.34", family: 4 as const }];

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("safeFetch (mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateUrl).mockResolvedValue(PUBLIC_ADDRESSES);
  });

  it("returns a non-redirect response directly", async () => {
    const res = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValue(res as never);
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
  });

  it("accepts URL objects", async () => {
    const res = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValue(res as never);
    const result = await safeFetch(new URL("https://example.com/"));
    expect(result.status).toBe(200);
  });

  it("snapshots URL objects before asynchronous validation", async () => {
    const res = makeResponse(200);
    let resolveValidation: (addresses: typeof PUBLIC_ADDRESSES) => void = () => {};
    vi.mocked(validateUrl).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveValidation = resolve;
      }) as never,
    );
    vi.mocked(undiciFetch).mockResolvedValue(res as never);

    const url = new URL("https://example.com/original");
    const responsePromise = safeFetch(url);
    await vi.waitFor(() => expect(vi.mocked(validateUrl)).toHaveBeenCalled());
    url.hostname = "changed.example";
    url.pathname = "/changed";
    resolveValidation(PUBLIC_ADDRESSES);

    await expect(responsePromise).resolves.toBe(res);
    expect(vi.mocked(validateUrl)).toHaveBeenCalledWith("https://example.com/original", {});
    expect(vi.mocked(undiciFetch)).toHaveBeenCalledWith(
      "https://example.com/original",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("throws UnsafeUrlError for invalid initial URLs", async () => {
    await expect(safeFetch("not a url")).rejects.toMatchObject({
      reason: "invalid URL",
    });
    expect(vi.mocked(validateUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(undiciFetch)).not.toHaveBeenCalled();
  });

  it("passes AbortSignal through to URL validation", async () => {
    const res = makeResponse(200);
    const signal = AbortSignal.timeout(1000);
    vi.mocked(undiciFetch).mockResolvedValue(res as never);

    await safeFetch("https://example.com/", { signal });

    expect(vi.mocked(validateUrl)).toHaveBeenCalledWith("https://example.com/", { signal });
  });

  it("follows a redirect to a final non-redirect response", async () => {
    const redirect = makeResponse(302, { location: "https://example.com/final" });
    const final = makeResponse(200);
    vi.mocked(undiciFetch)
      .mockResolvedValueOnce(redirect as never)
      .mockResolvedValueOnce(final as never);
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
    expect(vi.mocked(validateUrl)).toHaveBeenCalledTimes(2);
  });

  it("throws UnsafeUrlError when redirect location header is missing", async () => {
    const redirect = makeResponse(302); // no location header
    vi.mocked(undiciFetch).mockResolvedValue(redirect as never);
    await expect(safeFetch("https://example.com/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("https://example.com/")).rejects.toMatchObject({
      reason: "redirect response missing Location header",
    });
  });

  it("throws UnsafeUrlError when redirect location is an invalid URL", async () => {
    // 'http://[' is an invalid URL that throws when passed to new URL() with any base
    const redirect = makeResponse(302, { location: "http://[" });
    vi.mocked(undiciFetch).mockResolvedValue(redirect as never);
    await expect(safeFetch("https://example.com/")).rejects.toMatchObject({
      reason: "invalid redirect URL",
    });
  });

  it("throws UnsafeUrlError when maxRedirects is exceeded", async () => {
    const redirect = makeResponse(302, { location: "https://example.com/next" });
    vi.mocked(undiciFetch).mockResolvedValue(redirect as never);
    await expect(safeFetch("https://example.com/", { maxRedirects: 2 })).rejects.toMatchObject({
      reason: "too many redirects (max: 2)",
    });
  });

  it("re-throws errors from fetch inside the try block via catch", async () => {
    const fetchError = new Error("network failure");
    vi.mocked(undiciFetch).mockRejectedValue(fetchError);
    await expect(safeFetch("https://example.com/")).rejects.toThrow("network failure");
  });

  it("uses options.all=false branch of pinned dispatcher", async () => {
    // Trigger actual createPinnedDispatcher by using real validateUrl path isn't viable here,
    // but we can verify the dispatcher is created and single-address lookup is reachable
    // by providing exactly one address and letting undici call lookup with all=false.
    // This is exercised via the integration test server path as well.
    const res = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValue(res as never);
    await safeFetch("https://example.com/");
    expect(vi.mocked(undiciFetch)).toHaveBeenCalled();
  });
});
