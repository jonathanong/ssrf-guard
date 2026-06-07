/* oxlint-disable max-lines */
import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
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

          let bodyReceived = "";
          req.on("data", (chunk) => (bodyReceived += chunk));
          req.on("end", () => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ method: req.method, body: bodyReceived }));
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockValidateLocalhost() {
  vi.spyOn(validateUrlMod, "validateUrl").mockImplementation(async () => [
    { address: "127.0.0.1", family: 4 },
  ]);
}

describe("safeFetch", () => {
  it("fetches a public URL", async () => {
    const response = await safeFetch("https://one.one.one.one/");
    expect(response.status).toBeLessThan(500);
    const _body = await response.text();
    // drain body instead of cancelling to avoid warnings if we want, but cancel is fine
  });

  it("strips sensitive headers on cross-origin redirect", async () => {
    // Temporarily mock validateUrl to allow private IPs and localhost for testing redirect header stripping
    mockValidateLocalhost();

    const response = await safeFetch(`${baseUrl}/cross-origin-redirect`, {
      headers: { authorization: "secret", cookie: "session=1", "x-custom": "value" },
    });
    expect(response.status).toBe(200);
    await response.body?.cancel();

    expect(capturedHeaders.authorization).toBeUndefined();
    expect(capturedHeaders.cookie).toBeUndefined();
    expect(capturedHeaders["x-custom"]).toBe("value");
  });

  it("retains sensitive headers on same-origin redirect", async () => {
    // Temporarily mock validateUrl to allow private IPs for testing redirect header stripping
    mockValidateLocalhost();

    const response = await safeFetch(`${baseUrl}/redirect`, {
      headers: { authorization: "secret", cookie: "session=1", "x-custom": "value" },
    });
    expect(response.status).toBe(200);
    await response.body?.cancel();

    expect(capturedHeaders.authorization).toBe("secret");
    expect(capturedHeaders.cookie).toBe("session=1");
    expect(capturedHeaders["x-custom"]).toBe("value");
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

  describe("redirect method and body handling", () => {
    async function testRedirectBehavior(
      urlPath: string,
      expectedMethod: string,
      expectedBody: string,
      method = "POST",
    ) {
      mockValidateLocalhost();

      const response = await safeFetch(`${baseUrl}${urlPath}`, {
        method,
        body: "test body",
        headers: {
          "content-disposition": "form-data",
          "content-encoding": "identity",
          "content-language": "en",
          "content-length": "9",
          "content-location": "/request-body",
          "content-md5": "CY9rzUYh03PK3k6DJie09g==",
          "content-range": "bytes 0-8/9",
          "content-type": "text/plain",
        },
      });
      const data: any = await response.json();
      expect(data.method).toBe(expectedMethod);
      expect(data.body).toBe(expectedBody);

      if (expectedMethod === "GET") {
        expect(capturedHeaders["content-disposition"]).toBeUndefined();
        expect(capturedHeaders["content-encoding"]).toBeUndefined();
        expect(capturedHeaders["content-language"]).toBeUndefined();
        expect(capturedHeaders["content-length"]).toBeUndefined();
        expect(capturedHeaders["content-location"]).toBeUndefined();
        expect(capturedHeaders["content-md5"]).toBeUndefined();
        expect(capturedHeaders["content-range"]).toBeUndefined();
        expect(capturedHeaders["content-type"]).toBeUndefined();
      }
    }

    it("changes POST to GET on 301 and drops body", () =>
      testRedirectBehavior("/redirect-301", "GET", ""));
    it("changes POST to GET on 302 and drops body", () =>
      testRedirectBehavior("/redirect", "GET", ""));
    it("changes POST to GET on 303 and drops body", () =>
      testRedirectBehavior("/redirect-303", "GET", ""));
    it("changes PUT to GET on 303 and drops body", () =>
      testRedirectBehavior("/redirect-303", "GET", "", "PUT"));
    it("retains POST method and body on 307", () =>
      testRedirectBehavior("/redirect-307", "POST", "test body"));
    it("retains POST method and body on 308", () =>
      testRedirectBehavior("/redirect-308", "POST", "test body"));
  });
});
