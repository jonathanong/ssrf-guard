import { describe, it, expect } from "vitest";
import {
  normalizeUrlHostname,
  isBlockedHostname,
  isPublicHostname,
  LOCALHOST_BLOCKED_HOSTNAME_POLICY,
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

  it("blocks exact matches case-insensitively", () => {
    const policyWithUpper: BlockedHostnamePolicy = { exact: ["LocalHost"], suffixes: [] };
    // hostname is normalized to lowercase by validateUrl before being passed to isBlockedHostname
    expect(isBlockedHostname("localhost", policyWithUpper)).toBe(true);
  });

  it("blocks suffix matches", () => {
    expect(isBlockedHostname("foo.local", POLICY)).toBe(true);
    expect(isBlockedHostname("bar.baz.local", POLICY)).toBe(true);
  });

  it("blocks suffix matches case-insensitively", () => {
    const policyWithUpper: BlockedHostnamePolicy = { exact: [], suffixes: [".Local"] };
    // hostname is normalized to lowercase by validateUrl before being passed to isBlockedHostname
    expect(isBlockedHostname("foo.local", policyWithUpper)).toBe(true);
  });

  it("does not block non-matching hostnames", () => {
    expect(isBlockedHostname("example.com", POLICY)).toBe(false);
    expect(isBlockedHostname("notlocalhost", POLICY)).toBe(false);
  });
});

describe("isPublicHostname", () => {
  it("accepts public hostnames and public IP literals", () => {
    expect(isPublicHostname("example.com")).toBe(true);
    expect(isPublicHostname("news.example.com")).toBe(true);
    expect(isPublicHostname("8.8.8.8")).toBe(true);
    expect(isPublicHostname("2606:4700:4700::1111")).toBe(true);
  });

  it("normalizes case, brackets, and trailing dots", () => {
    expect(isPublicHostname("Example.COM.")).toBe(true);
    expect(isPublicHostname("[2606:4700:4700::1111]")).toBe(true);
    expect(isPublicHostname("localhost.")).toBe(false);
  });

  it("rejects localhost, .localhost, .local, and single-label hostnames by default", () => {
    expect(isPublicHostname("localhost")).toBe(false);
    expect(isPublicHostname("foo.localhost")).toBe(false);
    expect(isPublicHostname("service.local")).toBe(false);
    expect(isPublicHostname("intranet")).toBe(false);
  });

  it("can allow valid single-label hostnames", () => {
    expect(isPublicHostname("intranet", { allowSingleLabel: true })).toBe(true);
  });

  it("rejects private and special-use IP literals", () => {
    expect(isPublicHostname("10.0.0.1")).toBe(false);
    expect(isPublicHostname("127.0.0.1")).toBe(false);
    expect(isPublicHostname("169.254.169.254")).toBe(false);
    expect(isPublicHostname("::1")).toBe(false);
    expect(isPublicHostname("fe80::1")).toBe(false);
    expect(isPublicHostname("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicHostname("2001:db8::1")).toBe(false);
  });

  it("rejects invalid hostname and IP-looking syntax", () => {
    expect(isPublicHostname("")).toBe(false);
    expect(isPublicHostname(`${"a".repeat(250)}.com`)).toBe(false);
    expect(isPublicHostname("-example.com")).toBe(false);
    expect(isPublicHostname("example..com")).toBe(false);
    expect(isPublicHostname("foo:bar")).toBe(false);
    expect(isPublicHostname("999.999.999.999")).toBe(false);
    expect(isPublicHostname("8.8")).toBe(false);
  });

  it("uses custom blocked hostname policies", () => {
    const customPolicy = {
      exact: ["metadata.google.internal"],
      suffixes: [],
    };

    expect(
      isPublicHostname("metadata.google.internal", {
        blockedHostnames: customPolicy,
      }),
    ).toBe(false);
    expect(isPublicHostname("foo.localhost", { blockedHostnames: customPolicy })).toBe(false);
    expect(isPublicHostname("service.local", { blockedHostnames: customPolicy })).toBe(false);
    expect(
      isPublicHostname("foo.internal", {
        blockedHostnames: {
          exact: [],
          suffixes: [".internal"],
        },
      }),
    ).toBe(false);
  });

  it("exports the local hostname policy for validateUrl callers", () => {
    expect(LOCALHOST_BLOCKED_HOSTNAME_POLICY).toEqual({
      exact: ["localhost"],
      suffixes: [".localhost", ".local"],
    });
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

  it("sanitizes credentials in UnsafeResolvedAddressError", () => {
    const addresses = [{ address: "10.0.0.1", family: 4 }];
    try {
      validateResolvedAddresses("//admin:secretPass@example.com", "example.com", addresses);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsafeResolvedAddressError);
      expect((e as UnsafeResolvedAddressError).rawUrl).toBe("//***:***@example.com");
      expect((e as UnsafeResolvedAddressError).message).not.toContain("secretPass");
      expect((e as UnsafeResolvedAddressError).message).not.toContain("admin");
    }
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
