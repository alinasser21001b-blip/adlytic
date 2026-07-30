/* ==================================================================
   QAREEB — THE DATA PLANE
   ==================================================================
   This is the thing whose absence made everything else theatre. Until now a
   patient's request was written to their own localStorage and nowhere else,
   so a pharmacist standing across the street could never see it. The core
   loop of the product — patient asks, pharmacy answers — was not incomplete,
   it was architecturally impossible. Every "3-second pharmacy response" and
   every radar animation was optimising a queue nobody could receive.

   ── WHY ONE BLOB PER RECORD, NEVER A SHARED LIST ──
   The audit endpoint stores its chain as a single list and does
   load → push → save with no compare-and-swap, because @netlify/blobs has no
   conditional write. Measured: 10 concurrent appends, 1 survivor. That bug is
   inherent to the shape, not to the code around it.

   So nothing here is ever a shared list. Every key has exactly ONE possible
   writer:
     r/<city>/<id>        the request        — written once, by the publisher
     a/<reqId>/<pharmId>  one pharmacy's answer — one pharmacy, one key
     x/<id>               a cancellation      — only the owner holds the token
   Two pharmacies answering the same request in the same millisecond write two
   different keys. There is no lost update because there is no shared cell.

   State is DERIVED on read (no answers → broadcasting; answers → acknowledged;
   past its TTL → expired), so no record is ever mutated after creation and the
   race has nowhere to live.

   ── WHAT IS STORED ──
   Only the domain layer's broadcast whitelist. No phone number, no landmark,
   no prescription photo, no free-text note ever reaches this server — the
   client sends QD.broadcastPayload() output and the server re-validates the
   shape and rejects anything carrying a forbidden key. The patient's identity
   is a hash of a token they keep; we cannot identify them and do not want to.
   ================================================================== */
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { json, misconfigured, secret, verify, rateLimit } from "./_lib.mjs";
import { ttlFor, CITY, ID, acceptPayload, stateOf, isLive, firstAnswer,
         publicView, answerView, validateAnswer } from "./_needs-core.mjs";

const STORE = "qareeb-needs";
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const nowIso = () => Date.now();

async function listUnder(store, prefix) {
  const out = [];
  try {
    const { blobs } = await store.list({ prefix });
    for (const b of blobs || []) {
      const v = await store.get(b.key, { type: "json" });
      if (v) out.push(v);
    }
  } catch { /* a listing failure must not look like "no requests" — see below */
    throw new Error("STORE_UNREADABLE");
  }
  return out;
}

export default async (request) => {
  if (!secret()) return misconfigured();
  let store;
  try { store = getStore(STORE); }
  catch { return json(503, { error: "NO_BLOB_STORE", ar: "تخزين الطلبات غير متاح على هذا النشر." }); }

  const url = new URL(request.url);
  const ip = request.headers.get("x-nf-client-connection-ip") || "unknown";
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const claims = verify(bearer);

  /* ==================== PUBLISH (patient, no account) ==================== */
  if (request.method === "POST" && url.pathname.endsWith("/needs")) {
    if (!rateLimit("pub:" + ip, 8, 60 * 60 * 1000)) {
      return json(429, { error: "TOO_MANY", ar: "طلبات كثيرة من هذا الجهاز. جرّب بعد شوية." });
    }
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }

    const id = "q" + crypto.randomBytes(6).toString("base64url");
    const check = acceptPayload(body && body.payload, id, nowIso());
    if (!check.ok) {
      const ar = check.reason === "CONTROLLED"
        ? "هذا الدواء خاضع للرقابة ولا يُنشر. راجع صيدلية مرخّصة بوصفة أصلية."
        : check.reason === "FORBIDDEN_FIELD" ? "الطلب يحمل حقلاً لا يجوز إرساله."
        : "الطلب غير مكتمل.";
      return json(check.reason === "CONTROLLED" ? 422 : 400,
        { error: check.reason, field: check.field || null, ar });
    }

    const ownerToken = crypto.randomBytes(24).toString("base64url");
    const rec = { ...check.record, ownerHash: sha(ownerToken) };

    await store.setJSON(`r/${rec.city}/${id}`, rec);
    /* The token is returned once and never stored in the clear. Losing it
       means losing the ability to read answers — which is the correct
       trade for a product that refuses to hold patient identities. */
    return json(200, { ok: true, id, ownerToken, createdAt: rec.createdAt,
      expiresAt: rec.createdAt + ttlFor(rec.urgency) * 60000 });
  }

  /* ============ THE PHARMACY QUEUE (signed session required) ============ */
  if (request.method === "GET" && url.pathname.endsWith("/needs")) {
    if (!claims) return json(401, { error: "AUTH_REQUIRED", ar: "تسجيل الصيدلية مطلوب." });
    const city = String(url.searchParams.get("city") || "");
    if (!CITY.test(city)) return json(400, { error: "BAD_CITY" });

    let recs;
    try { recs = await listUnder(store, `r/${city}/`); }
    catch { return json(503, { error: "STORE_UNREADABLE", ar: "تعذّرت قراءة الطلبات." }); }

    const out = [];
    for (const rec of recs) {
      const answers = await listUnder(store, `a/${rec.id}/`).catch(() => []);
      const cancelled = !!(await store.get(`x/${rec.id}`, { type: "json" }).catch(() => null));
      const st = stateOf(rec, answers, cancelled, nowIso());
      if (!isLive(st)) continue;
      out.push({ ...publicView(rec), state: st,
        answeredBy: answers.map((a) => a.pharmacyId),
        mine: answers.some((a) => a.pharmacyId === claims.pharmacyId) });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return json(200, { ok: true, city, count: out.length, requests: out });
  }

  /* ==================== ANSWER (signed session required) ================= */
  if (request.method === "POST" && url.pathname.endsWith("/answer")) {
    if (!claims) return json(401, { error: "AUTH_REQUIRED", ar: "تسجيل الصيدلية مطلوب." });
    if (!rateLimit("ans:" + claims.pharmacyId, 120, 60 * 1000)) {
      return json(429, { error: "TOO_MANY" });
    }
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }
    const reqId = String(body.requestId || "");
    const kind = String(body.kind || "");
    const v = validateAnswer(reqId, kind);
    if (!v.ok) return json(400, { error: v.reason });

    /* The answer is attributed from the SIGNED SESSION. A client that could
       name its own pharmacy could answer as a competitor. */
    const rec = { requestId: reqId, pharmacyId: claims.pharmacyId,
      pharmacistId: claims.pharmacistId, kind, at: nowIso(),
      licenseStatus: claims.licenseStatus || "UNKNOWN" };

    /* One key per (request, pharmacy): re-answering overwrites your own
       answer and can never touch anyone else's. */
    await store.setJSON(`a/${reqId}/${claims.pharmacyId}`, rec);

    const answers = await listUnder(store, `a/${reqId}/`).catch(() => [rec]);
    const first = firstAnswer(answers);
    return json(200, { ok: true, recorded: true,
      /* Both true claims are kept; only the first is surfaced as the answer,
         and the second pharmacy is told plainly rather than silently ignored. */
      first: first ? first.pharmacyId : claims.pharmacyId,
      wasFirst: first && first.pharmacyId === claims.pharmacyId,
      total: answers.length });
  }

  /* ============ THE PATIENT READING THEIR OWN REQUEST =================== */
  if (request.method === "GET" && url.pathname.endsWith("/mine")) {
    const id = String(url.searchParams.get("id") || "");
    const token = String(url.searchParams.get("t") || "");
    if (!ID.test(id) || !token) return json(400, { error: "BAD_REQUEST" });

    let rec = null;
    try {
      const { blobs } = await store.list({ prefix: "r/" });
      for (const b of blobs || []) {
        if (!b.key.endsWith("/" + id)) continue;
        rec = await store.get(b.key, { type: "json" });
        break;
      }
    } catch { return json(503, { error: "STORE_UNREADABLE" }); }
    if (!rec) return json(404, { error: "NOT_FOUND" });

    /* Constant-time, so this endpoint cannot be used to brute-force a token
       one byte at a time. */
    const a = Buffer.from(sha(token)), b = Buffer.from(rec.ownerHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(403, { error: "NOT_YOURS" });
    }

    const answers = await listUnder(store, `a/${id}/`).catch(() => []);
    const cancelled = !!(await store.get(`x/${id}`, { type: "json" }).catch(() => null));
    return json(200, {
      ok: true,
      request: { ...publicView(rec), state: stateOf(rec, answers, cancelled, nowIso()) },
      answers: answers.sort((x, y) => x.at - y.at).map(answerView),
    });
  }

  /* ==================== CANCEL (owner token only) ======================== */
  if (request.method === "POST" && url.pathname.endsWith("/cancel")) {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }
    const id = String(body.id || ""), token = String(body.ownerToken || "");
    if (!ID.test(id) || !token) return json(400, { error: "BAD_REQUEST" });

    let rec = null;
    try {
      const { blobs } = await store.list({ prefix: "r/" });
      for (const b of blobs || []) {
        if (!b.key.endsWith("/" + id)) continue;
        rec = await store.get(b.key, { type: "json" });
        break;
      }
    } catch { return json(503, { error: "STORE_UNREADABLE" }); }
    if (!rec) return json(404, { error: "NOT_FOUND" });

    const a = Buffer.from(sha(token)), b = Buffer.from(rec.ownerHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(403, { error: "NOT_YOURS" });
    }
    await store.setJSON(`x/${id}`, { at: nowIso() });
    return json(200, { ok: true, cancelled: true });
  }

  /* ==================== CAPABILITY PROBE ================================ */
  if (request.method === "GET") {
    return json(200, { ok: true, dataPlane: true, store: STORE,
      ar: "طبقة البيانات تعمل — الطلبات تُنشر وتصل الصيدليات." });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/needs{/*}?" };
