/* ==================================================================
   QAREEB — THE RECORD DATA PLANE
   ==================================================================
   The endpoint the client's outbox talks to. Until this existed, the whole
   longitudinal record lived in one browser's localStorage: a patient could
   build a complete history on their phone and the doctor sitting in front of
   them could not see one line of it. The sync machinery in js/sync.js was
   written, tested and had nothing to speak to.

   ── ONE BLOB PER RECORD, NEVER A SHARED LIST ──
   The same discipline as needs.mjs, for the same measured reason: the audit
   endpoint's single-list shape lost 9 of 10 concurrent appends because
   @netlify/blobs 8.x has no compare-and-set. So every key here has one
   natural writer:

     p/<pid>/<collection>/<id>   one clinical record
     p/<pid>/shares/<shareId>    one share — only the patient writes it
     p/<pid>/audit/<ts>-<rand>   one audit entry — append-only, never read-modified
     p/<pid>/ops/<opId>          the idempotency ledger

   Two clinicians writing two conditions write two keys. There is no lost
   update because there is no shared cell.

   ── WHAT STILL RACES, SAID PLAINLY ──
   Updating ONE mutable record is read-modify-write, and without CAS there is
   a window of roughly a round trip. `_record-core.mjs` explains why that is
   survivable: the collections where a lost update would destroy a clinical
   assertion are immutable and never read-modify-write at all. This is a
   known, bounded gap, not a solved problem, and it is written here rather
   than discovered later.

   ── WHAT THE SERVER DOES NOT TRUST ──
   Anything the client says about who it is. The actor comes from the token
   and nowhere else. The consent decision is recomputed from server-held
   shares. The forbidden-field list is applied again. A client-side rule is a
   UX affordance; this is the one that holds.
   ================================================================== */
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { json, misconfigured, secret, verify, rateLimit } from "./_lib.mjs";
import {
  MAX_BATCH, COLLECTIONS, validateEntry, canWrite, applyWrite,
  decideRead, readableCollections, patientView, auditEntry, ACTOR,
} from "./_record-core.mjs";

const STORE = "qareeb-record";
const now = () => Date.now();
const rand = () => crypto.randomBytes(6).toString("hex");

const key = {
  rec: (pid, col, id) => `p/${pid}/${col}/${id}`,
  colPrefix: (pid, col) => `p/${pid}/${col}/`,
  share: (pid, sid) => `p/${pid}/shares/${sid}`,
  sharePrefix: (pid) => `p/${pid}/shares/`,
  audit: (pid, at) => `p/${pid}/audit/${String(at).padStart(14, "0")}-${rand()}`,
  auditPrefix: (pid) => `p/${pid}/audit/`,
  op: (pid, opId) => `p/${pid}/ops/${opId}`,
  bg: (pid, actorId) => `p/${pid}/bg/${actorId}`,
};

async function listUnder(store, prefix, limit) {
  const out = [];
  try {
    const { blobs } = await store.list({ prefix });
    for (const b of (blobs || []).slice(0, limit || 5000)) {
      const v = await store.get(b.key, { type: "json" });
      if (v) out.push(v);
    }
  } catch {
    /* A listing failure must never look like "this patient has no allergies".
       Empty and unreadable are opposite clinical facts. */
    throw new Error("STORE_UNREADABLE");
  }
  return out;
}

/* The token is the only source of identity. `kind` decides which of the
   three write policies applies, and a token that does not name one is not a
   token we act on. */
function actorFrom(request) {
  const auth = request.headers.get("authorization") || "";
  const t = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const body = t && verify(t);
  if (!body || !body.sub || !body.kind) return null;
  if (![ACTOR.PATIENT, ACTOR.CLINICIAN, ACTOR.FACILITY].includes(body.kind)) return null;
  return { id: body.sub, kind: body.kind, licenseStatus: body.licenseStatus || null,
    organizationId: body.org || null, name: body.name || null };
}

export default async (request) => {
  if (!secret()) return misconfigured();

  const url = new URL(request.url);
  const seg = url.pathname.replace(/^.*\/record\/?/, "").split("/").filter(Boolean);
  const actor = actorFrom(request);
  if (!actor) return json(401, { error: "UNAUTHENTICATED", ar: "الجلسة غير صالحة." });

  /* Keyed on the actor, not the IP: a clinic behind one connection is many
     legitimate users, and an attacker with a valid token is the case that
     matters. Blunts a script; does not stop a distributed attacker. Stated
     rather than implied. */
  if (!rateLimit("rec:" + actor.id, 240, 60 * 1000)) {
    return json(429, { error: "RATE_LIMITED", ar: "طلبات كثيرة — انتظر دقيقة." });
  }

  const store = getStore(STORE);

  try {
    if (request.method === "POST" && seg[0] === "sync") return await sync(request, store, actor);
    if (request.method === "GET" && seg[0] === "read") return await read(url, store, actor);
    if (request.method === "GET" && seg[0] === "audit") return await audit(url, store, actor);
    if (request.method === "POST" && seg[0] === "ids") return await ids(request, store, actor);
    return json(404, { error: "NOT_FOUND" });
  } catch (e) {
    if (String(e.message) === "STORE_UNREADABLE") {
      /* 503, never an empty array. A record that cannot be read is not a
         record that is empty, and a clinician must be told which one it is. */
      return json(503, { error: "STORE_UNREADABLE",
        ar: "ما نقدر نقرأ السجل الآن — لا تعتبره فارغاً." });
    }
    return json(500, { error: "SERVER_ERROR" });
  }
};

/* ==================================================================
   SYNC — the outbox lands here
   ================================================================== */
async function sync(request, store, actor) {
  let body;
  try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }
  const patientId = String(body.patientId || "");
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!patientId) return json(400, { error: "PATIENT_REQUIRED" });
  if (!entries.length) return json(400, { error: "NO_ENTRIES" });
  if (entries.length > MAX_BATCH) return json(400, { error: "BATCH_TOO_LARGE", max: MAX_BATCH });

  const at = now();
  const shares = await listUnder(store, key.sharePrefix(patientId), 500);
  const results = [];

  for (const entry of entries) {
    const v = validateEntry(entry);
    if (!v.ok) { results.push({ opId: entry && entry.opId, outcome: "rejected", reason: v.reason, fields: v.fields }); continue; }

    /* The idempotency ledger is consulted BEFORE the write, so a retry whose
       first response was lost gets the acknowledgement it never received
       rather than creating a second clinical assertion. */
    const seen = await store.get(key.op(patientId, entry.opId), { type: "json" });
    if (seen) { results.push({ opId: entry.opId, outcome: "ack", rev: seen.rev, replayed: true }); continue; }

    /* A facility writing a result needs the order that names it. */
    let order = null;
    if (actor.kind === ACTOR.FACILITY && entry.payload && entry.payload.orderId) {
      order = await store.get(key.rec(patientId, "orders", String(entry.payload.orderId)), { type: "json" });
    }

    const w = canWrite(actor, entry.collection, { patientId, shares, now: at, order });
    if (!w.ok) {
      await writeAudit(store, patientId, { actor, patientId, action: "write",
        collection: entry.collection, recordId: entry.id, purpose: body.purpose,
        context: body.context }, { ok: false, reason: w.reason }, at);
      results.push({ opId: entry.opId, outcome: "rejected", reason: w.reason });
      continue;
    }

    const existing = await store.get(key.rec(patientId, entry.collection, entry.id), { type: "json" });
    const a = applyWrite(existing, entry, actor, at);
    if (!a.ok) {
      results.push({ opId: entry.opId, outcome: "conflict", reason: a.reason,
        serverRev: a.serverRev, serverPayload: a.serverPayload || null });
      continue;
    }

    if (!a.replayed) {
      await store.setJSON(key.rec(patientId, entry.collection, entry.id), a.record);
    }
    await store.setJSON(key.op(patientId, entry.opId), { rev: a.record.qRev, at });
    await writeAudit(store, patientId, { actor, patientId, action: "write",
      collection: entry.collection, recordId: entry.id, purpose: body.purpose,
      context: body.context }, w, at);
    results.push({ opId: entry.opId, outcome: "ack", rev: a.record.qRev, replayed: !!a.replayed });
  }

  /* Per-entry outcomes, never one overall boolean. A batch where three
     entries landed and one conflicted is not "failed", and telling the
     client it was is how the three that landed get sent again. */
  return json(200, { at, results });
}

/* ==================================================================
   READ — the record, scoped
   ================================================================== */
async function read(url, store, actor) {
  const patientId = url.searchParams.get("patient") || "";
  const scope = url.searchParams.get("scope") || null;
  const purpose = url.searchParams.get("purpose") || null;
  if (!patientId) return json(400, { error: "PATIENT_REQUIRED" });

  const at = now();
  const shares = await listUnder(store, key.sharePrefix(patientId), 500);
  const bg = await store.get(key.bg(patientId, actor.id), { type: "json" });

  const decision = decideRead({ actor, patientId, scope, shares, breakGlass: bg, now: at });
  if (decision.auditRequired) {
    await writeAudit(store, patientId, { actor, patientId, action: "read", scope, purpose,
      context: ctxFrom(url) }, decision, at);
  }
  if (!decision.ok) {
    return json(403, { error: decision.reason, basis: decision.basis || null,
      escalationAvailable: !!decision.escalationAvailable,
      ar: decision.reason === "NO_ACTIVE_SHARE" ? "ما عندك إذن من المريض."
        : decision.reason === "BEYOND_EMERGENCY_DATASET" ? "هذا خارج بطاقة الطوارئ — يحتاج تصعيداً."
        : "ممنوع." });
  }

  const cols = readableCollections(decision);
  const isSelf = decision.basis === "SELF";
  const out = {};
  for (const c of cols) {
    if (c === "patient") {
      const p = await store.get(key.rec(patientId, "patient", patientId), { type: "json" });
      out.patient = patientView(p, isSelf);
      continue;
    }
    out[c] = await listUnder(store, key.colPrefix(patientId, c), 2000);
  }
  /* The reader is told the shape of their own access, so a UI can render
     "not shared" instead of "none recorded" — two states that look identical
     and mean opposite things. */
  return json(200, { at, basis: decision.basis, tier: decision.tier || null,
    scopes: decision.scopes, collections: cols, expiresAt: decision.expiresAt || null,
    record: out });
}

/* ==================================================================
   AUDIT — the patient's own log
   ================================================================== */
async function audit(url, store, actor) {
  const patientId = url.searchParams.get("patient") || "";
  if (!patientId) return json(400, { error: "PATIENT_REQUIRED" });
  /* Only the patient reads their own access log. A clinician who could read
     it would learn which other clinicians the patient sees, which is a
     disclosure the patient never consented to and one that matters in a
     small city. */
  if (!(actor.kind === ACTOR.PATIENT && actor.id === patientId)) {
    return json(403, { error: "PATIENT_ONLY", ar: "سجل الوصول للمريض وحده." });
  }
  const rows = await listUnder(store, key.auditPrefix(patientId), 1000);
  rows.sort((a, b) => b.at - a.at);
  return json(200, { at: now(), entries: rows });
}

/* ==================================================================
   IDS — the reserved pool, DHIS2's pattern
   ================================================================== */
async function ids(request, store, actor) {
  let body; try { body = await request.json(); } catch { body = {}; }
  const n = Math.min(Math.max(parseInt(body.count, 10) || 50, 1), 200);
  /* Server-issued so two clinics registering during the same outage cannot
     collide, and readable so a human can say one down a phone line. */
  const out = [];
  for (let i = 0; i < n; i++) out.push("Q" + crypto.randomBytes(8).toString("base64url").replace(/[-_]/g, "").slice(0, 10).toUpperCase());
  return json(200, { ids: out, issuedAt: now() });
}

/* ------------------------------------------------------------------ */
async function writeAudit(store, patientId, ctx, decision, at) {
  const entry = auditEntry(ctx, decision, at);
  /* Append-only, one key per entry. The audit chain in audit.mjs stores a
     single list and demonstrably loses concurrent appends; this cannot,
     because nothing ever reads the log to write it. */
  try { await store.setJSON(key.audit(patientId, at), entry); }
  catch { /* A failed audit write must not swallow the operation's own
             result, but it must not be silent either — it is surfaced by the
             log simply being shorter than the client's own count. */ }
}

const ctxFrom = (url) => ({
  facilityId: url.searchParams.get("facility") || null,
  deviceId: url.searchParams.get("device") || null,
  channel: "app",
});
