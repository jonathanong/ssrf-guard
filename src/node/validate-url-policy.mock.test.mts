import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateUrl } from "./validate-url.mjs";

vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

const { default: dns } = await import("node:dns");

describe("validateUrl hostname and protocol policy (mocked DNS)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("blocks the localhost baseline before DNS even when callers supply another policy", async () => {
    await expect(
      validateUrl("https://api.localhost/", {
        blockedHostnames: { exact: ["metadata.google.internal"], suffixes: [".internal"] },
      }),
    ).rejects.toMatchObject({
      reason: "hostname not allowed: api.localhost",
    });

    expect(vi.mocked(dns.promises.lookup)).not.toHaveBeenCalled();
  });

  it("unions custom blocked hostnames with the localhost baseline before DNS", async () => {
    await expect(
      validateUrl("https://metadata.google.internal/", {
        blockedHostnames: { exact: ["metadata.google.internal"], suffixes: [] },
      }),
    ).rejects.toMatchObject({
      reason: "hostname not allowed: metadata.google.internal",
    });

    expect(vi.mocked(dns.promises.lookup)).not.toHaveBeenCalled();
  });

  it("rejects mixed DNS results containing a private mapped address", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::ffff:127.0.0.1", family: 6 },
    ] as never);

    await expect(validateUrl("https://mixed.example.com/")).rejects.toMatchObject({
      reason: "DNS resolved to private IP: ::ffff:127.0.0.1",
    });
  });

  it("rejects a configured initial protocol before DNS", async () => {
    await expect(
      validateUrl("https://example.com/", { allowedProtocols: ["http:"] }),
    ).rejects.toMatchObject({
      reason: "protocol not allowed: https:",
    });

    expect(vi.mocked(dns.promises.lookup)).not.toHaveBeenCalled();
  });

  it("rejects protocols outside HTTP and HTTPS when JavaScript callers bypass types", async () => {
    await expect(
      validateUrl("ftp://example.com/", {
        allowedProtocols: ["ftp:"] as unknown as readonly ("http:" | "https:")[],
      }),
    ).rejects.toMatchObject({
      reason: "protocol not allowed: ftp:",
    });

    expect(vi.mocked(dns.promises.lookup)).not.toHaveBeenCalled();
  });
});
