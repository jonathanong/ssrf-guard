import { describe, it, expect } from "vitest";
import {
  normalizeUrlHostname,
  isBlockedHostname,
  validateResolvedAddresses,
  UnsafeResolvedAddressError,
  DNS_NULL_ROUTE_CODE,
  type BlockedHostnamePolicy,
} from "./url-safety.mjs";

const POLICY: BlockedHostnamePolicy = {
  exact: ["localhost"],
  suffixes: [".local"],
};

describe("normalizeUrlHostname", () => {
  it("lowercases the hostname", () => {
    expect(normalizeUrlHostname("EXAMPLE.COM")).toBe("example.com");
  });

  it("strips trailing dots", () => {
    expect(normalizeUrlHostname("example.com.")).toBe("example.com");
    expect(normalizeUrlHostname("example.com..")).toBe("example.com");
  });

  it("strips brackets from IPv6", () => {
    expect(normalizeUrlHostname("[::1]")).toBe("::1");
    expect(normalizeUrlHostname("[2001:db8::1]")).toBe("2001:db8::1");
  });

  it("handles plain hostnames", () => {
    expect(normalizeUrlHostname("example.com")).toBe("example.com");
  });
});

describe("isBlockedHostname", () => {
  it("blocks exact matches", () => {
    expect(isBlockedHostname("localhost", POLICY)).toBe(true);
  });

  it("blocks suffix matches", () => {
    expect(isBlockedHostname("foo.local", POLICY)).toBe(true);
    expect(isBlockedHostname("bar.baz.local", POLICY)).toBe(true);
  });

  it("does not block non-matching hostnames", () => {
    expect(isBlockedHostname("example.com", POLICY)).toBe(false);
    expect(isBlockedHostname("notlocalhost", POLICY)).toBe(false);
  });
});

describe("validateResolvedAddresses", () => {
  it("returns usable addresses when all are public", () => {
    const addresses = [{ address: "8.8.8.8", family: 4 }];
    const result = validateResolvedAddresses("https://example.com", "example.com", addresses);
    expect(result).toEqual(addresses);
  });

  it("throws UnsafeResolvedAddressError for private IPs", () => {
    const addresses = [{ address: "10.0.0.1", family: 4 }];
    expect(() =>
      validateResolvedAddresses("https://example.com", "example.com", addresses),
    ).toThrow(UnsafeResolvedAddressError);
  });

  it("filters out null-route addresses and throws if all are null-route", () => {
    const addresses = [{ address: "0.0.0.0", family: 4 }];
    expect(() =>
      validateResolvedAddresses("https://example.com", "example.com", addresses),
    ).toThrow(expect.objectContaining({ code: DNS_NULL_ROUTE_CODE }));
  });

  it("filters null-route addresses but accepts remaining public addresses", () => {
    const addresses = [
      { address: "0.0.0.0", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ];
    const result = validateResolvedAddresses("https://example.com", "example.com", addresses);
    expect(result).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("throws with 'no usable addresses' message when addresses array is empty", () => {
    expect(() => validateResolvedAddresses("https://example.com", "example.com", [])).toThrow(
      expect.objectContaining({
        code: DNS_NULL_ROUTE_CODE,
        message: expect.stringContaining("no usable addresses"),
      }),
    );
  });
});
