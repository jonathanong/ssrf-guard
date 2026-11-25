import { describe, expect, it } from "vitest";

import { UnsafeResolvedAddressError, sanitizeUrl } from "./url-safety.mjs";

describe("sanitizeUrl", () => {
  it.each([
    ["https://example.com/path", "https://example.com/path"],
    ["https://example.com/cb?token=secret", "https://example.com/cb"],
    ["https://example.com/cb#access_token=secret", "https://example.com/cb"],
    ["https://example.com/cb?", "https://example.com/cb"],
    ["https://user:pass@example.com/?sig=secret#x", "https://***:***@example.com/"],
    ["https://user@example.com/", "https://***:***@example.com/"],
    ["//admin:pass@example.com/?token=secret", "//***:***@example.com/"],
    ["not a url?token=secret", "not a url"],
    ["not a url#secret\nmore", "not a url"],
  ])("sanitizes %j", (input, expected) => {
    expect(sanitizeUrl(input)).toBe(expected);
  });

  it("keeps the query out of UnsafeResolvedAddressError", () => {
    const error = new UnsafeResolvedAddressError("https://example.com/?token=secret", "10.0.0.1");
    expect(error.rawUrl).toBe("https://example.com/");
  });
});
