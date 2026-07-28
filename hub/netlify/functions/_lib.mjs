/* ==================================================================
   QAREEB — SERVER SHARED LIBRARY
   ==================================================================
   The pieces both endpoints need, in one place so the security-relevant
   code has exactly one implementation to review.

   FAIL CLOSED. Every function here refuses rather than degrades. A signing
   secret that is missing does not fall back to an empty key — it returns a
   configuration error and the endpoint 503s, because an auth system that
   silently accepts everything when misconfigured is worse than no auth
   system at all: it looks like protection.
   ================================================================== */
import crypto from "node:crypto";

/* ---------- configuration ---------- */
export function secret() {
  const s = process.env.QAREEB_AUTH_SECRET;
  /* 32 chars is not a guess: below that a brute force is cheap enough to be
     worth someone's afternoon, and the cost of a longer secret is zero. */
  if (!s || s.length < 32) return null;
  return s;
}

export const json = (status, body, headers = {}) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  body: JSON.stringify(body),
});

export const misconfigured = () =>
  json(503, { error: "NOT_CONFIGURED",
    ar: "الخادم غير مهيّأ — لم يُضبط مفتاح التوقيع.",
    detail: "Set QAREEB_AUTH_SECRET (>=32 chars) in the Netlify environment." });

/* ---------- tokens ----------
   A compact signed token: base64url(payload).base64url(hmac). Not a JWT,
   because a JWT invites `alg: none` mistakes and we need exactly one
   algorithm. Verification is constant-time — a comparison that returns early
   on the first wrong byte leaks the signature one byte at a time. */
const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function sign(payload, ttlSeconds = 12 * 3600) {
  const key = secret();
  if (!key) return null;
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  const p = b64u(JSON.stringify(body));
  const mac = crypto.createHmac("sha256", key).update(p).digest("base64url");
  return p + "." + mac;
}

export function verify(token) {
  const key = secret();
  if (!key || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const p = token.slice(0, dot), mac = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", key).update(p).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(p, "base64url").toString("utf8")); } catch { return null; }
  if (!body.exp || Date.now() > body.exp) return null;
  return body;
}

/* ---------- one-time codes ----------
   Derived from the secret, the phone and a coarse time window rather than
   stored, so a verification needs no shared state between the request and
   the check. The window is 10 minutes with the previous one still accepted,
   which is the difference between "arrived a bit late" and "locked out". */
export function otpFor(phone, windowOffset = 0) {
  const key = secret();
  if (!key) return null;
  const win = Math.floor(Date.now() / (10 * 60 * 1000)) + windowOffset;
  const mac = crypto.createHmac("sha256", key).update(`otp:${phone}:${win}`).digest();
  return String(mac.readUInt32BE(0) % 1000000).padStart(6, "0");
}

export function otpValid(phone, code) {
  const c = String(code || "").trim();
  if (!/^\d{6}$/.test(c)) return false;
  /* Both candidates are always computed, and the result is OR-ed at the end,
     so the answer takes the same time whichever window matched. */
  const a = otpFor(phone, 0), b = otpFor(phone, -1);
  if (!a || !b) return false;
  const eq = (x) => x.length === c.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(c));
  const m1 = eq(a), m2 = eq(b);
  return m1 || m2;
}

/* ---------- input ---------- */
export const IQ_PHONE = /^964(7[3-9])\d{8}$/;

/* Accepts what Iraqis actually type — 07XX, +9647XX, spaces, dashes — and
   returns one canonical form or null. A validator that only accepts the
   canonical form is a validator that rejects real users. */
export function normalisePhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "964" + d.slice(1);
  if (/^7[3-9]\d{8}$/.test(d)) d = "964" + d;
  return IQ_PHONE.test(d) ? d : null;
}

/* Placeholder numbers must never authenticate anything. They exist in the
   seed data and would otherwise be the easiest credential in the system. */
export const isPlaceholderPhone = (p) => /^9647700000/.test(String(p || ""));

export const LICENCE = /^IQ-PH-\d{4,8}$/;

/* ---------- audit hashing ----------
   SHA-256 over the previous hash and a canonical serialisation. Server-side
   this is a real commitment: the client never sees the chain's write path,
   so an entry cannot be rewritten without the secret and the store. */
export function entryHash(previousHash, entry) {
  const body = JSON.stringify({
    action: entry.action, actor: entry.actor ?? null, subject: entry.subject ?? null,
    pharmacyId: entry.pharmacyId ?? null, reason: entry.reason ?? null, at: entry.at,
  });
  return crypto.createHash("sha256").update(previousHash + body).digest("hex").slice(0, 32);
}

export const GENESIS = "0".repeat(32);

export function verifyChain(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (e.previousHash !== prev || e.entryHash !== entryHash(prev, e)) return i;
    prev = e.entryHash;
  }
  return -1;
}

/* ---------- rate limiting ----------
   In-memory and therefore per-instance: it blunts a script, it does not stop
   a distributed attacker. Stated plainly rather than described as
   "rate limiting" and left to imply more than it does. */
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  if (rec.n >= max) return false;
  rec.n++;
  return true;
}
