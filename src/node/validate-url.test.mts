import { describe, it, expect } from "vitest";
import { validateUrl } from "./validate-url.mjs";
import { UnsafeUrlError } from "./errors.mjs";

describe("validateUrl", () => {
  it("resolves a public URL and returns addresses", async () => {
    const addresses = await validateUrl("https://one.one.one.one/");
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses[0]).toMatchObject({ address: expect.any(String), family: expect.any(Number) });
  });

  it("throws UnsafeUrlError for invalid URL", async () => {
    await expect(validateUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("throws UnsafeUrlError for non-http scheme", async () => {
    await expect(validateUrl("ftp://example.com")).rejects.toThrow(UnsafeUrlError);
  });

  it("throws UnsafeUrlError for private IP literal", async () => {
    await expect(validateUrl("https://10.0.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("throws UnsafeUrlError for loopback IP literal", async () => {
    await expect(validateUrl("https://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("sanitizes credentials in UnsafeUrlError", async () => {
    const error = await validateUrl("https://admin:secretPass@127.0.0.1/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect((error as UnsafeUrlError).rawUrl).toBe("https://***:***@127.0.0.1/");
    expect((error as UnsafeUrlError).message).not.toContain("secretPass");
    expect((error as UnsafeUrlError).message).not.toContain("admin");
  });

  it("throws UnsafeUrlError for blocked hostname", async () => {
    await expect(
      validateUrl("http://localhost/", {
        blockedHostnames: { exact: ["localhost"], suffixes: [] },
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it("does not block hostname due to policy when no policy is set", async () => {
    // With no blockedHostnames policy the hostname-block check is skipped.
    // localhost still resolves to a private IP so validateUrl throws, but the
    // reason must NOT be "hostname not allowed" — it must be the DNS/IP check.
    const error = await validateUrl("http://localhost/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect((error as UnsafeUrlError).reason).not.toContain("hostname not allowed");
  });
});
