import { describe, it, expect, vi } from "vitest";
import { createPinnedLookup, createPinnedDispatcher } from "./pinned-dispatcher.mts";
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
});
