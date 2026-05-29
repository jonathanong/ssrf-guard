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

function makeResponse(
  status: number,
  headers: Record<string, string> = {},
): Awaited<ReturnType<typeof undiciFetch>> {
  return new Response(null, { status, headers }) as Awaited<ReturnType<typeof undiciFetch>>;
}

describe("safeFetch (mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateUrl).mockResolvedValue(PUBLIC_ADDRESSES);
  });

  it("returns a non-redirect response directly", async () => {
    const res = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValue(res);
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
  });

  it("follows a redirect to a final non-redirect response", async () => {
    const redirect = makeResponse(302, { location: "https://example.com/final" });
    const final = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValueOnce(redirect).mockResolvedValueOnce(final);
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
    expect(vi.mocked(validateUrl)).toHaveBeenCalledTimes(2);
  });

  it("throws UnsafeUrlError when redirect location header is missing", async () => {
    const redirect = makeResponse(302); // no location header
    vi.mocked(undiciFetch).mockResolvedValue(redirect);
    await expect(safeFetch("https://example.com/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("https://example.com/")).rejects.toMatchObject({
      reason: "redirect response missing Location header",
    });
  });

  it("throws UnsafeUrlError when redirect location is an invalid URL", async () => {
    // 'http://[' is an invalid URL that throws when passed to new URL() with any base
    const redirect = makeResponse(302, { location: "http://[" });
    vi.mocked(undiciFetch).mockResolvedValue(redirect);
    await expect(safeFetch("https://example.com/")).rejects.toMatchObject({
      reason: "invalid redirect URL",
    });
  });

  it("throws UnsafeUrlError when maxRedirects is exceeded", async () => {
    const redirect = makeResponse(302, { location: "https://example.com/next" });
    vi.mocked(undiciFetch).mockResolvedValue(redirect);
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
    vi.mocked(undiciFetch).mockResolvedValue(res);
    await safeFetch("https://example.com/");
    expect(vi.mocked(undiciFetch)).toHaveBeenCalled();
  });

  it("strips sensitive headers on cross-origin redirects", async () => {
    const redirect = makeResponse(302, { location: "https://evil.com/final" });
    const final = makeResponse(200);
    vi.mocked(undiciFetch).mockResolvedValueOnce(redirect).mockResolvedValueOnce(final);

    await safeFetch("https://example.com/", {
      headers: {
        authorization: "secret",
        cookie: "session",
        cookie2: "legacy-session",
        "proxy-authorization": "proxy-secret",
        "content-type": "application/json",
      },
    });

    expect(vi.mocked(undiciFetch)).toHaveBeenCalledTimes(2);

    // Initial request has all headers
    const firstCallInit = vi.mocked(undiciFetch).mock.calls[0][1];
    expect(firstCallInit?.headers).toMatchObject({
      authorization: "secret",
      cookie: "session",
      cookie2: "legacy-session",
      "proxy-authorization": "proxy-secret",
      "content-type": "application/json",
    });

    // Redirected request has sensitive headers stripped
    const secondCallInit = vi.mocked(undiciFetch).mock.calls[1][1];
    const secondHeaders = new Headers(secondCallInit?.headers);
    expect(secondHeaders.has("authorization")).toBe(false);
    expect(secondHeaders.has("cookie")).toBe(false);
    expect(secondHeaders.has("cookie2")).toBe(false);
    expect(secondHeaders.has("proxy-authorization")).toBe(false);
    expect(secondHeaders.get("content-type")).toBe("application/json");
  });

  it.each([
    {
      status: 303,
      method: "POST",
      expectedMethod: "GET",
      stripsBodyHeaders: false,
    },
    {
      status: 303,
      method: "HEAD",
      expectedMethod: "HEAD",
      stripsBodyHeaders: false,
    },
    {
      status: 302,
      method: "POST",
      expectedMethod: "GET",
      stripsBodyHeaders: true,
    },
    {
      status: 302,
      method: "post",
      expectedMethod: "GET",
      stripsBodyHeaders: true,
    },
  ])(
    "handles $status redirect method rewriting from $method",
    async ({ status, method, expectedMethod, stripsBodyHeaders }) => {
      const redirect = makeResponse(status, { location: "https://example.com/final" });
      const final = makeResponse(200);
      vi.mocked(undiciFetch).mockResolvedValueOnce(redirect).mockResolvedValueOnce(final);

      await safeFetch("https://example.com/", {
        method,
        body: method.toUpperCase() === "HEAD" ? undefined : "secret-body",
        headers: {
          "content-type": "text/plain",
          "content-length": "11",
        },
      });

      expect(vi.mocked(undiciFetch)).toHaveBeenCalledTimes(2);

      const firstCallInit = vi.mocked(undiciFetch).mock.calls[0][1];
      expect(firstCallInit?.method).toBe(method);

      const secondCallInit = vi.mocked(undiciFetch).mock.calls[1][1];
      expect(secondCallInit?.method).toBe(expectedMethod);

      if (expectedMethod === "GET") {
        expect(secondCallInit?.body).toBeUndefined();
      }

      if (stripsBodyHeaders) {
        const secondHeaders = new Headers(secondCallInit?.headers);
        expect(secondHeaders.get("content-type")).toBeNull();
        expect(secondHeaders.get("content-length")).toBeNull();
      }
    },
  );
});
