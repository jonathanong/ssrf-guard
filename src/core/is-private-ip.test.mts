/* oxlint-disable max-lines */
import { describe, it, expect } from "vitest";
import { isPrivateIp } from "./is-private-ip.mjs";

describe("isPrivateIp", () => {
  function expectPrivateIps(addresses: string[]): void {
    for (const address of addresses) {
      expect(isPrivateIp(address), address).toBe(true);
    }
  }

  function expectPublicIps(addresses: string[]): void {
    for (const address of addresses) {
      expect(isPrivateIp(address), address).toBe(false);
    }
  }

  describe("standard private IPv4 ranges", () => {
    it("returns true for 127.x.x.x loopback addresses", () => {
      expectPrivateIps(["127.0.0.1", "127.255.255.255"]);
    });

    it("returns true for 10.x.x.x addresses", () => {
      expectPrivateIps(["10.0.0.1", "10.255.255.255"]);
    });

    it("returns true for 192.168.x.x addresses", () => {
      expectPrivateIps(["192.168.0.1", "192.168.255.255"]);
    });

    it("returns true for 172.16.x.x - 172.31.x.x addresses", () => {
      expectPrivateIps(["172.16.0.1", "172.31.255.255"]);
      expectPublicIps(["172.15.255.255", "172.32.0.0"]);
    });

    it("returns true for 0.x.x.x addresses", () => {
      expectPrivateIps(["0.0.0.0", "0.0.0.1", "0.255.255.255"]);
    });

    it("returns true for 169.254.x.x link-local addresses", () => {
      expectPrivateIps(["169.254.0.0", "169.254.169.254"]);
    });

    it("returns true for 100.64.0.0/10 CGNAT addresses", () => {
      expectPrivateIps([
        "100.64.0.1",
        "100.100.100.200", // Alibaba Cloud Metadata
        "100.127.255.255",
      ]);
      expectPublicIps(["100.63.255.255", "100.128.0.0"]);
    });

    it("returns true for IETF protocol assignments and test-net addresses", () => {
      expectPrivateIps(["192.0.0.170", "192.0.2.1", "198.51.100.1", "203.0.113.1"]);
      expectPublicIps(["192.0.0.9", "192.0.0.10"]);
    });

    it("returns true for 6to4 relay anycast range", () => {
      expectPrivateIps(["192.88.99.1", "192.88.99.254"]);
    });

    it("returns true for benchmarking addresses", () => {
      expectPrivateIps(["198.18.0.1", "198.19.255.255"]);
    });

    it("returns true for multicast addresses", () => {
      expectPrivateIps(["224.0.0.1", "239.255.255.255"]);
    });

    it("returns true for reserved/broadcast addresses", () => {
      expectPrivateIps(["240.0.0.0", "255.255.255.255"]);
    });

    it("returns false for public IPv4 addresses", () => {
      expectPublicIps(["8.8.8.8", "1.1.1.1", "93.184.216.34"]);
    });
  });

  describe("non-standard IPv4 literal forms", () => {
    it("detects decimal integer form", () => {
      expectPrivateIps([
        "2130706433", // 127.0.0.1
        "167772161", // 10.0.0.1
        "3232235521", // 192.168.0.1
      ]);
    });

    it("detects octal-component form", () => {
      expectPrivateIps([
        "0177.0.0.1", // 127.0.0.1
        "012.0.0.1", // 10.0.0.1
      ]);
    });

    it("detects hex-component form", () => {
      expectPrivateIps([
        "0x7f000001", // 127.0.0.1
        "0x0a000001", // 10.0.0.1
        "0xc0a80001", // 192.168.0.1
      ]);
    });

    it("detects shortened-octet forms", () => {
      expectPrivateIps([
        "127.1", // 127.0.0.1
        "10.1", // 10.0.0.1
        "192.168.1", // 192.168.0.1
      ]);
    });

    it("returns false for public IPs in any form", () => {
      expectPublicIps(["8.8.8.8"]);
    });
  });

  describe("IPv6 addresses", () => {
    it("returns true for ::1 loopback and uncompressed forms", () => {
      expectPrivateIps(["::1%eth0", "[::1%eth0]"]);
      expectPrivateIps([
        "::1",
        "[::1]",
        "0:0:0:0:0:0:0:1",
        "0000:0000:0000:0000:0000:0000:0000:0001",
        "0::1",
        "0000::1",
        "::0001",
        "::0000:1",
      ]);
    });

    it("returns true for :: unspecified and uncompressed forms", () => {
      expectPrivateIps(["::", "[::]", "0:0:0:0:0:0:0:0", "0000::0000", "0::0"]);
    });

    it("returns true for ULA fc00::/7 range and bypasses", () => {
      expectPrivateIps(["fc00::1", "fd00::1"]);
    });

    it("returns true for link-local fe80::/10 range", () => {
      expectPrivateIps(["fe80::1%lo0", "[fe80::1%lo0]"]);
      expectPrivateIps(["fe80::1", "fe90::1", "fea0::1", "feb0::1"]);
    });

    it("returns true for multicast ff00::/8 range", () => {
      expectPrivateIps(["ff02::1", "ff00::", "ffff::ffff"]);
    });

    it("returns false for public IPv6 addresses", () => {
      expectPublicIps(["2606:4700:4700::1111%eth0", "[2001:4860:4860::8888%eth0]"]);
      expectPublicIps(["2606:4700:4700::1111", "2001:4860:4860::8888"]);
    });
  });

  describe("IPv4-mapped IPv6 addresses", () => {
    it("returns true for uncompressed mapped bypass forms", () => {
      expectPrivateIps([
        "0:0:0:0:0:ffff:127.0.0.1",
        "0000:0000:0000:0000:0000:ffff:127.0.0.1",
        "0::ffff:127.0.0.1",
        "::FFFF:127.0.0.1",
      ]);
    });

    it("returns true for ::ffff: mapped blocked ranges", () => {
      expectPrivateIps([
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "::ffff:100.64.0.1",
        "::ffff:100.100.100.200",
        "::ffff:192.0.0.170",
        "::ffff:192.88.99.1",
        "::ffff:198.51.100.1",
        "::ffff:240.0.0.1",
      ]);
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
    it("returns false for invalid/out-of-range forms", () => {
      expectPublicIps(["1.2.3.4.5", "1..0.0", "256.0.0.1", "1.1.1.256", "9999999999"]);
    });
  });
});
// oxlint-disable-line max-lines
