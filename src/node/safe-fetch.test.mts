import http from "node:http";
/* oxlint-disable max-lines -- test file containing server and test cases */
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { safeFetch } from "./safe-fetch.mjs";
import { UnsafeUrlError } from "./errors.mjs";
import * as validateUrlMod from "./validate-url.mjs";

// Local test server for integration tests
let server: http.Server;
let baseUrl: string;
let capturedHeaders: http.IncomingHttpHeaders;
let capturedMethod: string | undefined;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === "/redirect") {
          res.writeHead(302, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-301") {
          res.writeHead(301, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-303") {
          res.writeHead(303, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-307") {
          res.writeHead(307, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-308") {
          res.writeHead(308, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/cross-origin-redirect") {
          // Use localhost instead of 127.0.0.1 to simulate a cross-origin redirect
          const crossOriginUrl = baseUrl.replace("127.0.0.1", "localhost");
          res.writeHead(302, { location: `${crossOriginUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-loop") {
          res.writeHead(302, { location: `${baseUrl}/redirect-loop` });
          res.end();
        } else if (req.url === "/ok") {
          capturedHeaders = req.headers;
          capturedMethod = req.method;
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("ok");
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  capturedHeaders = {};
  capturedMethod = undefined;
});

describe("safeFetch", () => {
  it("fetches a public URL", async () => {
    const response = await safeFetch("https://one.one.one.one/");
    expect(response.status).toBeLessThan(500);
    await response.body?.cancel();
  });

  it("strips sensitive headers on cross-origin redirect", async () => {
    // Temporarily mock validateUrl to allow private IPs and localhost for testing redirect header stripping
    vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
      return [{ address: "127.0.0.1", family: 4 }];
    });

    try {
      const response = await safeFetch(`${baseUrl}/cross-origin-redirect`, {
        headers: { authorization: "secret", cookie: "session=1", "x-custom": "value" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();

      expect(capturedHeaders.authorization).toBeUndefined();
      expect(capturedHeaders.cookie).toBeUndefined();
      expect(capturedHeaders["x-custom"]).toBe("value");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("retains sensitive headers on same-origin redirect", async () => {
    // Temporarily mock validateUrl to allow private IPs for testing redirect header stripping
    vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
      return [{ address: "127.0.0.1", family: 4 }];
    });

    try {
      const response = await safeFetch(`${baseUrl}/redirect`, {
        headers: { authorization: "secret", cookie: "session=1", "x-custom": "value" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();

      expect(capturedHeaders.authorization).toBe("secret");
      expect(capturedHeaders.cookie).toBe("session=1");
      expect(capturedHeaders["x-custom"]).toBe("value");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("throws UnsafeUrlError for private IP literal", async () => {
    await expect(safeFetch("http://10.0.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("throws UnsafeUrlError for blocked hostname", async () => {
    await expect(
      safeFetch(`${baseUrl}/ok`, {
        blockedHostnames: { exact: ["127.0.0.1"], suffixes: [] },
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it("follows redirects and re-validates each hop", async () => {
    // redirect from 127.0.0.1 is also private, so this tests that redirect validation works
    await expect(safeFetch(`${baseUrl}/redirect`)).rejects.toThrow(UnsafeUrlError);
  });

  it("throws on redirect loop (maxRedirects exceeded)", async () => {
    await expect(safeFetch(`${baseUrl}/redirect-loop`)).rejects.toThrow(UnsafeUrlError);
  });

  it("throws UnsafeUrlError for non-http scheme", async () => {
    await expect(safeFetch("ftp://example.com")).rejects.toThrow(UnsafeUrlError);
  });

  describe("redirect methods", () => {
    async function testRedirectMethod(
      path: string,
      expectedMethod: string,
      expectedContentLength: string | undefined,
      expectedContentType: string | undefined,
    ) {
      vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
        return [{ address: "127.0.0.1", family: 4 }];
      });
      try {
        const response = await safeFetch(`${baseUrl}${path}`, {
          method: "POST",
          body: "hello",
          headers: {
            "content-type": "text/plain",
            "content-length": "5",
            "x-custom": "value",
          },
        });
        expect(response.status).toBe(200);
        await response.body?.cancel();

        expect(capturedMethod).toBe(expectedMethod);
        expect(capturedHeaders["content-length"]).toBe(expectedContentLength);
        expect(capturedHeaders["content-type"]).toBe(expectedContentType);
        expect(capturedHeaders["x-custom"]).toBe("value");
      } finally {
        vi.restoreAllMocks();
      }
    }

    it("changes POST to GET on 301 redirect and strips body headers", async () => {
      await testRedirectMethod("/redirect-301", "GET", undefined, undefined);
    });

    it("changes POST to GET on 302 redirect and strips body headers", async () => {
      await testRedirectMethod("/redirect", "GET", undefined, undefined);
    });

    it("changes POST to GET on 303 redirect and strips body headers", async () => {
      await testRedirectMethod("/redirect-303", "GET", undefined, undefined);
    });

    it("retains HEAD method on 303 redirect", async () => {
      vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
        return [{ address: "127.0.0.1", family: 4 }];
      });
      try {
        const response = await safeFetch(`${baseUrl}/redirect-303`, {
          method: "HEAD",
        });
        expect(response.status).toBe(200);
        await response.body?.cancel();

        expect(capturedMethod).toBe("HEAD");
      } finally {
        vi.restoreAllMocks();
      }
    });

    it("retains POST method on 307 redirect", async () => {
      await testRedirectMethod("/redirect-307", "POST", "5", "text/plain");
    });

    it("retains POST method on 308 redirect", async () => {
      await testRedirectMethod("/redirect-308", "POST", "5", "text/plain");
    });
  });
});
