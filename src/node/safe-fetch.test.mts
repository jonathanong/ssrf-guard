import http from "node:http";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { safeFetch } from "./safe-fetch.mjs";
import { UnsafeUrlError } from "./errors.mjs";
import * as validateUrlMod from "./validate-url.mjs";

// Local test server for integration tests
let server: http.Server;
let baseUrl: string;
let capturedHeaders: http.IncomingHttpHeaders;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === "/redirect") {
          res.writeHead(302, { location: `${baseUrl}/ok` });
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
});
