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
  cookie = "";
  constructor(public base: string) {}

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Origin: this.base, ...(this.cookie ? { Cookie: this.cookie } : {}), ...extra };
  }

  private capture(res: Response) {
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return res;
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

  async check(f: CheckFields) {
    const res = await fetch(`${this.base}/api/check`, { method: "POST", headers: this.headers(), body: this.form(f) });
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
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: this.headers(body !== undefined ? { "Content-Type": "application/json" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
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

export async function mockState(): Promise<{ calls: number; last: any; siteverifyCalls: number }> {
  return (await fetch(`${MOCK}/__state`)).json() as any;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
