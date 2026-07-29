#!/usr/bin/env node
/* ============================================================
   قريب · اختبارات طبقة بيانات السجل
   ============================================================
   Run:  node tools/test-record-plane.mjs

   `netlify/functions/_record-core.mjs` — the rules the server applies, which
   are the ones that actually hold. Everything js/consent.js decides on the
   client is a UX affordance; these run on the far side of the wire.

   Every case here is a way someone could reach a record they must not.
   ============================================================ */
import * as R from "../netlify/functions/_record-core.mjs";

let pass = 0; const fails = []; let group = "";
const describe = (n) => { group = n; console.log("\n── " + n); };
function it(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(group + " › " + n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

const NOW = new Date("2026-07-29T10:00:00Z").getTime();
const HOUR = 3600000, DAY = 86400000;
const PT = "PAT-1";
const PATIENT = { id: PT, kind: R.ACTOR.PATIENT };
const DR = { id: "DR-1", kind: R.ACTOR.CLINICIAN, licenseStatus: "VERIFIED" };
const DR_UNVERIFIED = { id: "DR-9", kind: R.ACTOR.CLINICIAN, licenseStatus: "SELF_ASSERTED" };
const LAB = { id: "LAB-1", kind: R.ACTOR.FACILITY };
const share = (over) => ({ id: "SH1", patientId: PT, granteeId: "DR-1",
  scopes: ["summary", "labs", "conditions"], state: "active",
  expiresAt: new Date(NOW + DAY).toISOString(), ...over });

/* ==================== VALIDATION ==================== */
describe("١ · ما يُقبَل أصلاً");

const entry = (over) => ({ opId: "op-abc123", op: "create", collection: "conditions",
  id: "CN1", payload: { display: "سكري" }, ...over });

it("an unknown collection is refused — this is not a key-value store", () => {
  eq(R.validateEntry(entry({ collection: "secrets" })).reason, "BAD_COLLECTION");
});

it("religion is refused at the boundary, again", () => {
  /* The client strips it. A server that trusts the client to have stripped
     it is not doing anything. */
  const v = R.validateEntry(entry({ payload: { display: "س", religion: "x" } }));
  eq(v.reason, "FORBIDDEN_FIELD");
  eq(v.fields, ["religion"]);
});

it("a payload too large to be a record is refused", () => {
  const big = { display: "x".repeat(R.MAX_RECORD_BYTES + 10) };
  eq(R.validateEntry(entry({ payload: big })).reason, "TOO_LARGE",
    "an image belongs in object storage with its own consent, not in a record row");
});

it("an update with a non-integer baseRev is refused", () => {
  eq(R.validateEntry(entry({ op: "update", baseRev: "3" })).reason, "BAD_BASE_REV");
  ok(R.validateEntry(entry({ op: "update", baseRev: 3 })).ok);
});

it("a missing or malformed opId is refused — retries depend on it", () => {
  eq(R.validateEntry(entry({ opId: "" })).reason, "BAD_OP_ID");
  eq(R.validateEntry(entry({ opId: "x" })).reason, "BAD_OP_ID");
});

/* ==================== WRITE AUTHORITY ==================== */
describe("٢ · منو يكتب شنو");

it("a patient writes their own documents but never the problem list", () => {
  ok(R.canWrite(PATIENT, "documents", { patientId: PT }).ok);
  eq(R.canWrite(PATIENT, "conditions", { patientId: PT }).reason, "PATIENT_CANNOT_WRITE",
    "a patient-asserted diagnosis is a claim; claims go through the extraction path");
});

it("a patient cannot write into someone else's record", () => {
  eq(R.canWrite(PATIENT, "documents", { patientId: "PAT-OTHER" }).reason, "NOT_YOUR_RECORD");
});

it("a clinician with no share writes nothing, however verified", () => {
  eq(R.canWrite(DR, "conditions", { patientId: PT, shares: [], now: NOW }).reason, "NO_ACTIVE_SHARE");
});

it("an unverified clinician with a share still writes nothing", () => {
  const s = [share({ granteeId: "DR-9" })];
  eq(R.canWrite(DR_UNVERIFIED, "conditions", { patientId: PT, shares: s, now: NOW }).reason,
    "UNVERIFIED_CLINICIAN");
});

it("an expired share is not a share", () => {
  const s = [share({ expiresAt: new Date(NOW - HOUR).toISOString() })];
  eq(R.canWrite(DR, "conditions", { patientId: PT, shares: s, now: NOW }).reason, "NO_ACTIVE_SHARE");
});

it("a revoked share is not a share", () => {
  const s = [share({ state: "revoked" })];
  eq(R.canWrite(DR, "conditions", { patientId: PT, shares: s, now: NOW }).reason, "NO_ACTIVE_SHARE");
});

it("a verified clinician with an active share writes clinical records", () => {
  const w = R.canWrite(DR, "conditions", { patientId: PT, shares: [share()], now: NOW });
  ok(w.ok); eq(w.basis, "SHARE"); eq(w.shareId, "SH1");
});

it("a lab writes a result only against an order that names it", () => {
  eq(R.canWrite(LAB, "results", { patientId: PT }).reason, "ORDER_REQUIRED");
  eq(R.canWrite(LAB, "results", { patientId: PT,
    order: { id: "O1", patientId: PT, performerId: "LAB-2" } }).reason, "ORDER_NOT_YOURS",
    "otherwise any lab could write into any chart");
  ok(R.canWrite(LAB, "results", { patientId: PT,
    order: { id: "O1", patientId: PT, performerId: "LAB-1" } }).ok);
});

it("a lab's order for a DIFFERENT patient does not open this one", () => {
  eq(R.canWrite(LAB, "results", { patientId: PT,
    order: { id: "O1", patientId: "PAT-OTHER", performerId: "LAB-1" } }).reason,
    "ORDER_PATIENT_MISMATCH");
});

it("a lab token cannot write a diagnosis", () => {
  eq(R.canWrite(LAB, "conditions", { patientId: PT,
    order: { id: "O1", patientId: PT, performerId: "LAB-1" } }).reason, "COLLECTION_NOT_WRITABLE",
    "a lab token that could write a diagnosis is the softest target in the system");
});

/* ==================== REVISIONS ==================== */
describe("٣ · النسخ والتعارض");

it("a first write starts at revision 1 and is stamped by the server", () => {
  const a = R.applyWrite(null, entry(), DR, NOW);
  ok(a.ok);
  eq(a.record.qRev, 1);
  eq(a.record.qWrittenBy, "DR-1");
  eq(a.record.qActorKind, "clinician");
});

it("the client cannot forge the server's own fields", () => {
  const a = R.applyWrite(null, entry({ payload: { display: "س", qRev: 99, qWrittenBy: "someone-else" } }), DR, NOW);
  eq(a.record.qRev, 1);
  eq(a.record.qWrittenBy, "DR-1");
});

it("an update from a stale revision is a CONFLICT, not a silent overwrite", () => {
  const existing = { id: "CN1", display: "قديم", qRev: 5, qOpId: "op-old" };
  const a = R.applyWrite(existing, entry({ op: "update", baseRev: 3 }), DR, NOW);
  no(a.ok);
  ok(a.conflict);
  eq(a.reason, "STALE");
  eq(a.serverRev, 5, "and the client is told what it must rebase onto");
});

it("an update with no baseRev is refused — not knowing is not permission", () => {
  const existing = { id: "CN1", qRev: 5, qOpId: "op-old" };
  eq(R.applyWrite(existing, entry({ op: "update" }), DR, NOW).reason, "BASE_REV_REQUIRED");
});

it("an update from the current revision advances it", () => {
  const existing = { id: "CN1", qRev: 5, qOpId: "op-old" };
  const a = R.applyWrite(existing, entry({ op: "update", baseRev: 5 }), DR, NOW);
  ok(a.ok); eq(a.record.qRev, 6);
});

it("a retry whose response was lost gets the ack it never received", () => {
  const existing = { id: "CN1", qRev: 5, qOpId: "op-abc123" };
  const a = R.applyWrite(existing, entry({ op: "update", baseRev: 4 }), DR, NOW);
  ok(a.ok);
  ok(a.replayed, "not an error and not a second copy");
  eq(a.record.qRev, 5);
});

it("an immutable record is never rewritten — a second write is refused", () => {
  const existing = { id: "ENC1", qRev: 1, qOpId: "op-first" };
  const a = R.applyWrite(existing, entry({ collection: "encounters", id: "ENC1",
    op: "update", baseRev: 1 }), DR, NOW);
  no(a.ok);
  eq(a.reason, "IMMUTABLE", "a signed encounter is a historical fact, not a row");
});

it("...but a replay of the same immutable write is still an ack", () => {
  const existing = { id: "ENC1", qRev: 1, qOpId: "op-abc123" };
  const a = R.applyWrite(existing, entry({ collection: "encounters", id: "ENC1" }), DR, NOW);
  ok(a.ok); ok(a.replayed);
});

it("updating something the server does not have is a conflict, not a create", () => {
  const a = R.applyWrite(null, entry({ op: "update", baseRev: 2 }), DR, NOW);
  no(a.ok); eq(a.reason, "NOT_FOUND",
    "the two sides disagree about the world, and that must surface");
});

/* ==================== READ ==================== */
describe("٤ · القراءة");

it("no share means no read", () => {
  const d = R.decideRead({ actor: DR, patientId: PT, scope: "labs", shares: [], now: NOW });
  no(d.ok); eq(d.reason, "NO_ACTIVE_SHARE"); ok(d.auditRequired);
});

it("a share opens only its own scopes", () => {
  const s = [share({ scopes: ["summary"] })];
  eq(R.decideRead({ actor: DR, patientId: PT, scope: "labs", shares: s, now: NOW }).reason,
    "SCOPE_NOT_GRANTED");
  ok(R.decideRead({ actor: DR, patientId: PT, scope: "summary", shares: s, now: NOW }).ok);
});

it("scopes map to collections here, not on the client", () => {
  const d = R.decideRead({ actor: DR, patientId: PT, shares: [share()], now: NOW });
  const cols = R.readableCollections(d);
  ok(cols.includes("results"), "labs opens results");
  no(cols.includes("encounters"), "and nothing else");
  no(cols.includes("documents"));
});

it("the patient reads everything of their own", () => {
  const d = R.decideRead({ actor: PATIENT, patientId: PT, shares: [], now: NOW });
  ok(d.ok); eq(d.basis, "SELF");
  eq(R.readableCollections(d).length, R.COLLECTIONS.length);
});

it("emergency tier 1 opens the emergency dataset only", () => {
  const bg = { actorId: "DR-7", patientId: PT, tier: "critical",
    expiresAt: new Date(NOW + HOUR).toISOString() };
  const actor = { id: "DR-7", kind: R.ACTOR.CLINICIAN, licenseStatus: "VERIFIED" };
  const okd = R.decideRead({ actor, patientId: PT, scope: "allergies", shares: [], breakGlass: bg, now: NOW });
  ok(okd.ok); eq(okd.tier, "critical"); ok(okd.mustNotify);
  const denied = R.decideRead({ actor, patientId: PT, scope: "labs", shares: [], breakGlass: bg, now: NOW });
  no(denied.ok); eq(denied.reason, "BEYOND_EMERGENCY_DATASET");
  ok(denied.escalationAvailable);
});

it("an expired emergency grant opens nothing", () => {
  const bg = { actorId: "DR-7", patientId: PT, tier: "critical",
    expiresAt: new Date(NOW - 1).toISOString() };
  no(R.decideRead({ actor: { id: "DR-7", kind: R.ACTOR.CLINICIAN }, patientId: PT,
    scope: "allergies", shares: [], breakGlass: bg, now: NOW }).ok);
});

it("someone else's emergency grant is not yours", () => {
  const bg = { actorId: "DR-7", patientId: PT, tier: "full",
    expiresAt: new Date(NOW + HOUR).toISOString() };
  no(R.decideRead({ actor: { id: "DR-8", kind: R.ACTOR.CLINICIAN }, patientId: PT,
    scope: "labs", shares: [], breakGlass: bg, now: NOW }).ok);
});

it("identifier VALUES never leave the server for anyone but the patient", () => {
  const p = { id: PT, name: "علي", identifiers: [
    { type: "national", value: "199012345", verification: "machine_read" }] };
  const mine = R.patientView(p, true);
  eq(mine.identifiers[0].value, "199012345");
  const theirs = R.patientView(p, false);
  eq(theirs.identifiers[0].value, undefined,
    "a number in a response is a number in a log, a cache and a screenshot");
  eq(theirs.identifiers[0].verification, "machine_read", "but HOW WELL we know them does travel");
});

/* ==================== AUDIT ==================== */
describe("٥ · التدقيق");

it("the entry answers all six questions", () => {
  const d = { ok: true, basis: "SHARE", shareId: "SH1" };
  const e = R.auditEntry({ actor: DR, patientId: PT, action: "read", scope: "labs",
    purpose: "مراجعة الكلى", context: { facilityId: "CLN-A", deviceId: "d1" } }, d, NOW);
  ok(e.actorId, "WHO"); ok(e.scope, "WHAT"); eq(e.at, NOW, "WHEN");
  ok(e.purpose, "WHY"); ok(e.context.facilityId, "WHERE");
  eq(e.authority.kind, "SHARE", "UNDER WHICH AUTHORISATION");
  eq(e.authority.id, "SH1");
});

it("a refused read is audited as carefully as a granted one", () => {
  const e = R.auditEntry({ actor: DR, patientId: PT, action: "read", scope: "labs" },
    { ok: false, reason: "NO_ACTIVE_SHARE" }, NOW);
  no(e.granted); eq(e.reason, "NO_ACTIVE_SHARE");
});

it("a facility's authority is recorded as the ORDER, not a share", () => {
  const e = R.auditEntry({ actor: LAB, patientId: PT, action: "write", collection: "results" },
    { ok: true, basis: "ORDER", orderId: "O1" }, NOW);
  eq(e.authority.kind, "ORDER"); eq(e.authority.id, "O1");
});

console.log("\n" + "─".repeat(56));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
