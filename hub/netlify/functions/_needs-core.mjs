/* ==================================================================
   QAREEB — DATA-PLANE DECISIONS
   ==================================================================
   Every rule the data plane applies, as pure functions of their arguments.
   No storage, no network, no crypto side effects — so `tools/test-needs.mjs`
   can exercise the actual shipped logic instead of a mock's impression of it.

   needs.mjs is the adapter: it does I/O and calls these. The split exists
   because the rules here are the ones that can hurt someone — what may be
   published, what is stored, who may read it — and a rule that cannot be
   tested is a rule you are guessing about.
   ================================================================== */

/* Urgency-scaled lifetime, mirroring js/domain.js TTL_BY_URGENCY. */
export const TTL_MIN = { urgent: 360, high: 1440, normal: 4320 };
export const ttlFor = (u) => TTL_MIN[u] || TTL_MIN.normal;

/* Controlled medicines never enter the public queue. The client refuses them
   too; a server that trusts the client to have refused is not a check. Both
   must pass, and the stricter one wins. */
export const CONTROLLED_VARIANTS = new Set(["x9a", "x10a"]);
export const CONTROLLED_WORDS = ["كلونازيبام", "ريفوتريل", "clonazepam", "rivotril",
  "مورفين", "morphine", "ترامادول", "tramadol", "بريغابالين", "pregabalin",
  "ديازيبام", "diazepam", "الپرازولام", "alprazolam", "زاناكس", "xanax"];

/* Exactly what a broadcast may carry. A whitelist, so a field added upstream
   later cannot leak by default. */
export const ALLOWED = new Set(["requestId", "variantId", "typedName", "strength",
  "form", "city", "district", "quantity", "urgency", "acceptsAlternative",
  "prescriptionHeld", "requestClass", "createdAt"]);

/* Present in a payload, these are a bug worth failing loudly for rather than
   silently stripping: something upstream tried to send patient identity. */
export const FORBIDDEN = ["lm", "landmark", "phone", "wa", "photo", "image",
  "note", "notes", "patient", "name", "auth", "token", "ownerToken"];

export const CITY = /^[a-z][a-z0-9-]{1,20}$/;
export const ID = /^[A-Za-z0-9_-]{3,32}$/;
export const KINDS = ["yes", "one", "alt", "none"];

const LIMITS = { typedName: 80, strength: 40, form: 40, quantity: 40, district: 40 };

export function looksControlled(p) {
  if (!p) return false;
  if (p.variantId && CONTROLLED_VARIANTS.has(p.variantId)) return true;
  const t = String(p.typedName || "").toLowerCase().trim();
  if (t.length < 3) return false;
  return CONTROLLED_WORDS.some((w) => t.includes(w.toLowerCase()));
}

/* Validate a submitted payload and return the record body to store, or the
   reason to refuse. The caller supplies the id and timestamp so this stays
   deterministic and therefore testable. */
export function acceptPayload(p, id, at) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, reason: "NO_PAYLOAD" };
  for (const k of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(p, k)) return { ok: false, reason: "FORBIDDEN_FIELD", field: k };
  }
  if (!CITY.test(String(p.city || ""))) return { ok: false, reason: "BAD_CITY" };
  if (!p.variantId && !String(p.typedName || "").trim()) return { ok: false, reason: "NO_MEDICINE" };
  if (looksControlled(p)) return { ok: false, reason: "CONTROLLED" };

  const rec = { id, requestId: id, createdAt: at };
  for (const k of Object.keys(p)) if (ALLOWED.has(k)) rec[k] = p[k];
  rec.requestId = id;                       /* the server names the record */
  rec.createdAt = at;
  rec.urgency = TTL_MIN[rec.urgency] ? rec.urgency : "normal";
  for (const [k, n] of Object.entries(LIMITS)) {
    if (rec[k] != null) rec[k] = String(rec[k]).slice(0, n);
  }
  rec.acceptsAlternative = !!rec.acceptsAlternative;
  rec.prescriptionHeld = rec.prescriptionHeld === true;
  return { ok: true, record: rec };
}

/* Derived on read, never stored — a record that is never mutated after
   creation cannot lose an update to a concurrent writer. */
export function stateOf(rec, answers, cancelled, now) {
  if (cancelled) return "cancelled";
  if (!rec || !rec.createdAt) return "expired";
  const ageMin = (now - rec.createdAt) / 60000;
  if (ageMin >= ttlFor(rec.urgency)) return "expired";
  return (answers && answers.length) ? "acknowledged" : "broadcasting";
}

export const isLive = (st) => st === "broadcasting" || st === "acknowledged";

/* Both true claims are kept; only the earliest is surfaced as "the" answer.
   Ties break on pharmacyId so the winner is deterministic rather than
   whichever object the store happened to hand back first. */
export function firstAnswer(answers) {
  if (!answers || !answers.length) return null;
  return answers.slice().sort((a, b) => a.at - b.at || String(a.pharmacyId).localeCompare(String(b.pharmacyId)))[0];
}

/* Strip anything the reader must not see. ownerHash is the patient's only
   protection and must never appear in a pharmacy-facing response. */
export function publicView(rec) {
  const { ownerHash, ...pub } = rec || {};
  return pub;
}

export function answerView(a) {
  return { pharmacyId: a.pharmacyId, kind: a.kind, at: a.at,
    licenseStatus: a.licenseStatus || "UNKNOWN" };
}

export function validateAnswer(requestId, kind) {
  if (!ID.test(String(requestId || ""))) return { ok: false, reason: "BAD_REQUEST_ID" };
  if (!KINDS.includes(String(kind))) return { ok: false, reason: "BAD_KIND" };
  return { ok: true };
}
