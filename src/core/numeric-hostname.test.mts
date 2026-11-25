import { describe, expect, it } from "vitest";
import { isPublicHostname } from "./url-safety.mjs";

describe("isPublicHostname with a numeric last label", () => {
  // The WHATWG URL parser reads each of these as an IPv4 address, not a DNS name.
  it.each(["0x.1", "1.2.3.0x4", "foo.123", "example.0x7f", "a.b.0x", "1.2.3", "999.1.1.1"])(
    "rejects %s",
    (hostname) => {
      expect(isPublicHostname(hostname)).toBe(false);
      expect(URL.parse(`http://${hostname}/`)?.hostname).not.toBe(hostname);
    },
  );

  it.each(["8.8.8.8", "1.1.1.1"])("accepts canonical public IPv4 %s", (hostname) => {
    expect(isPublicHostname(hostname)).toBe(true);
  });

  it.each(["123.example.com", "0x7f.example.com", "example.x0", "example.0xg"])(
    "accepts %s, whose last label is not a number",
    (hostname) => {
      expect(isPublicHostname(hostname)).toBe(true);
    },
  );
});
