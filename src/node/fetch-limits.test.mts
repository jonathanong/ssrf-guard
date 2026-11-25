import { afterEach, describe, expect, it, vi } from "vitest";

import { checkFetchLimits, dispatcherLimits, startDeadline } from "./fetch-limits.mjs";

describe("checkFetchLimits", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects timeoutMs %s", (timeoutMs) => {
    expect(() => checkFetchLimits({ timeoutMs, maxResponseBytes: 1 })).toThrow(RangeError);
  });

  it.each([-1, 1.5, Number.NaN])("rejects maxResponseBytes %s", (maxResponseBytes) => {
    expect(() => checkFetchLimits({ timeoutMs: 1, maxResponseBytes })).toThrow(RangeError);
  });

  it.each([
    [1, 0],
    [Infinity, Infinity],
  ])("accepts timeoutMs %s and maxResponseBytes %s", (timeoutMs, maxResponseBytes) => {
    expect(() => checkFetchLimits({ timeoutMs, maxResponseBytes })).not.toThrow();
  });
});

describe("dispatcherLimits", () => {
  it("passes finite limits through", () => {
    expect(dispatcherLimits({ timeoutMs: 5_000, maxResponseBytes: 100 })).toEqual({
      bodyTimeout: 5_000,
      maxResponseSize: 100,
    });
  });

  it("turns Infinity into undici's disabled values", () => {
    expect(dispatcherLimits({ timeoutMs: Infinity, maxResponseBytes: Infinity })).toEqual({
      bodyTimeout: 0,
      maxResponseSize: -1,
    });
  });
});

describe("startDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts with a TimeoutError once timeoutMs passes", () => {
    vi.useFakeTimers();
    const { signal } = startDeadline(1_000);
    vi.advanceTimersByTime(999);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal?.reason).toMatchObject({
      name: "TimeoutError",
      message: "safeFetch timed out after 1000ms",
    });
  });

  it("does not abort after clear", () => {
    vi.useFakeTimers();
    const deadline = startDeadline(1_000);
    deadline.clear();
    vi.advanceTimersByTime(2_000);
    expect(deadline.signal?.aborted).toBe(false);
  });

  it("still follows the caller's signal", () => {
    const controller = new AbortController();
    const deadline = startDeadline(60_000, controller.signal);
    controller.abort(new Error("caller gave up"));
    expect(deadline.signal?.reason).toEqual(new Error("caller gave up"));
    deadline.clear();
  });

  it("uses the caller's signal as is when there is no timeout", () => {
    const controller = new AbortController();
    const deadline = startDeadline(Infinity, controller.signal);
    expect(deadline.signal).toBe(controller.signal);
    deadline.clear();
    expect(startDeadline(Infinity).signal).toBeUndefined();
  });
});
