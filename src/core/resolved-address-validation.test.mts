import { describe, expect, it } from "vitest";

import { UnsafeResolvedAddressError, validateResolvedAddresses } from "./url-safety.mjs";

describe("validateResolvedAddresses with addresses that are not IPs", () => {
  it.each(["example.com", "127.0.0.1.", "[::1]", "8.8.8.8:80", " 8.8.8.8", ""])(
    "rejects %j",
    (address) => {
      const addresses = [{ address, family: 4 }];
      expect(() =>
        validateResolvedAddresses("https://example.com", "example.com", addresses),
      ).toThrow(
        new UnsafeResolvedAddressError(
          "https://example.com",
          address,
          `DNS resolved to invalid IP: ${address}`,
        ),
      );
    },
  );

  it("rejects the whole set when one address is not an IP", () => {
    const addresses = [
      { address: "8.8.8.8", family: 4 },
      { address: "not-an-ip", family: 4 },
    ];
    expect(() =>
      validateResolvedAddresses("https://example.com", "example.com", addresses),
    ).toThrow("DNS resolved to invalid IP: not-an-ip");
  });

  it("still accepts public IPv4 and IPv6 addresses", () => {
    const addresses = [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ];
    expect(validateResolvedAddresses("https://example.com", "example.com", addresses)).toEqual(
      addresses,
    );
  });
});
