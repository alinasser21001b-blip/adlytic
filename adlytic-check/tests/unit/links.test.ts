import { describe, expect, it } from "vitest";
import { addressBlocked, checkUrl, parseV6, type Resolver } from "../../worker/services/links";

const publicDns: Resolver = async () => ["93.184.215.14"];
const SELF = "adlytic-check.example.workers.dev";

describe("SSRF address rules", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "[::1]", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "[::ffff:7f00:1]", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2001:db8::1", "fe80::1%eth0", "1::2::3",
  ])("blocks %s", (h) => expect(addressBlocked(h)).toBe(true));

  it.each(["93.184.215.14", "1.1.1.1", "2606:4700:4700::1111", "[2a00:1450:4001:80b::200e]", "::ffff:5db8:d70e"])("allows %s", (h) =>
    expect(addressBlocked(h)).toBe(false),
  );

  it("parses compressed, full and dotted IPv6 forms", () => {
    expect(parseV6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseV6("[2606:4700:4700::1111]")).toEqual([0x2606, 0x4700, 0x4700, 0, 0, 0, 0, 0x1111]);
    expect(parseV6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseV6("1:2:3")).toBeNull();
  });
});

describe("URL checks", () => {
  const check = (u: string, r: Resolver = publicDns) => checkUrl(u, r, null, SELF);

  it.each([
    ["http://shop.example.com/a.jpg", "not_https"],
    ["https://user:pw@shop.example.com/a.jpg", "credentials"],
    ["https://shop.example.com:8443/a.jpg", "port"],
    ["https://127.0.0.1/a.jpg", "blocked_address"],
    ["https://2130706433/a.jpg", "blocked_address"], // decimal form of 127.0.0.1, normalised by URL
    ["https://0x7f.0.0.1/a.jpg", "blocked_address"],
    ["https://[::ffff:169.254.169.254]/latest", "blocked_address"],
    ["https://localhost/a.jpg", "blocked_name"],
    ["https://printer.local/a.jpg", "blocked_name"],
    ["https://intranet/a.jpg", "blocked_name"],
    [`https://${SELF}/api/session`, "self"],
  ])("refuses %s (%s)", async (u, reason) => expect(await check(u)).toEqual({ ok: false, reason }));

  it("refuses a public name that resolves to an internal address (DNS rebinding)", async () => {
    expect(await check("https://rebind.attacker.net/x.jpg", async () => ["93.184.215.14", "10.0.0.5"])).toEqual({ ok: false, reason: "resolves_internal" });
    expect(await check("https://v6.attacker.net/x.jpg", async () => ["::ffff:7f00:1"])).toEqual({ ok: false, reason: "resolves_internal" });
  });

  it("refuses when DNS fails or is empty, and allows a public https file", async () => {
    expect(await check("https://nx.attacker.net/x.jpg", async () => { throw new Error("dns"); })).toEqual({ ok: false, reason: "dns_failed" });
    expect(await check("https://empty.attacker.net/x.jpg", async () => [])).toEqual({ ok: false, reason: "dns_empty" });
    expect(await check("https://cdn.shop.iq/ad.jpg")).toEqual({ ok: true });
  });
});
