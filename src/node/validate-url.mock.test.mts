import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("returns resolved safe addresses for public hostname", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    const addresses = await validateUrl("https://example.com/");
    expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});
