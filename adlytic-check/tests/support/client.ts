import { spawnSync } from "node:child_process";
import { MOCK } from "./instances";

export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

let n = 0;
export const newKey = () => `test${Date.now().toString(36)}${(n++).toString(36)}xxxxxxxxxxxx`.slice(0, 40);

export interface CheckFields {
  adCopy?: string;
  industry?: string;
  goal?: string;
  audience?: string;
  additionalContext?: string;
  idempotencyKey?: string;
  turnstileToken?: string;
  image?: { bytes: Uint8Array; type?: string; name?: string };
}

export class Client {
  jar = new Map<string, string>();
  constructor(public base: string) {}

  /** All cookies as one Cookie header value. */
  get cookie(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Origin: this.base, ...(this.jar.size ? { Cookie: this.cookie } : {}), ...extra };
  }

  capture(res: Response) {
    for (const set of res.headers.getSetCookie()) {
      const [pair, ...attrs] = set.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i).trim();
      const value = pair!.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || !value) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }

  /** GET without following redirects (for the login dance). */
  async nav(url: string) {
    const res = this.capture(await fetch(url.startsWith("http") ? url : `${this.base}${url}`, { headers: this.headers(), redirect: "manual" }));
    return { status: res.status, location: res.headers.get("location") ?? "" };
  }

  async session() {
    const res = this.capture(await fetch(`${this.base}/api/session`, { method: "POST", headers: this.headers() }));
    return { status: res.status, body: (await res.json()) as any };
  }

  form(f: CheckFields): FormData {
    const fd = new FormData();
    fd.append("industry", f.industry ?? "furniture");
    fd.append("goal", f.goal ?? "messages");
    if (f.adCopy !== undefined) fd.append("adCopy", f.adCopy);
    if (f.audience) fd.append("audience", f.audience);
    if (f.additionalContext) fd.append("additionalContext", f.additionalContext);
    fd.append("idempotencyKey", f.idempotencyKey ?? newKey());
    fd.append("turnstileToken", f.turnstileToken ?? "ok-token");
    if (f.image) fd.append("image", new Blob([f.image.bytes as Uint8Array<ArrayBuffer>], { type: f.image.type ?? "image/jpeg" }), f.image.name ?? "ad.jpg");
    return fd;
  }

  async check(f: CheckFields & { credit?: string; priceVersion?: string }) {
    const fd = this.form(f);
    if (f.credit) fd.append("credit", f.credit);
    if (f.priceVersion) fd.append("priceVersion", f.priceVersion);
    const res = await fetch(`${this.base}/api/check`, { method: "POST", headers: this.headers(), body: fd });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  }

  async req(method: string, path: string, body?: unknown) {
    const res = this.capture(
      await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers(body !== undefined ? { "Content-Type": "application/json" } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* html */
    }
    return { status: res.status, body: parsed, text, headers: res.headers };
  }
}

export async function mockState(): Promise<{ calls: number; last: any; siteverifyCalls: number; asrCalls: number }> {
  return (await fetch(`${MOCK}/__state`)).json() as any;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run SQL directly against an instance's local D1 (test setup only). */
export function d1(dir: string, sql: string): any[] {
  const r = spawnSync("npx", ["wrangler", "d1", "execute", "adlytic-check-db", "--local", "--persist-to", dir, "--json", "--command", sql], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" },
  });
  if (r.status !== 0) throw new Error(`d1 execute failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout)[0]?.results ?? [];
}

/** Full Google login through the fake IdP. Returns the final redirect target. */
export async function login(c: Client, sub: string, returnTo = "/"): Promise<string> {
  if (!c.jar.has("ac_sid")) await c.session();
  const start = await c.nav(`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`);
  if (start.status !== 302) throw new Error(`start: ${start.status}`);
  const idp = new URL(start.location);
  idp.searchParams.set("sub", sub);
  const back = await fetch(idp, { redirect: "manual" });
  const cb = await c.nav(back.headers.get("location")!);
  return cb.location;
}

/** 16 kHz mono 16-bit WAV: a tone (audible) or silence. */
export function wav16k(seconds: number, amplitude = 0.3, freq = 440): Uint8Array {
  const n = Math.round(seconds * 16_000);
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16_000, 24);
  out.writeUInt32LE(32_000, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / 16_000) * amplitude * 32767), 44 + i * 2);
  return new Uint8Array(out);
}
