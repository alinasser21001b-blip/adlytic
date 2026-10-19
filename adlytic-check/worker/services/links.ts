import { config, HttpError, takeRateSlot, type Ctx } from "../lib";
import { sniffImage } from "../validation/image";
import { requireVisitor } from "./session";

// Import an ad from a link. Social platforms are never scraped: Instagram and
// Facebook need an authorised Meta app (not configured), the others have no
// official import — the owner is told so plainly. Direct file links and a
// shop page's preview image (og:image) are fetched with SSRF controls
// (research S17): https on 443 only, no credentials, no internal names or
// addresses (IPv4, IPv6, IPv4-mapped/NAT64/6to4 embedded), DNS answers
// checked before connecting, every redirect hop re-checked, bytes capped while
// streaming. Nothing fetched is stored.

export type LinkState = "SUPPORTED" | "PREVIEW_ONLY" | "AUTH_REQUIRED" | "UNAVAILABLE" | "UNSUPPORTED";

const IMAGE_MAX = 3 * 1024 * 1024;
/** Fetched videos are held in memory once; 25 MiB keeps well inside the 128 MB isolate. */
const LINK_VIDEO_MAX = 25 * 1024 * 1024;
const HTML_MAX = 512 * 1024;
const MAX_REDIRECTS = 3;
const UA = "AdlyticCheck-LinkImport/1.0 (+https://adlytic-check.i6900612.workers.dev/privacy)";

const META_HOSTS = /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.watch|threads\.net|messenger\.com)$/i;
const OTHER_SOCIAL = /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|snapchat\.com|x\.com|twitter\.com|t\.me|telegram\.me|wa\.me|whatsapp\.com)$/i;

// ── Address checks ───────────────────────────────────────────────────────

function v4Blocked(a: number[]): boolean {
  const [x, y] = a as [number, number];
  return (
    x === 0 || x === 10 || x === 127 || x >= 224 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && y === 168) ||
    (x === 192 && y === 0 && a[2] === 0) ||
    (x === 192 && y === 0 && a[2] === 2) ||
    (x === 198 && (y === 18 || y === 19)) ||
    (x === 198 && y === 51 && a[2] === 100) ||
    (x === 203 && y === 0 && a[2] === 113)
  );
}

function parseV4(s: string): number[] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const a = m.slice(1).map(Number);
  return a.every((n) => n <= 255) ? a : null;
}

/** Parses any textual IPv6 form (with or without brackets, "::", or a dotted IPv4 tail) to 8 words. */
export function parseV6(input: string): number[] | null {
  let h = input.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":") || h.includes("%")) return null; // zone ids are never public
  const dotted = h.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const a = parseV4(dotted[1]!);
    if (!a) return null;
    h = h.slice(0, -dotted[1]!.length) + ((a[0]! << 8) | a[1]!).toString(16) + ":" + ((a[2]! << 8) | a[3]!).toString(16);
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const words = (x: string) => (x === "" ? [] : x.split(":"));
  const head = words(halves[0]!);
  const tail = halves.length === 2 ? words(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.length !== 8 || !all.every((w) => /^[0-9a-f]{1,4}$/.test(w))) return null;
  return all.map((w) => parseInt(w, 16));
}

function v6Blocked(w: number[]): boolean {
  const all0 = (from: number, to: number) => w.slice(from, to).every((x) => x === 0);
  const embedded = (hi: number, lo: number) => v4Blocked([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (all0(0, 8)) return true; // ::
  if (all0(0, 7) && w[7] === 1) return true; // ::1
  if (all0(0, 5) && w[5] === 0xffff) return embedded(w[6]!, w[7]!); // ::ffff:a.b.c.d (mapped)
  if (all0(0, 6)) return embedded(w[6]!, w[7]!); // ::a.b.c.d (compatible, deprecated)
  if (w[0] === 0x64 && w[1] === 0xff9b && all0(2, 6)) return embedded(w[6]!, w[7]!); // NAT64
  if (w[0] === 0x2002) return embedded(w[1]!, w[2]!); // 6to4
  if ((w[0]! & 0xfe00) === 0xfc00) return true; // unique local
  if ((w[0]! & 0xffc0) === 0xfe80) return true; // link local
  if ((w[0]! & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
  return false;
}

/** True when an address literal must never be contacted. Unknown forms are blocked. */
export function addressBlocked(host: string): boolean {
  const v4 = parseV4(host);
  if (v4) return v4Blocked(v4);
  if (host.includes(":") || host.startsWith("[")) {
    const v6 = parseV6(host);
    return v6 ? v6Blocked(v6) : true;
  }
  return false;
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|arpa|test|invalid|example)$/i;

export type Resolver = (host: string) => Promise<string[]>;

/** DNS-over-HTTPS lookup of A and AAAA records (the answers are checked before any connection). */
export const dohResolver: Resolver = async (host) => {
  const out: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("dns");
    const j = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
  }
  return out;
};

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/** Static checks on a URL, then its DNS answers. `testOrigin` (non-production only) is exempt. */
export async function checkUrl(raw: string, resolve: Resolver, testOrigin: string | null, selfHost: string): Promise<UrlCheck> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (testOrigin && u.origin === testOrigin) return { ok: true };
  if (u.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  if (u.port && u.port !== "443") return { ok: false, reason: "port" };
  const host = u.hostname.toLowerCase();
  if (host === selfHost) return { ok: false, reason: "self" };
  if (addressBlocked(host)) return { ok: false, reason: "blocked_address" };
  const literal = parseV4(host) || host.includes(":");
  if (!literal) {
    if (!host.includes(".") || BLOCKED_NAMES.test(host)) return { ok: false, reason: "blocked_name" };
    let answers: string[];
    try {
      answers = await resolve(host);
    } catch {
      return { ok: false, reason: "dns_failed" };
    }
    if (!answers.length) return { ok: false, reason: "dns_empty" };
    if (answers.some((a) => addressBlocked(a))) return { ok: false, reason: "resolves_internal" };
  }
  return { ok: true };
}

// ── Fetching ─────────────────────────────────────────────────────────────

interface Fetched {
  status: number;
  contentType: string;
  body: Uint8Array | null; // null when the cap was exceeded
  finalUrl: string;
}

async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const ch of chunks) out.set(ch, o), (o += ch.byteLength);
  return out;
}

async function safeFetch(url: string, cap: number, resolve: Resolver, testOrigin: string | null, selfHost: string): Promise<Fetched | { blocked: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await checkUrl(current, resolve, testOrigin, selfHost);
    if (!check.ok) return { blocked: check.reason! };
    const res = await fetch(current, { redirect: "manual", headers: { "user-agent": UA, accept: "image/*,video/*,text/html;q=0.8" }, signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) return { status: res.status, contentType: "", body: new Uint8Array(), finalUrl: current };
      current = new URL(loc, current).toString();
      continue;
    }
    return { status: res.status, contentType: (res.headers.get("content-type") ?? "").toLowerCase(), body: res.ok ? await readCapped(res, cap) : new Uint8Array(), finalUrl: current };
  }
  return { blocked: "too_many_redirects" };
}

function isVideoBytes(b: Uint8Array): "video/mp4" | "video/webm" | null {
  if (b.length > 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp") return "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

function ogImage(html: string, base: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (!m) return null;
  try {
    return new URL(m[1]!.replace(/&amp;/g, "&"), base).toString();
  } catch {
    return null;
  }
}

function stateJson(c: Ctx, state: LinkState, reason: string): Response {
  return c.json({ state, reason }, 200, { "Cache-Control": "no-store" });
}

/** POST /api/import-link {url} → the media bytes (SUPPORTED / PREVIEW_ONLY) or a JSON state. */
export async function importLink(c: Ctx): Promise<Response> {
  const visitorId = await requireVisitor(c);
  const cfg = config(c.env);
  if (!(await takeRateSlot(c.env.DB, `links:${visitorId}`, 3_600_000, 20, Date.now()))) throw new HttpError(429, "RATE_LIMITED", { retryAfter: 900 });
  let url: string;
  try {
    url = String((JSON.parse(await c.req.text()) as { url?: unknown }).url ?? "").trim();
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
  if (!url || url.length > 2048) throw new HttpError(400, "INVALID_INPUT");
  if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return stateJson(c, "UNSUPPORTED", "malformed");
  }
  if (META_HOSTS.test(host)) return stateJson(c, "AUTH_REQUIRED", "meta_requires_authorised_app");
  if (OTHER_SOCIAL.test(host)) return stateJson(c, "UNSUPPORTED", "platform_has_no_official_import");

  const e = c.env as unknown as Record<string, string | undefined>;
  const testOrigin = !cfg.production && e.LINK_TEST_ORIGIN ? e.LINK_TEST_ORIGIN : null;
  const selfHost = new URL(c.req.url).hostname;
  let first: Awaited<ReturnType<typeof safeFetch>>;
  try {
    first = await safeFetch(url, LINK_VIDEO_MAX, dohResolver, testOrigin, selfHost);
  } catch {
    return stateJson(c, "UNAVAILABLE", "fetch_failed");
  }
  if ("blocked" in first) return stateJson(c, "UNSUPPORTED", `blocked:${first.blocked}`);
  if (first.status !== 200) return stateJson(c, "UNAVAILABLE", `http_${first.status}`);
  if (!first.body) return stateJson(c, "UNSUPPORTED", "too_large");

  const send = (bytes: Uint8Array, type: string, state: LinkState, kind: "image" | "video") =>
    new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { "content-type": type, "cache-control": "no-store", "x-link-state": state, "x-link-kind": kind } });

  const img = sniffImage(first.body);
  if (img && img !== "heic") {
    if (first.body.byteLength > IMAGE_MAX) return stateJson(c, "UNSUPPORTED", "image_too_large");
    return send(first.body, img, "SUPPORTED", "image");
  }
  const vid = isVideoBytes(first.body);
  if (vid) {
    if (first.body.byteLength > LINK_VIDEO_MAX) return stateJson(c, "UNSUPPORTED", "video_too_large");
    return send(first.body, vid, "SUPPORTED", "video");
  }
  if (first.contentType.includes("text/html") && first.body.byteLength <= HTML_MAX) {
    const og = ogImage(new TextDecoder().decode(first.body), first.finalUrl);
    if (!og) return stateJson(c, "UNSUPPORTED", "page_without_preview_image");
    let second: Awaited<ReturnType<typeof safeFetch>>;
    try {
      second = await safeFetch(og, IMAGE_MAX, dohResolver, testOrigin, selfHost);
    } catch {
      return stateJson(c, "UNAVAILABLE", "preview_fetch_failed");
    }
    if ("blocked" in second) return stateJson(c, "UNSUPPORTED", `blocked:${second.blocked}`);
    if (second.status !== 200 || !second.body) return stateJson(c, "UNAVAILABLE", "preview_unavailable");
    const k = sniffImage(second.body);
    if (!k || k === "heic") return stateJson(c, "UNSUPPORTED", "preview_not_an_image");
    return send(second.body, k, "PREVIEW_ONLY", "image");
  }
  return stateJson(c, "UNSUPPORTED", "not_an_image_or_video");
}
