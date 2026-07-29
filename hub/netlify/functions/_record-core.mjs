/* ==================================================================
   QAREEB — RECORD DATA-PLANE DECISIONS
   ==================================================================
   Every rule the record endpoint applies, as pure functions of their
   arguments. No storage, no network, no crypto — so `tools/test-record-plane.mjs`
   exercises the shipped logic rather than a mock's impression of it.

   `record.mjs` is the adapter: it does I/O and calls these.

   WHY THE SERVER RE-CHECKS WHAT THE CLIENT ALREADY CHECKED.

   js/consent.js decides access on the client and js/emr.js refuses religion
   at registration. Both are real and both are useless as security: they run
   on a device the user controls. A client-side rule is a UX affordance — it
   stops honest mistakes and shapes the interface. The rule that actually
   holds is the one on the far side of the wire, and it must be written
   independently rather than trusting a flag the client sent.

   So the whole consent decision is recomputed here from server-held shares,
   the forbidden-field list is enforced again, and nothing the client asserts
   about who it is survives contact with the token.
   ================================================================== */

/* ---------- what may be written ---------- */

/* One collection per clinical concept, and a closed set. An endpoint that
   accepts an arbitrary collection name is a key-value store with a health
   app's authentication in front of it. */
export const COLLECTIONS = [
  "patient", "conditions", "medications", "allergies", "procedures",
  "results", "documents", "immunizations", "encounters", "prescriptions",
  "episodes", "tasks", "appointments", "orders", "studies", "referrals",
  "dispenses", "shares",
];

/* Collections nobody may overwrite once written. A correction is a new
   record with a pointer, never an edit — the same rule js/emr.js applies to
   a signed encounter, enforced where it cannot be bypassed. */
export const IMMUTABLE = ["encounters", "prescriptions", "results", "studies", "documents"];

/* Fields refused at the boundary, restating js/emr.js's list server-side.
   Religion is printed on the Iraqi National Card and Article 26 of the card
   law makes the designation legally coercive; with no data protection law in
   force, a queryable table of citizens with religion attached is a targeting
   asset. A client that stripped it is doing the right thing. A server that
   trusts the client to have stripped it is not doing anything. */
export const FORBIDDEN_FIELDS = ["religion", "sect", "ethnicity", "cardImage",
  "idImage", "idPhoto", "biometric", "الديانة", "المذهب", "القومية"];

export const ID = /^[A-Za-z0-9_-]{3,64}$/;
export const OP_ID = /^[A-Za-z0-9_-]{6,80}$/;
export const OPS = ["create", "update", "append"];

/* A single clinical record is small. 256 KB is roomy for a signed encounter
   with addenda and nowhere near enough to smuggle an image, which belongs in
   object storage with its own consent, not in a record row. */
export const MAX_RECORD_BYTES = 256 * 1024;
export const MAX_BATCH = 25;

export function validateEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return { ok: false, reason: "NO_ENTRY" };
  if (!OP_ID.test(String(e.opId || ""))) return { ok: false, reason: "BAD_OP_ID" };
  if (!OPS.includes(String(e.op))) return { ok: false, reason: "BAD_OP" };
  if (!COLLECTIONS.includes(String(e.collection))) return { ok: false, reason: "BAD_COLLECTION" };
  if (!ID.test(String(e.id || ""))) return { ok: false, reason: "BAD_ID" };
  if (!e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) {
    return { ok: false, reason: "BAD_PAYLOAD" };
  }
  const bad = FORBIDDEN_FIELDS.filter((k) => Object.prototype.hasOwnProperty.call(e.payload, k));
  if (bad.length) return { ok: false, reason: "FORBIDDEN_FIELD", fields: bad };
  const size = JSON.stringify(e.payload).length;
  if (size > MAX_RECORD_BYTES) return { ok: false, reason: "TOO_LARGE", size };
  /* baseRev must be absent (a create) or a number (an update from a known
     revision). A string, or null on an update, means the client does not
     know what it is editing — which is exactly the case that must not
     silently win. */
  if (e.baseRev != null && !Number.isInteger(e.baseRev)) return { ok: false, reason: "BAD_BASE_REV" };
  return { ok: true };
}

/* ---------- who may write what ---------- */

export const ACTOR = { PATIENT: "patient", CLINICIAN: "clinician", FACILITY: "facility" };

/* The patient owns their record and may write the things a patient can
   honestly assert: their own demographics, the documents they hold, the
   history they remember. They may NOT write into the lists a prescriber
   relies on — a patient-asserted diagnosis is a claim, and claims travel
   through the document-extraction path where a clinician decides. */
export const PATIENT_WRITABLE = ["patient", "documents", "appointments", "shares", "immunizations"];

/* A clinician may write clinical assertions — with an active share, checked
   below, and a verified licence, checked by the caller against the token. */
export const CLINICIAN_WRITABLE = ["conditions", "medications", "allergies", "procedures",
  "encounters", "prescriptions", "episodes", "tasks", "orders", "referrals", "documents", "results"];

/* A facility (lab, imaging centre, pharmacy) writes only its own output, and
   only against an order that names it. This is the narrowest of the three
   and deliberately so: a lab token that could write a diagnosis would be the
   softest target in the system. */
export const FACILITY_WRITABLE = ["results", "studies", "dispenses"];

export function canWrite(actor, collection, ctx) {
  if (!actor || !actor.kind) return { ok: false, reason: "NO_ACTOR" };
  const { patientId, shares, now, order } = ctx || {};

  if (actor.kind === ACTOR.PATIENT) {
    if (actor.id !== patientId) return { ok: false, reason: "NOT_YOUR_RECORD" };
    if (!PATIENT_WRITABLE.includes(collection)) return { ok: false, reason: "PATIENT_CANNOT_WRITE" };
    return { ok: true, basis: "SELF" };
  }

  if (actor.kind === ACTOR.CLINICIAN) {
    if (!CLINICIAN_WRITABLE.includes(collection)) return { ok: false, reason: "COLLECTION_NOT_WRITABLE" };
    if (actor.licenseStatus !== "VERIFIED") return { ok: false, reason: "UNVERIFIED_CLINICIAN" };
    const share = activeShareFor(shares, actor.id, patientId, now);
    if (!share) return { ok: false, reason: "NO_ACTIVE_SHARE" };
    return { ok: true, basis: "SHARE", shareId: share.id };
  }

  if (actor.kind === ACTOR.FACILITY) {
    if (!FACILITY_WRITABLE.includes(collection)) return { ok: false, reason: "COLLECTION_NOT_WRITABLE" };
    /* A facility's authority comes from the ORDER, not from a share. Nobody
       asked the patient's permission for the lab to return the result they
       ordered — the consent was given when the test was agreed to. But the
       order must name this facility, or any lab could write into any chart. */
    if (collection !== "dispenses") {
      if (!order) return { ok: false, reason: "ORDER_REQUIRED" };
      if (order.patientId !== patientId) return { ok: false, reason: "ORDER_PATIENT_MISMATCH" };
      if (order.performerId && order.performerId !== actor.id) {
        return { ok: false, reason: "ORDER_NOT_YOURS" };
      }
    }
    return { ok: true, basis: "ORDER", orderId: order ? order.id : null };
  }
  return { ok: false, reason: "UNKNOWN_ACTOR_KIND" };
}

export function activeShareFor(shares, granteeId, patientId, now) {
  return (shares || []).find((s) =>
    s.granteeId === granteeId && s.patientId === patientId &&
    s.state !== "revoked" && new Date(s.expiresAt).getTime() > now) || null;
}

/* ---------- applying a write ---------- */

/* The revision check. `existing` is what the store holds right now; `entry`
   carries the revision the client started from.

   ⚠ HONEST LIMITATION, STATED WHERE IT MATTERS. @netlify/blobs 8.x has no
   compare-and-set, so between reading `existing` and writing the result
   there is a window — roughly a network round trip — in which another writer
   can land. This check therefore catches the ordinary case (two devices, one
   of them stale) and cannot catch a true simultaneous write.

   What makes that survivable rather than dangerous is the shape of the data,
   not the check: the collections where a lost update would destroy a
   clinical assertion are IMMUTABLE, so they never read-modify-write at all —
   a second write to the same id is refused outright rather than merged. The
   window only exists for mutable lists, where both writes are recorded in
   the audit trail and the superseded value stays readable. */
export function applyWrite(existing, entry, actor, at) {
  const immutable = IMMUTABLE.includes(entry.collection);

  if (!existing) {
    if (entry.op === "update" && entry.baseRev != null) {
      /* The client thinks it is editing something that is not here. That is
         not a create — it is a sign the two sides disagree about the world. */
      return { ok: false, conflict: true, reason: "NOT_FOUND", serverRev: null };
    }
    return { ok: true, record: stamp(entry.payload, entry, actor, at, 1) };
  }

  if (immutable) {
    /* Already written, and it may not be rewritten. If the op ids match this
       is a retry of a request whose response was lost, and the honest answer
       is the acknowledgement the client never received — not an error, and
       not a second copy. */
    if (existing.qOpId === entry.opId) {
      return { ok: true, record: existing, replayed: true };
    }
    return { ok: false, conflict: true, reason: "IMMUTABLE",
      serverRev: existing.qRev, serverPayload: existing };
  }

  if (existing.qOpId === entry.opId) return { ok: true, record: existing, replayed: true };

  if (entry.baseRev == null) {
    return { ok: false, conflict: true, reason: "BASE_REV_REQUIRED", serverRev: existing.qRev };
  }
  if (entry.baseRev !== existing.qRev) {
    return { ok: false, conflict: true, reason: "STALE",
      serverRev: existing.qRev, serverPayload: existing };
  }
  return { ok: true, record: stamp(entry.payload, entry, actor, at, existing.qRev + 1) };
}

/* Server-owned fields, prefixed so they cannot collide with clinical ones
   and cannot be forged: whatever the client sent under these names is
   discarded and rewritten here. */
function stamp(payload, entry, actor, at, rev) {
  const { qRev, qOpId, qWrittenBy, qWrittenAt, qActorKind, ...clean } = payload;
  return { ...clean, id: entry.id,
    qRev: rev, qOpId: entry.opId, qWrittenBy: actor.id,
    qActorKind: actor.kind, qWrittenAt: at };
}

/* ---------- reading ---------- */

/* Which collections a scope opens. The mapping lives here rather than in the
   client so a reader cannot widen it by asking differently. */
export const SCOPE_COLLECTIONS = {
  summary: ["patient", "conditions", "medications", "allergies"],
  allergies: ["allergies"],
  medications: ["medications", "prescriptions"],
  conditions: ["conditions"],
  procedures: ["procedures"],
  labs: ["results", "orders"],
  imaging: ["studies", "orders"],
  documents: ["documents"],
  encounters: ["encounters"],
  immunizations: ["immunizations"],
  timeline: ["encounters", "conditions", "medications", "results", "procedures", "studies"],
};

/* Emergency tier 1 — the same restricted dataset js/consent.js defines,
   restated server-side because that is where it is enforced. */
export const EMERGENCY_COLLECTIONS = ["patient", "allergies", "medications", "conditions"];

export function readableCollections(decision) {
  if (!decision || !decision.ok) return [];
  if (decision.basis === "SELF") return COLLECTIONS;
  if (decision.basis === "BREAK_GLASS") {
    return decision.tier === "full" ? COLLECTIONS : EMERGENCY_COLLECTIONS;
  }
  const out = new Set();
  for (const s of decision.scopes || []) {
    for (const c of SCOPE_COLLECTIONS[s] || []) out.add(c);
  }
  return [...out];
}

/* What leaves the server for a reader who is not the patient. Identifier
   VALUES never travel — a clinician sees that a national card is on file and
   how well it is verified, not the number, because a number in a response is
   a number in a log, a cache and a screenshot. */
export function patientView(patient, isSelf) {
  if (!patient) return null;
  if (isSelf) return patient;
  const { identifiers, ...rest } = patient;
  return { ...rest, identifiers: (identifiers || []).map((i) => ({
    type: i.type, verification: i.verification || "self_declared",
    validFrom: i.validFrom || null, validTo: i.validTo || null })) };
}

/* ---------- audit ---------- */

/* Six questions, and the server fills in the ones a client must not be
   trusted with: who (from the token, not the body) and when (server clock,
   because a device with a wrong clock would otherwise reorder history). */
export function auditEntry(ctx, decision, at) {
  const { actor, patientId, action, collection, recordId, scope, purpose, context } = ctx || {};
  const d = decision || {};
  return {
    at, patientId,
    actorId: actor && actor.id || null,
    actorKind: actor && actor.kind || null,
    organizationId: actor && actor.organizationId || null,
    action, collection: collection || null, recordId: recordId || null,
    scope: scope || null,
    purpose: purpose || null,
    context: context ? { facilityId: context.facilityId || null,
      deviceId: context.deviceId || null, channel: context.channel || null } : null,
    granted: !!d.ok,
    basis: d.basis || null,
    authority: d.shareId ? { kind: "SHARE", id: d.shareId }
      : d.basis === "BREAK_GLASS" ? { kind: "BREAK_GLASS", tier: d.tier || "critical" }
      : d.basis === "ORDER" ? { kind: "ORDER", id: d.orderId || null }
      : d.basis === "SELF" ? { kind: "SELF" } : null,
    reason: d.reason || null,
  };
}

/* ---------- the read decision ---------- */

/* The whole consent decision, recomputed from server state. It deliberately
   mirrors js/consent.js decideAccess rather than importing it: the client
   module is a browser global and this runs in Node, and more importantly a
   security rule with one implementation shared across a trust boundary is a
   rule that can be weakened from the untrusted side. */
export function decideRead(ctx) {
  const { actor, patientId, scope, shares, breakGlass, now } = ctx || {};
  if (!actor || !actor.id) return { ok: false, reason: "NO_ACTOR", auditRequired: true };
  if (!patientId) return { ok: false, reason: "NO_PATIENT", auditRequired: true };

  if (actor.kind === ACTOR.PATIENT && actor.id === patientId) {
    return { ok: true, basis: "SELF", scopes: Object.keys(SCOPE_COLLECTIONS), auditRequired: false };
  }

  if (breakGlass && breakGlass.actorId === actor.id && breakGlass.patientId === patientId
      && now < new Date(breakGlass.expiresAt).getTime()) {
    const full = breakGlass.tier === "full";
    const cols = full ? COLLECTIONS : EMERGENCY_COLLECTIONS;
    if (scope) {
      const wanted = SCOPE_COLLECTIONS[scope] || [];
      const allowed = wanted.every((c) => cols.includes(c));
      if (!allowed) {
        return { ok: false, basis: "BREAK_GLASS", reason: "BEYOND_EMERGENCY_DATASET",
          escalationAvailable: true, mustNotify: true, auditRequired: true };
      }
    }
    return { ok: true, basis: "BREAK_GLASS", tier: breakGlass.tier || "critical",
      scopes: full ? Object.keys(SCOPE_COLLECTIONS) : ["summary", "allergies", "medications", "conditions"],
      mustNotify: true, auditRequired: true };
  }

  const share = activeShareFor(shares, actor.id, patientId, now);
  if (!share) return { ok: false, reason: "NO_ACTIVE_SHARE", auditRequired: true };
  if (scope && !(share.scopes || []).includes(scope)) {
    return { ok: false, basis: "SHARE", reason: "SCOPE_NOT_GRANTED",
      scopes: share.scopes, auditRequired: true };
  }
  return { ok: true, basis: "SHARE", shareId: share.id, scopes: share.scopes,
    expiresAt: share.expiresAt, auditRequired: true };
}
