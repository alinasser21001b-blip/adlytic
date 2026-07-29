#!/usr/bin/env node
/* ============================================================
   قريب · اختبارات النطاقات المكمّلة والموافقة
   ============================================================
   Run:  node tools/test-record.mjs

   js/record.js and js/consent.js, evaluated as the shipped bytes in a Node
   vm alongside js/emr.js — because record.js reads EMR at call time and a
   test that stubs it would be testing a stub.

   Every case here is a rule someone can be harmed by getting wrong: a claim
   promoted without a human, a share that outlives the consultation, a
   sensitive record leaking into an ordinary grant, a refused access attempt
   the patient never learns about.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["js/emr.js", "js/record.js", "js/consent.js"]) {
  vm.runInContext(readFileSync(join(HUB, f), "utf8"), ctx, { filename: f });
}
const E = ctx.EMR, R = ctx.REC, C = ctx.CONSENT;

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
const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const PT = "PAT-1";
const DR = { id: "DR-1", name: "د. أحمد", role: E.ROLE.DOCTOR, organizationId: "CLINIC-1" };

/* ==================== DOCUMENTS ==================== */
describe("١ · المستندات — المستند ليس سجلاً سريرياً");

const baseDoc = { id: "D1", patientId: PT, title: "تقرير سونار البطن",
  type: R.DOC_TYPE.IMAGING, documentDate: "2026-01-15", uploadedBy: PT, origin: R.DOC_ORIGIN.FACILITY };

it("a patient can attach an old report from before Qareeb existed", () => {
  const r = R.attachDocument(baseDoc, NOW);
  ok(r.ok);
  eq(r.document.extractState, R.EXTRACT_STATE.NONE);
  ok(r.document.immutable, "the source document is never edited");
});

it("a document with no date is refused — it could never be found again", () => {
  eq(R.canAttach({ ...baseDoc, documentDate: null }).reason, "DATE_REQUIRED");
});

it("a medicine-box photo is not a clinical document and is not retained", () => {
  /* Standing product rule: prescription and medicine images never enter our
     storage. WhatsApp is that channel. */
  no(R.isRetainable(R.DOC_TYPE.PRESCRIPTION));
  eq(R.canAttach({ ...baseDoc, type: R.DOC_TYPE.PRESCRIPTION }).reason, "TYPE_NOT_RETAINED");
});

it("extraction produces CLAIMS, never facts", () => {
  const d = R.attachDocument(baseDoc, NOW).document;
  const r = R.recordExtraction(d, [
    { kind: R.CLAIM_KIND.CONDITION, name: "حصى المرارة" },
    { kind: R.CLAIM_KIND.RESULT, test: "ALT", value: 44 },
  ], "ocr-v1", NOW);
  ok(r.ok);
  eq(r.document.extractState, R.EXTRACT_STATE.EXTRACTED);
  ok(r.document.claims.every((c) => c.verified === false), "nothing is verified on extraction");
  ok(r.document.claims.every((c) => c.state === R.EXTRACT_STATE.EXTRACTED));
  eq(R.confirmedClaims(r.document).length, 0, "a machine confirms nothing");
});

it("an unknown claim kind is refused rather than stored as free text", () => {
  const d = R.attachDocument(baseDoc, NOW).document;
  eq(R.recordExtraction(d, [{ kind: "vibes", name: "x" }], "ocr", NOW).reason, "UNKNOWN_CLAIM_KIND");
});

it("a patient cannot confirm a claim into the authoritative record", () => {
  const d = R.recordExtraction(R.attachDocument(baseDoc, NOW).document,
    [{ kind: R.CLAIM_KIND.CONDITION, name: "حصى المرارة" }], "ocr", NOW).document;
  const r = R.confirmClaim(d, d.claims[0].id, R.EXTRACT_STATE.CONFIRMED,
    { id: PT, role: E.ROLE.PATIENT }, NOW);
  eq(r.reason, "CLINICIAN_REQUIRED",
    "a patient may upload and may disagree — they may not write the list a prescriber relies on");
});

it("a clinician confirming promotes exactly one claim, not the document", () => {
  const d = R.recordExtraction(R.attachDocument(baseDoc, NOW).document, [
    { kind: R.CLAIM_KIND.CONDITION, name: "حصى المرارة" },
    { kind: R.CLAIM_KIND.MEDICATION, name: "دواء غير مقروء" },
  ], "ocr", NOW).document;
  const r = R.confirmClaim(d, d.claims[0].id, R.EXTRACT_STATE.CONFIRMED, DR, NOW);
  ok(r.ok);
  eq(R.confirmedClaims(r.document).length, 1);
  eq(R.pendingClaims(r.document).length, 1, "the second claim is still waiting for a human");
  eq(r.document.extractState, R.EXTRACT_STATE.EXTRACTED, "the document is not done while a claim is open");
});

it("rejecting a claim requires a reason", () => {
  const d = R.recordExtraction(R.attachDocument(baseDoc, NOW).document,
    [{ kind: R.CLAIM_KIND.MEDICATION, name: "خربشة" }], "ocr", NOW).document;
  eq(R.confirmClaim(d, d.claims[0].id, R.EXTRACT_STATE.REJECTED, DR, NOW).reason, "REASON_REQUIRED");
  ok(R.confirmClaim(d, d.claims[0].id, R.EXTRACT_STATE.REJECTED, DR, NOW, "غير مقروء").ok);
});

it("a decided claim cannot be re-decided silently", () => {
  const d = R.recordExtraction(R.attachDocument(baseDoc, NOW).document,
    [{ kind: R.CLAIM_KIND.CONDITION, name: "س" }], "ocr", NOW).document;
  const once = R.confirmClaim(d, d.claims[0].id, R.EXTRACT_STATE.CONFIRMED, DR, NOW).document;
  eq(R.confirmClaim(once, once.claims[0].id, R.EXTRACT_STATE.REJECTED, DR, NOW, "x").reason, "ALREADY_DECIDED");
});

it("the unverified tray is visible across the whole record", () => {
  const a = R.recordExtraction(R.attachDocument(baseDoc, NOW).document,
    [{ kind: R.CLAIM_KIND.CONDITION, name: "أ" }], "ocr", NOW).document;
  const b = R.recordExtraction(R.attachDocument({ ...baseDoc, id: "D2" }, NOW).document,
    [{ kind: R.CLAIM_KIND.MEDICATION, name: "ب" }], "ocr", NOW).document;
  eq(R.awaitingVerification([a, b]).length, 2, "a backlog nobody can see is a backlog that grows");
});

/* ==================== IMMUNIZATIONS ==================== */
describe("٢ · التطعيمات");

it("a vaccine remembered is not a vaccine documented", () => {
  const recall = R.recordImmunization({ patientId: PT, vaccine: "MMR", date: "2010-05-01",
    evidence: R.IMM_EVIDENCE.RECALL }).immunization;
  const card = R.recordImmunization({ patientId: PT, vaccine: "MMR", date: "2010-05-01",
    evidence: R.IMM_EVIDENCE.CARD }).immunization;
  no(recall.documented);
  ok(card.documented);
});

it("coverage separates 'complete' from 'complete on paper'", () => {
  const list = [
    R.recordImmunization({ patientId: PT, vaccine: "MMR", date: "2010-05-01", evidence: R.IMM_EVIDENCE.CARD }).immunization,
    R.recordImmunization({ patientId: PT, vaccine: "MMR", date: "2011-05-01", evidence: R.IMM_EVIDENCE.RECALL }).immunization,
  ];
  const cov = R.immunityFor(list, "MMR", 2);
  ok(cov.complete, "two doses given");
  no(cov.documentedComplete, "but only one of them is on paper");
});

it("Arabic vaccine names normalise before matching", () => {
  const list = [R.recordImmunization({ patientId: PT, vaccine: "الحصبه", date: "2010-05-01",
    evidence: R.IMM_EVIDENCE.CARD }).immunization];
  eq(R.immunityFor(list, "الحصبة", 1).given, 1, "ة/ه must not split a vaccine record");
});

/* ==================== PRESCRIPTIONS ==================== */
describe("٣ · الوصفات — منظّمة أو ليست وصفة");

const RX = { id: "RX1", patientId: PT, prescriberId: "DR-1", medication: "ميتفورمين",
  dose: "٥٠٠ ملغم", frequency: "BID", durationDays: 30, indication: "داء السكري النوع ٢" };
const VERIFIED_DR = { id: "DR-1", licenseStatus: "VERIFIED" };

it("an unverified doctor cannot write into the medication list", () => {
  eq(R.canPrescribe(RX, { id: "DR-9", licenseStatus: "SELF_ASSERTED" }).reason, "PRESCRIBER_UNVERIFIED");
});

it("a prescription with no duration and no open-ended flag is refused", () => {
  eq(R.canPrescribe({ ...RX, durationDays: 0 }, VERIFIED_DR).reason, "DURATION_REQUIRED",
    "silence about duration is how a 5-day antibiotic looks permanent");
  ok(R.canPrescribe({ ...RX, durationDays: 0, openEnded: true }, VERIFIED_DR).ok);
});

it("a prescription with no indication is refused", () => {
  eq(R.canPrescribe({ ...RX, indication: "" }, VERIFIED_DR).reason, "INDICATION_REQUIRED",
    "without it, no later clinician can decide whether to keep or stop the drug");
});

it("issuing produces BOTH an immutable order and a mutable medication", () => {
  const r = R.issuePrescription(RX, VERIFIED_DR, NOW);
  ok(r.ok);
  ok(r.prescription.immutable);
  eq(r.prescription.endDate, "2026-08-28", "30 days from 29 July");
  eq(r.medication.status, E.MED_STATE.ACTIVE);
  eq(r.medication.prescriberId, "DR-1", "the record must be able to say who started it");
  eq(r.medication.durationDays, 30);
});

it("the medication it produces is understood by the longitudinal layer", () => {
  const med = R.issuePrescription(RX, VERIFIED_DR, NOW).medication;
  eq(E.medStatus(med, NOW + 10 * DAY), E.MED_STATE.ACTIVE, "day 10 of a 30-day course");
  eq(E.medStatus(med, NOW + 120 * DAY), E.MED_STATE.UNCONFIRMED,
    "long past its end it is a guess, and the screen must say so");
});

it("stopping still demands a reason — through the whole chain", () => {
  const med = R.issuePrescription(RX, VERIFIED_DR, NOW).medication;
  eq(E.stopMedication(med, { at: NOW, actor: "DR-1" }).reason, "STOP_REASON_REQUIRED");
  ok(E.stopMedication(med, { at: NOW, actor: "DR-1", reason: "طفح جلدي" }).ok);
});

it("a dispense is an observation about the order, never an edit of it", () => {
  const rx = R.issuePrescription(RX, VERIFIED_DR, NOW).prescription;
  const d = R.recordDispense(rx, { pharmacyId: "PH-1", state: R.DISPENSE_STATE.DISPENSED }, NOW);
  ok(d.ok);
  eq(d.dispense.prescriptionId, "RX1");
  no("medication" in d, "dispensing does not assert the patient took anything");
});

it("a substitution must name what was substituted", () => {
  const rx = R.issuePrescription(RX, VERIFIED_DR, NOW).prescription;
  eq(R.recordDispense(rx, { pharmacyId: "PH-1", state: R.DISPENSE_STATE.DISPENSED, substituted: true }, NOW).reason,
    "SUBSTITUTE_REQUIRED", "a different brand is a different clinical fact");
});

/* ==================== APPOINTMENTS ==================== */
describe("٤ · المواعيد");

it("an appointment in the past cannot be booked", () => {
  eq(R.bookAppointment({ patientId: PT, providerId: "DR-1", startsAt: NOW - HOUR }, NOW).reason, "IN_THE_PAST");
});

it("an encounter is only created when the patient actually arrived", () => {
  const a = R.bookAppointment({ id: "A1", patientId: PT, providerId: "DR-1", startsAt: NOW + HOUR }, NOW).appointment;
  eq(R.appointmentToEncounter(a).reason, "NOT_ARRIVED",
    "an encounter asserts a clinician saw a person");
  const arrived = { ...a, state: R.APPT_STATE.ARRIVED, arrivedAt: NOW + HOUR };
  const e = R.appointmentToEncounter(arrived);
  ok(e.ok);
  eq(e.encounter.state, E.ENC_STATE.DRAFT);
  eq(e.encounter.appointmentId, "A1");
});

it("a no-show can be rebooked but never silently fulfilled", () => {
  ok(R.canApptTransition(R.APPT_STATE.NO_SHOW, R.APPT_STATE.BOOKED));
  no(R.canApptTransition(R.APPT_STATE.NO_SHOW, R.APPT_STATE.FULFILLED));
  no(R.canApptTransition(R.APPT_STATE.CANCELLED, R.APPT_STATE.BOOKED));
});

/* ==================== PROVIDERS ==================== */
describe("٥ · مقدّمو الرعاية");

it("nobody writes themselves in as verified", () => {
  /* Claiming the status confers nothing. With no evidence at all the answer
     is UNVERIFIED; with some of it, SELF_ASSERTED — an honest middle state,
     because a real doctor who has filled in half the form is not the same
     thing as a stranger. Neither may write. */
  eq(R.providerVerification({ id: "X", licenseStatus: "VERIFIED" }).status, "UNVERIFIED");
  eq(R.providerVerification({ id: "X", licenseStatus: "VERIFIED", specialty: "باطنية" }).status, "SELF_ASSERTED");
  no(R.canWriteClinical({ id: "X", licenseStatus: "VERIFIED", specialty: "باطنية" }));
  ok(R.canWriteClinical({ id: "X", licenseStatus: "VERIFIED", specialty: "باطنية",
    licenseNumber: "12345", syndicateId: "IQ-99" }), "the full evidence does confer it");
});

it("an expired licence is not a verified licence", () => {
  const p = { id: "X", licenseStatus: "VERIFIED", licenseNumber: "1", syndicateId: "2",
    specialty: "باطنية", licenseExpiry: "2020-01-01" };
  eq(R.providerVerification(p).status, "EXPIRED");
  no(R.canWriteClinical(p));
});

it("an unverified doctor may still READ what the patient explicitly shared", () => {
  /* Refusing this pushes the consultation back to a WhatsApp photo of the
     file, which is strictly worse for the patient. */
  const p = { id: "X", licenseNumber: "1", specialty: "باطنية" };
  ok(R.canReadShared(p), "reading a shared record is not the same gate as writing one");
  no(R.canWriteClinical(p));
});

/* ==================== PROFILE & BRIEF ==================== */
describe("٦ · الملف والملخّص قبل الزيارة");

/* Field names here are emr.js's, not this test's own invention — clinicalStatus,
   code, effectiveAt, refLow/refHigh, performerId. Getting them wrong is not a
   test-authoring detail: a brief built against the wrong names returns an
   empty list rather than an error, and an empty safety panel reads exactly
   like a patient with nothing wrong. */
const REC_FIXTURE = {
  conditions: [
    { id: "C1", display: "داء السكري النوع ٢", clinicalStatus: E.COND_STATE.ACTIVE, chronic: true,
      onsetDate: "2025-02-09", lastReviewed: "2026-06-20" },
  ],
  medications: [R.issuePrescription({ ...RX, id: "RXa" }, VERIFIED_DR, NOW - 60 * DAY).medication],
  allergies: [{ substance: "البنسلين", reaction: "طفح", criticality: E.CRITICALITY.HIGH }],
  results: [
    { code: "HbA1c", display: "الخضاب السكري", value: 7.1, unit: "%", effectiveAt: "2025-08-03",
      refLow: 4, refHigh: 5.6, performerId: "L1" },
    { code: "HbA1c", display: "الخضاب السكري", value: 8.4, unit: "%", effectiveAt: "2026-07-01",
      refLow: 4, refHigh: 5.6, performerId: "L1" },
    { code: "Lipid", display: "دهون الدم", status: "pending", orderedAt: "2026-07-20" },
  ],
  encounters: [{ id: "E9", startedAt: "2026-05-11", clinicianId: "DR-2",
    assessment: "سكري مضبوط", state: E.ENC_STATE.SIGNED }],
  tasks: [{ id: "T1", kind: E.TASK_KIND.RESULT_ACK, status: E.TASK_STATE.OPEN,
    dueAt: "2026-07-10", about: "HbA1c" }],
  documents: [R.recordExtraction(R.attachDocument(baseDoc, NOW).document,
    [{ kind: R.CLAIM_KIND.CONDITION, name: "حصى المرارة" }], "ocr", NOW).document],
  immunizations: [],
};
const PATIENT = { id: PT, name: "علي حسن محمود", sex: "male", birthDate: "1981-03-11",
  identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "199012345", verification: E.ID_VERIFY.MACHINE }] };

it("the profile never carries identifier VALUES", () => {
  const p = R.patientProfile(PATIENT, REC_FIXTURE, NOW);
  no(JSON.stringify(p).includes("199012345"),
    "a summary that carries a card number leaks it into every log and cache");
  eq(p.identifiers[0].verification, "machine_read", "but it does carry HOW WELL we know them");
});

it("the pre-visit brief answers the 30-second question", () => {
  const b = R.preVisitBrief(PATIENT, REC_FIXTURE, NOW);
  eq(b.patient.age, 45);
  eq(b.allergies[0].substance, "البنسلين");
  eq(b.active[0].name, "داء السكري النوع ٢");
  eq(b.medications[0].name, "ميتفورمين");
  eq(b.medications[0].dose, "٥٠٠ ملغم", "a dose, not just a name");
  ok(b.trends.some((t) => t.code === "HbA1c"), "the lab that MOVED must surface");
  eq(b.pending[0].code, "Lipid");
  eq(b.overdue.length, 1, "the overdue result review is the closed-loop failure");
  eq(b.unverifiedClaims, 1, "and one claim nobody has checked");
});

it("the brief says which lines the PATIENT told us, not just what they say", () => {
  /* The brief is a projection with its own field names — deliberately, so no
     screen is wired to storage. That renaming is also how provenance gets
     lost: the first version dropped it, and a medicine the patient had typed
     into a form five minutes earlier arrived on the clinician's list looking
     exactly like one a colleague had prescribed. Both are worth having. They
     are not the same claim. */
  const rec = {
    ...REC_FIXTURE,
    medications: [
      ...REC_FIXTURE.medications,
      { id: "M-self", display: "أسبرين", dose: "٨١ ملغم", frequency: "OD", status: "active",
        source: E.SOURCE.PATIENT, verificationStatus: E.VERIFY.PATIENT_REPORTED, recordedBy: PT },
    ],
    allergies: [{ substance: "السلفا", reaction: "طفح", criticality: E.CRITICALITY.HIGH,
      source: E.SOURCE.PATIENT, verificationStatus: E.VERIFY.PATIENT_REPORTED }],
    conditions: [
      ...REC_FIXTURE.conditions,
      { id: "C-self", display: "ربو", clinicalStatus: E.COND_STATE.ACTIVE, chronic: true,
        source: E.SOURCE.PATIENT, verificationStatus: E.VERIFY.PATIENT_REPORTED },
    ],
  };
  const b = R.preVisitBrief(PATIENT, rec, NOW);
  eq(b.medications.find((m) => m.name === "أسبرين").selfReported, true);
  eq(b.medications.find((m) => m.name === "ميتفورمين").selfReported, false,
    "a prescribed medicine must NOT be tarred with the same mark");
  eq(b.allergies[0].selfReported, true);
  eq((b.active.find((c) => c.name === "ربو") || {}).selfReported, true);
  eq((b.active.find((c) => c.name === "داء السكري النوع ٢") || {}).selfReported, false);
});

it("the brief carries its own caveat so no screen can drop it", () => {
  ok(R.preVisitBrief(PATIENT, REC_FIXTURE, NOW).caveat.includes("لا يغني عن سؤال المريض"));
});

it("an unacknowledged abnormal result is surfaced above everything else", () => {
  const b = R.preVisitBrief(PATIENT, REC_FIXTURE, NOW);
  ok(b.unacknowledgedAbnormal.some((x) => x.code === "HbA1c" && x.value === 8.4),
    "the result arrived, it was abnormal, nobody owned it — the failure that kills");
});

/* ==================== CONSENT & SHARING ==================== */
describe("٧ · الموافقة والمشاركة");

const GRANT = { id: "S1", patientId: PT, grantedBy: PT, granteeId: "DR-1", granteeName: "د. أحمد",
  scopes: [C.SCOPE.SUMMARY, C.SCOPE.MEDICATIONS], duration: "WEEK", modality: "IN_APP" };

it("only the patient grants — never the clinic, never the doctor", () => {
  eq(C.canGrant({ ...GRANT, grantedBy: "DR-1" }, NOW).reason, "PATIENT_MUST_GRANT");
});

it("a share must record HOW the patient said yes", () => {
  eq(C.canGrant({ ...GRANT, modality: null }, NOW).reason, "MODALITY_REQUIRED",
    "with no statute, an undocumented consent is indistinguishable from none");
});

it("there is no code path that creates an unbounded share", () => {
  eq(C.canGrant({ ...GRANT, duration: "FOREVER" }, NOW).reason, "DURATION_REQUIRED");
  const s = C.grantShare(GRANT, NOW).share;
  ok(s.expiresAt > NOW && s.expiresAt - NOW <= C.MAX_DURATION_MS);
});

it("allergies ride along on every share whether or not they were ticked", () => {
  const s = C.grantShare({ ...GRANT, scopes: [C.SCOPE.LABS] }, NOW).share;
  ok(s.scopes.includes(C.SCOPE.ALLERGIES),
    "a doctor who can see the record but not the penicillin allergy is more dangerous than one who cannot see it at all");
});

it("sensitive records are NEVER in a default grant", () => {
  eq(C.grantShare(GRANT, NOW).share.includesSensitive, false);
});

it("sensitive access takes a second, separate act of consent", () => {
  const s = C.grantShare(GRANT, NOW).share;
  eq(C.grantSensitive(s, { by: PT }, NOW).reason, "ACKNOWLEDGEMENT_REQUIRED");
  eq(C.grantSensitive(s, { by: "DR-1", acknowledged: true }, NOW).reason, "PATIENT_MUST_CONFIRM");
  ok(C.grantSensitive(s, { by: PT, acknowledged: true }, NOW).ok);
});

it("expiry is DERIVED, so a share that lapsed at 3am is not open at 9am", () => {
  const s = C.grantShare({ ...GRANT, duration: "VISIT" }, NOW).share;
  ok(C.isShareActive(s, NOW + 3 * HOUR));
  no(C.isShareActive(s, NOW + 5 * HOUR));
  eq(C.shareState(s, NOW + 5 * HOUR), C.SHARE_STATE.EXPIRED,
    "state is computed from the clock, never from a stored flag a job must update");
});

it("revocation is immediate and needs no justification", () => {
  const s = C.grantShare(GRANT, NOW).share;
  const r = C.revokeShare(s, PT, NOW + HOUR);
  ok(r.ok);
  no(C.isShareActive(r.share, NOW + 2 * HOUR));
  eq(C.revokeShare(s, "DR-1", NOW).reason, "PATIENT_MUST_REVOKE",
    "a doctor cannot revoke on the patient's behalf, nor keep access by refusing");
});

/* ==================== THE ACCESS DECISION ==================== */
describe("٨ · قرار الوصول");

const shares = [C.grantShare(GRANT, NOW).share];

it("no share means no access, however senior the doctor", () => {
  const d = C.decideAccess({ actor: { id: "DR-9", role: E.ROLE.DOCTOR }, patientId: PT,
    scope: C.SCOPE.SUMMARY, shares, now: NOW });
  no(d.ok); eq(d.reason, "NO_ACTIVE_SHARE");
  ok(d.auditRequired, "and the attempt is written down");
});

it("a share grants only what it says", () => {
  const d = C.decideAccess({ actor: DR, patientId: PT, scope: C.SCOPE.LABS, shares, now: NOW });
  no(d.ok); eq(d.reason, "SCOPE_NOT_GRANTED");
  ok(C.decideAccess({ actor: DR, patientId: PT, scope: C.SCOPE.MEDICATIONS, shares, now: NOW }).ok);
});

it("an expired share is refused without anyone having to run a job", () => {
  no(C.decideAccess({ actor: DR, patientId: PT, scope: C.SCOPE.SUMMARY, shares, now: NOW + 8 * DAY }).ok);
});

it("sensitive data is refused inside an otherwise valid share", () => {
  const d = C.decideAccess({ actor: DR, patientId: PT, scope: C.SCOPE.SUMMARY,
    dataClass: E.CLASS.SENSITIVE, shares, now: NOW });
  no(d.ok); eq(d.reason, "SENSITIVE_NOT_GRANTED");
});

it("the patient always reaches their own record", () => {
  const d = C.decideAccess({ actor: { id: PT, role: E.ROLE.PATIENT }, patientId: PT,
    scope: C.SCOPE.TIMELINE, shares: [], now: NOW });
  ok(d.ok); eq(d.basis, "SELF");
});

const ER = { id: "DR-7", role: E.ROLE.DOCTOR, name: "د. طوارئ" };
const bgGrant = () => E.breakGlass(ER, PT, "إنعاش — المريض فاقد الوعي", NOW).grant;

it("tier 1 opens the emergency dataset in one action — and forces a notification", () => {
  const d = C.decideAccess({ actor: ER, patientId: PT, scope: C.SCOPE.ALLERGIES,
    shares: [], breakGlass: bgGrant(), now: NOW });
  ok(d.ok); eq(d.basis, "BREAK_GLASS"); eq(d.tier, C.EMERGENCY_TIER.CRITICAL);
  ok(d.mustNotify, "the patient learns about it — that is what makes it survivable");
});

it("tier 1 does NOT open the whole record — that was the bug", () => {
  /* An override that grants everything gets used for convenience, because
     invoking it costs the same whether you needed a blood group or wanted to
     read a psychiatric admission. */
  const bg = bgGrant();
  const labs = C.decideAccess({ actor: ER, patientId: PT, scope: C.SCOPE.LABS,
    shares: [], breakGlass: bg, now: NOW });
  no(labs.ok); eq(labs.reason, "BEYOND_EMERGENCY_DATASET");
  ok(labs.escalationAvailable, "but the door is named, not hidden");

  const sens = C.decideAccess({ actor: ER, patientId: PT, scope: C.SCOPE.SUMMARY,
    dataClass: E.CLASS.SENSITIVE, shares: [], breakGlass: bg, now: NOW });
  no(sens.ok); eq(sens.reason, "SENSITIVE_NEEDS_ESCALATION");
});

it("escalating to tier 2 needs its OWN justification, not a retry", () => {
  const bg = bgGrant();
  eq(C.escalateEmergency(bg, "لازم", ER, NOW).reason, "ESCALATION_REASON_REQUIRED");
  eq(C.escalateEmergency(bg, "أحتاج التاريخ الكامل قبل التخدير", { id: "DR-9" }, NOW).reason,
    "SAME_ACTOR_REQUIRED", "a colleague cannot widen someone else's override");
  const up = C.escalateEmergency(bg, "أحتاج التاريخ الكامل قبل التخدير الطارئ", ER, NOW);
  ok(up.ok);
  eq(up.grant.tier, C.EMERGENCY_TIER.FULL);
  ok(C.decideAccess({ actor: ER, patientId: PT, scope: C.SCOPE.LABS,
    shares: [], breakGlass: up.grant, now: NOW }).ok, "now the rest opens");
});

it("the broader tier lasts LESS time, not more", () => {
  const bg = bgGrant();
  const up = C.escalateEmergency(bg, "أحتاج التاريخ الكامل قبل التخدير الطارئ", ER, NOW).grant;
  ok(up.expiresAt - NOW < bg.expiresAt - NOW,
    "the wider the access, the less of it there should be");
});

it("emergency access closes on its own either way", () => {
  no(C.decideAccess({ actor: ER, patientId: PT, scope: C.SCOPE.ALLERGIES,
    shares: [], breakGlass: bgGrant(), now: NOW + 2 * HOUR }).ok);
});

it("the emergency card states what is NOT recorded rather than leaving it blank", () => {
  const card = C.emergencyCard({ id: PT, name: "علي", birthDate: "1981-03-11", sex: "male" },
    { allergies: [], medications: [], conditions: [] }, NOW);
  eq(card.bloodGroup, null);
  ok(card.notRecorded.some((x) => x.includes("فصيلة الدم")),
    "a blank blood group and an unrecorded one look identical and mean opposite things at a trauma bay");
  ok(card.notRecorded.some((x) => x.includes("لا يعني عدمها")));
});

/* ==================== ACCESS LOG ==================== */
describe("٩ · سجل الوصول");

it("REFUSED attempts are logged too", () => {
  const d = C.decideAccess({ actor: { id: "DR-9" }, patientId: PT, scope: C.SCOPE.LABS, shares, now: NOW });
  const e = C.accessEntry({ actor: { id: "DR-9", name: "د. مجهول" }, patientId: PT, scope: C.SCOPE.LABS }, d, NOW);
  no(e.granted);
  eq(e.reason, "NO_ACTIVE_SHARE",
    "a log of successes cannot answer 'did anyone TRY to open my file'");
});

it("a burst of reads in one consultation is one line, not forty", () => {
  const log = [
    { actorId: "DR-1", actorName: "د. أحمد", granted: true, basis: "SHARE", scope: "summary", at: NOW },
    { actorId: "DR-1", actorName: "د. أحمد", granted: true, basis: "SHARE", scope: "medications", at: NOW + MIN },
    { actorId: "DR-1", actorName: "د. أحمد", granted: true, basis: "SHARE", scope: "labs", at: NOW + 2 * MIN },
  ];
  const h = C.accessHistory(log, NOW);
  eq(h.length, 1, "forty rows of noise is how a real intrusion hides");
  eq(h[0].scopes.sort(), ["labs", "medications", "summary"]);
  eq(h[0].count, 3);
});

it("a return visit a week later is a separate line", () => {
  const log = [
    { actorId: "DR-1", granted: true, basis: "SHARE", scope: "summary", at: NOW },
    { actorId: "DR-1", granted: true, basis: "SHARE", scope: "summary", at: NOW + 7 * DAY },
  ];
  eq(C.accessHistory(log, NOW).length, 2);
});

it("break-glass and refusals are labelled in the patient's own words", () => {
  const h = C.accessHistory([
    { actorId: "DR-7", granted: true, basis: "BREAK_GLASS", scope: "summary", at: NOW },
    { actorId: "DR-9", granted: false, basis: null, reason: "NO_ACTIVE_SHARE", scope: "labs", at: NOW - HOUR },
  ], NOW);
  ok(h[0].label.includes("طوارئ"));
  ok(h[1].label.includes("مرفوضة"));
});

it("the patient is alerted about emergency access and refused attempts", () => {
  const a = C.accessAlerts([
    { actorId: "DR-7", granted: true, basis: "BREAK_GLASS", at: NOW - DAY },
    { actorId: "DR-9", granted: false, at: NOW - 2 * DAY },
  ], NOW);
  eq(a.map((x) => x.kind).sort(), ["BREAK_GLASS", "DENIED"]);
});

/* ==================== ACCESS REQUEST ==================== */
describe("١٠ · طلب الطبيب للوصول");

it("a request must say WHY", () => {
  eq(C.requestAccess({ patientId: PT, requester: DR }, NOW).reason, "PURPOSE_REQUIRED",
    "'Dr Ahmed wants to see your medicines' is a decision; an unexplained prompt is a guess");
});

it("an unanswered request dies on its own", () => {
  const r = C.requestAccess({ patientId: PT, requester: DR, purpose: "مراجعة أدويتك" }, NOW).request;
  eq(C.requestState(r, NOW + 5 * MIN), C.REQ_STATE.PENDING);
  eq(C.requestState(r, NOW + 20 * MIN), C.REQ_STATE.EXPIRED,
    "a prompt that lives forever gets tapped by accident six weeks later");
});

it("approving cannot widen what was asked for", () => {
  const r = C.requestAccess({ patientId: PT, requester: DR, purpose: "مراجعة",
    scopes: [C.SCOPE.MEDICATIONS] }, NOW).request;
  const res = C.respondToRequest(r, C.REQ_STATE.APPROVED, PT, NOW,
    { scopes: [C.SCOPE.MEDICATIONS, C.SCOPE.LABS, C.SCOPE.DOCUMENTS], duration: "VISIT" });
  ok(res.ok);
  no(res.share.scopes.includes(C.SCOPE.LABS), "the same tap must never widen the grant");
  ok(res.share.scopes.includes(C.SCOPE.MEDICATIONS));
});

it("a patient can NARROW what was asked for", () => {
  const r = C.requestAccess({ patientId: PT, requester: DR, purpose: "مراجعة",
    scopes: [C.SCOPE.MEDICATIONS, C.SCOPE.LABS, C.SCOPE.DOCUMENTS] }, NOW).request;
  const res = C.respondToRequest(r, C.REQ_STATE.APPROVED, PT, NOW, { scopes: [C.SCOPE.MEDICATIONS] });
  no(res.share.scopes.includes(C.SCOPE.DOCUMENTS));
});

it("declining creates no share at all", () => {
  const r = C.requestAccess({ patientId: PT, requester: DR, purpose: "مراجعة" }, NOW).request;
  const res = C.respondToRequest(r, C.REQ_STATE.DECLINED, PT, NOW);
  ok(res.ok); eq(res.share, null);
});

it("only the patient answers a request about their own record", () => {
  const r = C.requestAccess({ patientId: PT, requester: DR, purpose: "مراجعة" }, NOW).request;
  eq(C.respondToRequest(r, C.REQ_STATE.APPROVED, "DR-1", NOW).reason, "PATIENT_MUST_RESPOND");
});

/* ==================== PATIENT-HELD SUMMARY ==================== */
describe("١١ · الملخّص المحمول — نمط موزمبيق");

it("a carry code is single-use", () => {
  const c = C.issueCarryCode(PT, [C.SCOPE.SUMMARY], NOW, "QR-ABC").carry;
  const first = C.redeemCarryCode(c, DR, NOW + HOUR);
  ok(first.ok);
  eq(C.redeemCarryCode(first.carry, { id: "DR-2" }, NOW + 2 * HOUR).reason, "ALREADY_REDEEMED",
    "a printed QR that opens the record forever is a record with no access control");
});

it("a carry code expires even if never used", () => {
  const c = C.issueCarryCode(PT, [C.SCOPE.SUMMARY], NOW, "QR-ABC").carry;
  eq(C.redeemCarryCode(c, DR, NOW + 100 * HOUR).reason, "EXPIRED");
});

it("redeeming produces an ordinary visit-length share, not permanent access", () => {
  const c = C.issueCarryCode(PT, [C.SCOPE.SUMMARY, C.SCOPE.LABS], NOW, "QR-ABC").carry;
  const r = C.redeemCarryCode(c, DR, NOW);
  eq(r.share.duration, "VISIT");
  eq(r.share.modality, "QR");
  ok(r.share.scopes.includes(C.SCOPE.ALLERGIES), "the safety floor applies to paper too");
});

it("the patient chooses the duration the code hands over, not just the scope", () => {
  const c = C.issueCarryCode(PT, [C.SCOPE.SUMMARY], NOW, "QR-ABC", "WEEK").carry;
  eq(c.duration, "WEEK");
  eq(C.redeemCarryCode(c, DR, NOW).share.duration, "WEEK",
    "what the patient chose is what the clinic gets");
});

it("an unrecognised or absent duration costs the patient LESS access, never more", () => {
  /* Direction matters in a defaulting bug. A code issued before this field
     existed carries no duration at all, and the safe reading of silence is
     the shortest option — not the longest. */
  eq(C.issueCarryCode(PT, [C.SCOPE.SUMMARY], NOW, "QR-A").carry.duration, "VISIT");
  eq(C.issueCarryCode(PT, [C.SCOPE.SUMMARY], NOW, "QR-B", "FOREVER").carry.duration, "VISIT");
  eq(C.redeemCarryCode({ code: "X", patientId: PT, scopes: [C.SCOPE.SUMMARY],
    issuedAt: NOW, expiresAt: NOW + 10 * HOUR, redeemedBy: null }, DR, NOW).share.duration, "VISIT",
    "a code stored before the field existed still redeems, and redeems short");
});

/* ==================== REPORT ==================== */
console.log("\n" + "─".repeat(56));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
