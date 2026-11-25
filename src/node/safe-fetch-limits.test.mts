import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { safeFetch } from "./safe-fetch.mjs";
import { validateUrl } from "./validate-url.mjs";

// validateUrl rejects loopback, so it is mocked to return the local test server's address.
// Everything else (pinned dispatcher, undici fetch, the limits) is real.
vi.mock("./validate-url.mjs", () => ({
  validateUrl: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
}));

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/big") {
      res.writeHead(200);
      res.end(Buffer.alloc(2_000, 97));
    } else if (req.url === "/trickle") {
      res.writeHead(200);
      let sent = 0;
      const interval = setInterval(() => {
        res.write("x");
        sent += 1;
        if (sent === 6) {
          clearInterval(interval);
          res.end();
        }
      }, 50);
    }
    // "/hang" never responds.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("safeFetch limits", () => {
  it("fails the body once it passes maxResponseBytes", async () => {
    const response = await safeFetch(`${base}/big`, { maxResponseBytes: 1_000 });
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      cause: { code: "UND_ERR_RES_EXCEEDED_MAX_SIZE" },
    });
  });

  it("reads a body within maxResponseBytes", async () => {
    const response = await safeFetch(`${base}/big`, { maxResponseBytes: 2_000 });
    expect((await response.arrayBuffer()).byteLength).toBe(2_000);
  });

  it("rejects with a TimeoutError when no response arrives within timeoutMs", async () => {
    await expect(safeFetch(`${base}/hang`, { timeoutMs: 100 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("does not cut off a body that keeps arriving after timeoutMs", async () => {
    const response = await safeFetch(`${base}/trickle`, { timeoutMs: 200 });
    expect(await response.text()).toBe("xxxxxx");
  });

  it("passes no signal to validation when the timeout is off and the caller gave none", async () => {
    vi.mocked(validateUrl).mockClear();
    const response = await safeFetch(`${base}/big`, { timeoutMs: Infinity });
    await response.arrayBuffer();
    expect(vi.mocked(validateUrl)).toHaveBeenCalledWith(`${base}/big`, {});
  });

  it("rejects invalid limits before fetching", async () => {
    await expect(safeFetch(`${base}/big`, { timeoutMs: 0 })).rejects.toThrow(RangeError);
  });
});
