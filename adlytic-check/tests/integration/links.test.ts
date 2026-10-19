import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "../support/client";
import { MOCK, urlOf } from "../support/instances";

const MAIN = urlOf("main");

async function importLink(c: Client, url: string, base = MAIN) {
  const res = await fetch(`${base}/api/import-link`, { method: "POST", headers: c.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ url }) });
  const type = res.headers.get("content-type") ?? "";
  return {
    status: res.status,
    state: res.headers.get("x-link-state"),
    kind: res.headers.get("x-link-kind"),
    type,
    json: type.includes("json") ? ((await res.json()) as { state: string; reason: string }) : null,
    bytes: type.includes("json") ? null : new Uint8Array(await res.arrayBuffer()),
  };
}

// Two shared guests: new sessions per test would trip the per-IP session limit,
// and one guest would trip the 20-imports-per-hour limit.
const a = new Client(MAIN);
const b = new Client(MAIN);
beforeAll(async () => {
  await a.session();
  await b.session();
});

describe("link import", () => {
  it.each([
    ["https://www.instagram.com/p/C0abc123/", "AUTH_REQUIRED"],
    ["https://instagram.com/reel/xyz", "AUTH_REQUIRED"],
    ["https://www.facebook.com/shop/posts/1", "AUTH_REQUIRED"],
    ["https://fb.watch/abc/", "AUTH_REQUIRED"],
    ["https://www.tiktok.com/@shop/video/1", "UNSUPPORTED"],
    ["https://youtu.be/abc", "UNSUPPORTED"],
    ["https://wa.me/9647700000000", "UNSUPPORTED"],
  ])("never scrapes social platforms: %s → %s", async (url, state) => {
    const r = await importLink(a, url);
    expect(r.json?.state).toBe(state);
  });

  it("imports a direct image link (bytes decide the type) and a direct video link", async () => {
    const c = a;
    const img = await importLink(c, `${MOCK}/files/ad-misnamed.txt`);
    expect([img.state, img.kind, img.type]).toEqual(["SUPPORTED", "image", "image/jpeg"]);
    expect(img.bytes![0]).toBe(0xff);
    const vid = await importLink(c, `${MOCK}/files/clip.mp4`);
    expect([vid.state, vid.kind]).toEqual(["SUPPORTED", "video"]);
  });

  it("uses a shop page's preview image and says it is only a preview", async () => {
    const c = a;
    const r = await importLink(c, `${MOCK}/files/shop.html`);
    expect([r.state, r.kind]).toEqual(["PREVIEW_ONLY", "image"]);
    expect((await importLink(c, `${MOCK}/files/plain.html`)).json).toEqual({ state: "UNSUPPORTED", reason: "page_without_preview_image" });
  });

  it.each([
    ["/files/hop-internal", "UNSUPPORTED", "blocked:not_https"],
    ["/files/shop-internal.html", "UNSUPPORTED", "blocked:not_https"],
    ["/files/hop-loop", "UNSUPPORTED", "blocked:too_many_redirects"],
    ["/files/big.jpg", "UNSUPPORTED", "image_too_large"],
    ["/files/huge-declared.jpg", "UNSUPPORTED", "too_large"],
    ["/files/notes.txt", "UNSUPPORTED", "not_an_image_or_video"],
    ["/files/gone.jpg", "UNAVAILABLE", "http_404"],
  ])("refuses %s", async (path, state, reason) => {
    expect((await importLink(b, `${MOCK}${path}`)).json).toEqual({ state, reason });
  });

  it("follows a same-origin redirect after re-checking it", async () => {
    const c = a;
    expect((await importLink(c, `${MOCK}/files/hop`)).state).toBe("SUPPORTED");
  });

  it("in production the test origin is not special: plain http to loopback is refused", async () => {
    const c = new Client(urlOf("production"));
    await c.session();
    const r = await importLink(c, `${MOCK}/files/ad.jpg`, urlOf("production"));
    expect(r.json).toEqual({ state: "UNSUPPORTED", reason: "blocked:not_https" });
  });

  it("needs a session and our Origin", async () => {
    expect((await fetch(`${MAIN}/api/import-link`, { method: "POST", headers: { Origin: MAIN }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${MAIN}/api/import-link`, { method: "POST", body: "{}" })).status).toBe(403);
  });
});
