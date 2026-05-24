import { describe, it, expect } from "vitest";
import { isPrivateIp } from "./is-private-ip.mjs";

describe("isPrivateIp", () => {
  describe("standard private IPv4 ranges", () => {
    it("returns true for 127.x.x.x loopback addresses", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("127.255.255.255")).toBe(true);
    });

    it("returns true for 10.x.x.x addresses", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });

    it("returns true for 192.168.x.x addresses", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
    });

    it("returns true for 172.16.x.x - 172.31.x.x addresses", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
      expect(isPrivateIp("172.15.255.255")).toBe(false);
      expect(isPrivateIp("172.32.0.0")).toBe(false);
    });

    it("returns true for 0.x.x.x addresses", () => {
      expect(isPrivateIp("0.0.0.0")).toBe(true);
      expect(isPrivateIp("0.0.0.1")).toBe(true);
      expect(isPrivateIp("0.255.255.255")).toBe(true);
    });

    it("returns true for 169.254.x.x link-local addresses", () => {
      expect(isPrivateIp("169.254.0.0")).toBe(true);
      expect(isPrivateIp("169.254.169.254")).toBe(true);
    });

    it("returns true for 100.64.0.0/10 CGNAT addresses", () => {
      expect(isPrivateIp("100.64.0.1")).toBe(true);
      expect(isPrivateIp("100.100.100.200")).toBe(true); // Alibaba Cloud Metadata
      expect(isPrivateIp("100.127.255.255")).toBe(true);
      expect(isPrivateIp("100.63.255.255")).toBe(false);
      expect(isPrivateIp("100.128.0.0")).toBe(false);
    });

    it("returns true for IETF protocol assignments and test-net addresses", () => {
      expect(isPrivateIp("192.0.0.170")).toBe(true);
      expect(isPrivateIp("192.0.2.1")).toBe(true);
      expect(isPrivateIp("198.51.100.1")).toBe(true);
      expect(isPrivateIp("203.0.113.1")).toBe(true);
    });

    it("returns true for benchmarking addresses", () => {
      expect(isPrivateIp("198.18.0.1")).toBe(true);
      expect(isPrivateIp("198.19.255.255")).toBe(true);
    });

    it("returns true for multicast addresses", () => {
      expect(isPrivateIp("224.0.0.1")).toBe(true);
      expect(isPrivateIp("239.255.255.255")).toBe(true);
    });

    it("returns true for reserved/broadcast addresses", () => {
      expect(isPrivateIp("240.0.0.0")).toBe(true);
      expect(isPrivateIp("255.255.255.255")).toBe(true);
    });

    it("returns false for public IPv4 addresses", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
      expect(isPrivateIp("93.184.216.34")).toBe(false);
    });
  });

  describe("non-standard IPv4 literal forms", () => {
    it("detects decimal integer form", () => {
      expect(isPrivateIp("2130706433")).toBe(true); // 127.0.0.1
      expect(isPrivateIp("167772161")).toBe(true); // 10.0.0.1
      expect(isPrivateIp("3232235521")).toBe(true); // 192.168.0.1
    });

    it("detects octal-component form", () => {
      expect(isPrivateIp("0177.0.0.1")).toBe(true); // 127.0.0.1
      expect(isPrivateIp("012.0.0.1")).toBe(true); // 10.0.0.1
    });

    it("detects hex-component form", () => {
      expect(isPrivateIp("0x7f000001")).toBe(true); // 127.0.0.1
      expect(isPrivateIp("0x0a000001")).toBe(true); // 10.0.0.1
      expect(isPrivateIp("0xc0a80001")).toBe(true); // 192.168.0.1
    });

    it("detects shortened-octet forms", () => {
      expect(isPrivateIp("127.1")).toBe(true); // 127.0.0.1
      expect(isPrivateIp("10.1")).toBe(true); // 10.0.0.1
      expect(isPrivateIp("192.168.1")).toBe(true); // 192.168.0.1
    });

    it("returns false for public IPs in any form", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
    });
  });

  describe("IPv6 addresses", () => {
    it("returns true for ::1 loopback", () => {
      expect(isPrivateIp("::1")).toBe(true);
      expect(isPrivateIp("[::1]")).toBe(true);
    });

    it("returns true for :: unspecified", () => {
      expect(isPrivateIp("::")).toBe(true);
      expect(isPrivateIp("[::]")).toBe(true);
    });

    it("returns true for ULA fc00::/7 range", () => {
      expect(isPrivateIp("fc00::1")).toBe(true);
      expect(isPrivateIp("fd00::1")).toBe(true);
    });

    it("returns true for link-local fe80::/10 range", () => {
      expect(isPrivateIp("fe80::1")).toBe(true);
      expect(isPrivateIp("fe90::1")).toBe(true);
      expect(isPrivateIp("fea0::1")).toBe(true);
      expect(isPrivateIp("feb0::1")).toBe(true);
    });

    it("returns true for multicast ff00::/8 range", () => {
      expect(isPrivateIp("ff02::1")).toBe(true);
      expect(isPrivateIp("ff00::")).toBe(true);
      expect(isPrivateIp("ffff::ffff")).toBe(true);
    });

    it("returns false for public IPv6 addresses", () => {
      expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
      expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("IPv4-mapped IPv6 addresses", () => {
    it("returns true for ::ffff:127.0.0.1 (loopback mapped)", () => {
      expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    });

    it("returns true for ::ffff:10.0.0.1 (private mapped)", () => {
      expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    });

    it("returns true for hex-group form (Node.js URL normalization)", () => {
      expect(isPrivateIp("::ffff:7f00:1")).toBe(true); // 127.0.0.1
      expect(isPrivateIp("::ffff:0a00:1")).toBe(true); // 10.0.0.1
    });

    it("returns false for ::ffff: mapped public addresses", () => {
      expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
      expect(isPrivateIp("::ffff:0808:0808")).toBe(false);
    });

    it("returns false for ::ffff: with unrecognized embedded form", () => {
      expect(isPrivateIp("::ffff:xyz")).toBe(false);
    });

    it("returns false for ::ffff: with dotted-but-out-of-range embedded form", () => {
      expect(isPrivateIp("::ffff:256.0.0.1")).toBe(false);
    });
  });

  describe("normalizeIpv4Address edge cases", () => {
    it("returns false for 5-component notation (too many octets)", () => {
      expect(isPrivateIp("1.2.3.4.5")).toBe(false);
    });

    it("returns false for empty-part notation (double dot) with non-private prefix", () => {
      expect(isPrivateIp("1..0.0")).toBe(false);
    });

    it("returns false for leading-octet-out-of-range notation", () => {
      expect(isPrivateIp("256.0.0.1")).toBe(false);
    });

    it("returns false for last-octet-out-of-range notation", () => {
      expect(isPrivateIp("1.1.1.256")).toBe(false);
    });

    it("returns false for decimal integer exceeding 32-bit range", () => {
      expect(isPrivateIp("9999999999")).toBe(false);
    });
  });
});
