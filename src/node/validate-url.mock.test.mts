import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateUrl } from "./validate-url.mjs";
import { UnsafeUrlError } from "./errors.mjs";
import { DNS_NULL_ROUTE_CODE } from "../core/index.mjs";

vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

// Import after mock so we get the mocked version
const { default: dns } = await import("node:dns");

describe("validateUrl (mocked DNS)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws UnsafeUrlError when DNS resolves to private IP", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue([{ address: "10.0.0.1", family: 4 }] as never);
    await expect(validateUrl("https://evil.example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("throws with DNS_NULL_ROUTE_CODE when all addresses are null-route", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue([{ address: "0.0.0.0", family: 4 }] as never);
    await expect(validateUrl("https://null-route.example.com/")).rejects.toMatchObject({
      code: DNS_NULL_ROUTE_CODE,
    });
  });

  it("propagates ENOTFOUND naturally", async () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    vi.mocked(dns.promises.lookup).mockRejectedValue(err);
    await expect(validateUrl("https://notfound.example.com/")).rejects.toMatchObject({
      code: "ENOTFOUND",
    });
  });

  it("propagates DNS errors while signal wrapping is active", async () => {
    const err = Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" });
    const controller = new AbortController();
    vi.mocked(dns.promises.lookup).mockRejectedValue(err);

    await expect(
      validateUrl("https://transient.example.com/", { signal: controller.signal }),
    ).rejects.toBe(err);
  });

  it("returns resolved safe addresses for public hostname", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    const addresses = await validateUrl("https://example.com/");
    expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("returns resolved safe addresses while signal wrapping is active", async () => {
    const controller = new AbortController();
    vi.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    const addresses = await validateUrl("https://signal.example.com/", {
      signal: controller.signal,
    });

    expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("throws AbortError when DNS lookup exceeds timeoutMs", async () => {
    vi.useFakeTimers();
    vi.mocked(dns.promises.lookup).mockReturnValue(new Promise(() => {}) as never);

    const validation = validateUrl("https://slow.example.com/", { timeoutMs: 25 });
    const expectation = expect(validation).rejects.toMatchObject({
      name: "AbortError",
      message: "DNS lookup for slow.example.com timed out after 25ms",
    });
    await vi.advanceTimersByTimeAsync(25);

    await expectation;
  });

  it("ignores DNS lookup results that arrive after timeout", async () => {
    vi.useFakeTimers();
    let resolveLookup: (addresses: { address: string; family: number }[]) => void = () => {};
    vi.mocked(dns.promises.lookup).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }) as never,
    );

    const validation = validateUrl("https://late.example.com/", { timeoutMs: 5 });
    const expectation = expect(validation).rejects.toMatchObject({
      name: "AbortError",
      message: "DNS lookup for late.example.com timed out after 5ms",
    });
    await vi.advanceTimersByTimeAsync(5);
    await expectation;

    resolveLookup([{ address: "93.184.216.34", family: 4 }]);
    await Promise.resolve();
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      validateUrl("https://aborted.example.com/", { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "DNS lookup for aborted.example.com aborted",
    });
    expect(vi.mocked(dns.promises.lookup)).not.toHaveBeenCalled();
  });

  it("throws AbortError when signal aborts during DNS lookup", async () => {
    vi.mocked(dns.promises.lookup).mockReturnValue(new Promise(() => {}) as never);
    const controller = new AbortController();

    const validation = validateUrl("https://abort-later.example.com/", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(validation).rejects.toMatchObject({
      name: "AbortError",
      message: "DNS lookup for abort-later.example.com aborted",
    });
    expect(vi.mocked(dns.promises.lookup)).toHaveBeenCalledWith("abort-later.example.com", {
      all: true,
    });
  });

  it("preserves explicit AbortSignal Error reasons", async () => {
    vi.mocked(dns.promises.lookup).mockReturnValue(new Promise(() => {}) as never);
    const controller = new AbortController();
    const reason = new Error("custom abort reason");

    const validation = validateUrl("https://abort-reason.example.com/", {
      signal: controller.signal,
    });
    controller.abort(reason);

    await expect(validation).rejects.toBe(reason);
  });

  it("attaches non-Error AbortSignal reasons as cause", async () => {
    vi.mocked(dns.promises.lookup).mockReturnValue(new Promise(() => {}) as never);
    const controller = new AbortController();

    const validation = validateUrl("https://abort-cause.example.com/", {
      signal: controller.signal,
    });
    controller.abort("custom cause");

    await expect(validation).rejects.toMatchObject({
      name: "AbortError",
      message: "DNS lookup for abort-cause.example.com aborted",
      cause: "custom cause",
    });
  });
});
