import { describe, expect, it, vi } from "vitest";
import type { Agent as UndiciAgent } from "undici";

const agentCapture = vi.hoisted(() => ({
  options: undefined as UndiciAgent.Options | undefined,
  lastClose: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("undici", () => ({
  Agent: class {
    close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    constructor(options: UndiciAgent.Options) {
      agentCapture.options = options;
      agentCapture.lastClose = this.close;
    }
  },
}));

const { createPinnedDispatcher, createPinnedDispatcherCache } =
  await import("./pinned-dispatcher.mjs");

describe("createPinnedDispatcher (mocked Agent)", () => {
  it("passes timeout options while retaining the pinned lookup", () => {
    createPinnedDispatcher([{ address: "93.184.216.34", family: 4 }], {
      connections: 2,
      headersTimeout: 1_000,
      bodyTimeout: 2_000,
      keepAliveTimeout: 3_000,
      keepAliveMaxTimeout: 4_000,
      connect: { timeout: 5_000 },
    });

    expect(agentCapture.options).toMatchObject({
      connections: 2,
      headersTimeout: 1_000,
      bodyTimeout: 2_000,
      keepAliveTimeout: 3_000,
      keepAliveMaxTimeout: 4_000,
      connect: { timeout: 5_000, lookup: expect.any(Function) },
    });
  });

  it("forwards timeout options from the cache while retaining the pinned lookup", () => {
    createPinnedDispatcherCache({
      maxSize: 2,
      headersTimeout: 1_000,
      bodyTimeout: 2_000,
      keepAliveTimeout: 3_000,
      keepAliveMaxTimeout: 4_000,
      connect: { timeout: 5_000 },
    }).get([{ address: "93.184.216.34", family: 4 }]);

    expect(agentCapture.options).toMatchObject({
      headersTimeout: 1_000,
      bodyTimeout: 2_000,
      keepAliveTimeout: 3_000,
      keepAliveMaxTimeout: 4_000,
      connect: { timeout: 5_000, lookup: expect.any(Function) },
    });
    expect(agentCapture.options).not.toHaveProperty("maxSize");
  });

  it("waits for dispatcher closes started by eviction", async () => {
    const cache = createPinnedDispatcherCache({ maxSize: 1 });
    cache.get([{ address: "1.1.1.1", family: 4 }]);
    let resolveEvictedClose: () => void = () => {};
    vi.mocked(agentCapture.lastClose!).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEvictedClose = resolve;
        }),
    );

    cache.get([{ address: "2.2.2.2", family: 4 }]);
    const close = cache.close();
    let settled = false;
    void close.then(() => {
      settled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    resolveEvictedClose();
    await expect(close).resolves.toBeUndefined();
  });

  it("ignores synchronous dispatcher close failures during eviction", async () => {
    const cache = createPinnedDispatcherCache({ maxSize: 1 });
    cache.get([{ address: "1.1.1.1", family: 4 }]);
    vi.mocked(agentCapture.lastClose!).mockImplementation(() => {
      throw new Error("already closed");
    });

    expect(() => cache.get([{ address: "2.2.2.2", family: 4 }])).not.toThrow();
    await expect(cache.close()).resolves.toBeUndefined();
  });
});
