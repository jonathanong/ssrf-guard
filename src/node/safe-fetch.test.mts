/* eslint-disable max-lines */
import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { safeFetch } from "./safe-fetch.mjs";
import { UnsafeUrlError } from "./errors.mjs";
import * as validateUrlMod from "./validate-url.mjs";

// Local test server for integration tests
let server: http.Server;
let baseUrl: string;
let capturedHeaders: http.IncomingHttpHeaders;
let capturedMethod: string | undefined;
let capturedBody: string;

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
        } else if (req.url === "/redirect-301") {
          res.writeHead(301, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-303") {
          res.writeHead(303, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/ok") {
          capturedHeaders = req.headers;
          capturedMethod = req.method;
          let body = "";
          req.on("data", (chunk) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            capturedBody = body;
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("ok");
          });
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
  capturedBody = "";
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

  it("changes POST method to GET and removes body/headers on 301, 302, and 303 redirects", async () => {
    vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
      return [{ address: "127.0.0.1", family: 4 }];
    });

    try {
      // 301 Redirect
      let response = await safeFetch(`${baseUrl}/redirect-301`, {
        method: "POST",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("GET");
      expect(capturedBody).toBe("");
      expect(capturedHeaders["content-type"]).toBeUndefined();
      expect(capturedHeaders["content-length"]).toBeUndefined();

      capturedMethod = undefined;
      capturedBody = "";
      capturedHeaders = {};

      // 302 Redirect
      response = await safeFetch(`${baseUrl}/redirect`, {
        method: "POST",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("GET");
      expect(capturedBody).toBe("");
      expect(capturedHeaders["content-type"]).toBeUndefined();
      expect(capturedHeaders["content-length"]).toBeUndefined();

      capturedMethod = undefined;
      capturedBody = "";
      capturedHeaders = {};

      // 303 Redirect
      response = await safeFetch(`${baseUrl}/redirect-303`, {
        method: "POST",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("GET");
      expect(capturedBody).toBe("");
      expect(capturedHeaders["content-type"]).toBeUndefined();
      expect(capturedHeaders["content-length"]).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not change PUT method to GET on 301/302, but does on 303", async () => {
    vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => {
      return [{ address: "127.0.0.1", family: 4 }];
    });

    try {
      // 301 Redirect with PUT
      let response = await safeFetch(`${baseUrl}/redirect-301`, {
        method: "PUT",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("PUT");
      expect(capturedBody).toBe("test payload");
      expect(capturedHeaders["content-type"]).toBe("text/plain");

      capturedMethod = undefined;
      capturedBody = "";
      capturedHeaders = {};

      // 302 Redirect with PUT
      response = await safeFetch(`${baseUrl}/redirect`, {
        method: "PUT",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("PUT");
      expect(capturedBody).toBe("test payload");
      expect(capturedHeaders["content-type"]).toBe("text/plain");

      capturedMethod = undefined;
      capturedBody = "";
      capturedHeaders = {};

      // 303 Redirect with PUT
      response = await safeFetch(`${baseUrl}/redirect-303`, {
        method: "PUT",
        body: "test payload",
        headers: { "content-type": "text/plain", "content-length": "12" },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(capturedMethod).toBe("GET");
      expect(capturedBody).toBe("");
      expect(capturedHeaders["content-type"]).toBeUndefined();
      expect(capturedHeaders["content-length"]).toBeUndefined();
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
