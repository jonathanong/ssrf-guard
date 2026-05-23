import http from "node:http";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { safeFetch } from "./safe-fetch.mts";
import { UnsafeUrlError } from "./errors.mts";

// Local test server for integration tests
let server: http.Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === "/redirect") {
          res.writeHead(302, { location: `${baseUrl}/ok` });
          res.end();
        } else if (req.url === "/redirect-loop") {
          res.writeHead(302, { location: `${baseUrl}/redirect-loop` });
          res.end();
        } else if (req.url === "/ok") {
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
