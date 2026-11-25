import { describe, expect, it } from "vitest";
import { isPrivateIp } from "./is-private-ip.mjs";
import { isPublicHostname } from "./url-safety.mjs";

// RFC 4291 §2.5.5.1: `::a.b.c.d` is deprecated and nothing legitimate lives in ::/96.
describe("IPv4-compatible IPv6 addresses (::/96)", () => {
  const hexForms = [
    "::7f00:1", // 127.0.0.1
    "::a9fe:a9fe", // 169.254.169.254
    "::a00:1", // 10.0.0.1
    "0::7f00:1",
    "0000:0000:0000:0000:0000:0000:7f00:0001",
    "::2",
  ];
  const dottedForms = ["::127.0.0.1", "::169.254.169.254", "::10.0.0.1"];
  const embeddedPublicForms = ["::808:808", "::8.8.8.8", "::192.0.0.9"];

  it.each([...hexForms, ...dottedForms, ...embeddedPublicForms])("treats %s as private", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp(`[${ip}]`)).toBe(true);
    expect(isPublicHostname(ip)).toBe(false);
    expect(isPublicHostname(`[${ip}]`)).toBe(false);
  });

  it("blocks the spelling the WHATWG URL parser produces", () => {
    const { hostname } = new URL("http://[::127.0.0.1]/");
    expect(hostname).toBe("[::7f00:1]");
    expect(isPublicHostname(hostname)).toBe(false);
  });

  it("leaves addresses outside ::/96 alone", () => {
    expect(isPrivateIp("::1:0:0:1")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIp("::not.an.ip")).toBe(false);
  });
});
