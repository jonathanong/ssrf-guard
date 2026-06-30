import { describe, it, expect, vi } from "vitest";
import {
  createPinnedLookup,
  createPinnedDispatcher,
  createPinnedDispatcherCache,
} from "./pinned-dispatcher.mjs";
import { Agent } from "undici";

describe("createPinnedLookup", () => {
  it("returns all addresses when options.all is true", () => {
    const lookup = createPinnedLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);
    const callback = vi.fn();
    lookup("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);
  });

  it("returns the first address when options.all is false", () => {
    const lookup = createPinnedLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);
    const callback = vi.fn();
    lookup("example.com", { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("works with a single address", () => {
    const lookup = createPinnedLookup([{ address: "1.2.3.4", family: 4 }]);
    const callback = vi.fn();
    lookup("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "1.2.3.4", family: 4 }]);
  });
});

describe("createPinnedDispatcher", () => {
  it("returns an undici Agent", () => {
    const dispatcher = createPinnedDispatcher([{ address: "93.184.216.34", family: 4 }]);
    expect(dispatcher).toBeInstanceOf(Agent);
  });

  it("accepts dispatcher connection options", () => {
    const dispatcher = createPinnedDispatcher([{ address: "93.184.216.34", family: 4 }], {
      connections: 2,
    });
    expect(dispatcher).toBeInstanceOf(Agent);
  });
});

describe("createPinnedDispatcherCache", () => {
  it("returns the same dispatcher for equivalent address sets", () => {
    const cache = createPinnedDispatcherCache();
    const first = cache.get([
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const second = cache.get([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);

    expect(second).toBe(first);
    expect(cache.size).toBe(1);
  });

  it("canonicalizes same-family address ordering for cache reuse", () => {
    const cache = createPinnedDispatcherCache();
    const first = cache.get([
      { address: "93.184.216.35", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const second = cache.get([
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);

    expect(second).toBe(first);
    expect(cache.size).toBe(1);
  });

  it("creates cached dispatchers with connection options", () => {
    const cache = createPinnedDispatcherCache({ connections: 2 });
    const dispatcher = cache.get([{ address: "1.1.1.1", family: 4 }]);

    expect(dispatcher).toBeInstanceOf(Agent);
  });

  it("evicts and closes the least-recently-used dispatcher", () => {
    const cache = createPinnedDispatcherCache({ maxSize: 2 });
    const oldest = cache.get([{ address: "1.1.1.1", family: 4 }]);
    const retained = cache.get([{ address: "2.2.2.2", family: 4 }]);
    const oldestClose = vi.spyOn(oldest, "close").mockResolvedValue(undefined);
    const retainedClose = vi.spyOn(retained, "close").mockResolvedValue(undefined);

    expect(cache.get([{ address: "1.1.1.1", family: 4 }])).toBe(oldest);
    cache.get([{ address: "3.3.3.3", family: 4 }]);

    expect(oldestClose).not.toHaveBeenCalled();
    expect(retainedClose).toHaveBeenCalledOnce();
    expect(cache.get([{ address: "2.2.2.2", family: 4 }])).not.toBe(retained);
    expect(cache.size).toBe(2);
  });

  it("keeps the cache at maxSize when maxSize is one", () => {
    const cache = createPinnedDispatcherCache({ maxSize: 1 });
    const evicted = cache.get([{ address: "1.1.1.1", family: 4 }]);
    const close = vi.spyOn(evicted, "close").mockResolvedValue(undefined);

    cache.get([{ address: "2.2.2.2", family: 4 }]);

    expect(close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(1);
  });

  it("ignores dispatcher close failures during eviction", async () => {
    const cache = createPinnedDispatcherCache({ maxSize: 1 });
    const evicted = cache.get([{ address: "1.1.1.1", family: 4 }]);
    vi.spyOn(evicted, "close").mockRejectedValue(new Error("already closed"));

    expect(() => cache.get([{ address: "2.2.2.2", family: 4 }])).not.toThrow();
    await Promise.resolve();
  });

  it("closes cached dispatchers and clears the cache", async () => {
    const cache = createPinnedDispatcherCache();
    const dispatcher = cache.get([{ address: "1.1.1.1", family: 4 }]);
    const close = vi.spyOn(dispatcher, "close").mockResolvedValue(undefined);

    await cache.close();

    expect(close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });

  it("ignores dispatcher close failures during cache shutdown", async () => {
    const cache = createPinnedDispatcherCache();
    const dispatcher = cache.get([{ address: "1.1.1.1", family: 4 }]);
    vi.spyOn(dispatcher, "close").mockRejectedValue(new Error("already closed"));

    await expect(cache.close()).resolves.toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("throws for empty address lists and invalid cache sizes", () => {
    expect(() => createPinnedDispatcherCache({ maxSize: 0 })).toThrow(RangeError);
    const cache = createPinnedDispatcherCache();
    expect(() => cache.get([])).toThrow(RangeError);
  });
});
