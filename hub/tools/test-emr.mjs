#!/usr/bin/env node
/* ============================================================
   قريب · اختبارات السجل الصحي الطولي
   ============================================================
   Run:  node tools/test-emr.mjs

   The 30 mandatory scenarios from the brief, plus the adversarial cases the
   brief did not ask for but the failure research demands. Every case here is
   a rule a patient can be harmed by getting wrong.

   Evaluates js/emr.js in a Node vm — the tested bytes and the shipped bytes
   are the same bytes.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(HUB, "js/emr.js"), "utf8"), ctx, { filename: "emr.js" });
const E = ctx.EMR;

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
const DAY = 86400000;
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/* ==================== 1-2 · REGISTRATION ==================== */
describe("١ · التسجيل");

it("1. patient registers with a name and a national ID", () => {
  const r = E.canRegister({ name: "علي حسن محمود", identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "199012345" }] });
  ok(r.ok);
});

it("a displaced patient with only a UNHCR number can register", () => {
  ok(E.canRegister({ name: "زينب كاظم علي", identifiers: [{ type: E.ID_TYPE.UNHCR, value: "IRQ-2024-88" }] }).ok,
    "a patient with no national card must still be registerable");
});

it("a name alone is not enough to find someone again", () => {
  eq(E.canRegister({ name: "محمد علي" }).reason, "NEED_IDENTIFIER_OR_DOB");
});

it("a birth date alone is sufficient when no document exists", () => {
  ok(E.canRegister({ name: "فاطمة جبار", birthDate: "1988-04-02" }).ok);
});

/* ==================== 2-3 · MATCHING ==================== */
describe("٢ · المطابقة وكشف التكرار");

const p1 = { id: "P1", name: "علي حسن محمود", sex: "male", birthDate: "1990-01-15",
  district: "mansour", identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "199012345" },
                                      { type: E.ID_TYPE.MOBILE, value: "9647801234567" }] };

it("2. the same person entered twice is detected", () => {
  const p2 = { id: "P2", name: "علي حسن محمود", sex: "male", birthDate: "1990-01-15",
    identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "199012345" }] };
  const m = E.matchScore(p1, p2);
  ok(m.score >= E.MATCH.STRONG, "score was " + m.score);
  eq(E.matchVerdict(m.score), "REVIEW_LIKELY");
});

it("Arabic orthographic variants are not different people", () => {
  eq(E.normArKey("عبد الله"), E.normArKey("عبدالله"), "spacing");
  eq(E.normAr("أحمد"), E.normAr("احمد"), "hamza");
  eq(E.normAr("فاطمه"), E.normAr("فاطمة"), "ta marbuta");
  eq(E.normAr("مصطفى"), E.normAr("مصطفي"), "alef maqsura");
});

it("a DISAGREEING national ID overpowers agreeing name and birth date", () => {
  /* Two brothers, same name chain, same birth year, different cards. */
  const brother = { id: "P3", name: "علي حسن محمود", sex: "male", birthDate: "1990-01-15",
    identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "199099999" }] };
  const m = E.matchScore(p1, brother);
  no(m.score >= E.MATCH.STRONG, "must not be a likely match, got " + m.score);
  ok(m.factors.some((f) => f.f === "national" && !f.agree), "must record the disagreement");
});

it("a different sex is strong evidence against", () => {
  const other = { id: "P4", name: "علي حسن محمود", sex: "female", birthDate: "1990-01-15" };
  no(E.matchScore(p1, other).score >= E.MATCH.REVIEW);
});

it("3. candidates go to review — the system NEVER merges by itself", () => {
  const cands = E.findCandidates(p1, [p1, { id: "P2", name: "علي حسن محمود", sex: "male", birthDate: "1990-01-15" }]);
  ok(cands.length >= 1);
  ok(cands.every((c) => c.verdict.startsWith("REVIEW")), "no verdict may be an automatic merge");
  ok(cands[0].factors.length, "the reviewer must see WHY");
});

it("a merge requires an actor and a reason", () => {
  const rev = { id: "R1", state: E.MERGE_STATE.PENDING };
  eq(E.mergeDecision(rev, E.MERGE_STATE.MERGED, null, NOW, "same").reason, "ACTOR_REQUIRED");
  eq(E.mergeDecision(rev, E.MERGE_STATE.MERGED, "DR1", NOW, "").reason, "REASON_REQUIRED");
  ok(E.mergeDecision(rev, E.MERGE_STATE.MERGED, "DR1", NOW, "same card and DOB").ok);
});

it("a decided review cannot be decided again", () => {
  const done = { id: "R1", state: E.MERGE_STATE.MERGED };
  no(E.mergeDecision(done, E.MERGE_STATE.DIFFERENT, "DR1", NOW, "x").ok);
});

/* ==================== 4-6 · ENCOUNTER ==================== */
describe("٣ · الزيارة والتوقيع والملحق");

const draft = { id: "E1", patientId: "P1", clinicianId: "DR1", facilityId: "F1",
  type: E.ENC_TYPE.OUTPATIENT, chiefComplaint: "ألم بطن علوي", assessment: "اشتباه حصى مرارة",
  state: E.ENC_STATE.DRAFT, startedAt: ago(400) };

it("4-5. a complete encounter can be signed by its author", () => {
  const r = E.signEncounter(draft, "DR1", NOW);
  ok(r.ok);
  eq(r.encounter.state, E.ENC_STATE.SIGNED);
  eq(r.encounter.signedBy, "DR1");
});

it("an incomplete encounter names exactly what is missing", () => {
  const r = E.canSign({ ...draft, assessment: "", chiefComplaint: "" });
  no(r.ok);
  ok(r.missing.includes("assessment") && r.missing.includes("chiefComplaint"));
});

it("only the author may sign — a colleague may not sign for them", () => {
  eq(E.signEncounter(draft, "DR2", NOW).reason, "ONLY_AUTHOR_MAY_SIGN");
});

it("6. a signed encounter is NOT editable — corrections are addenda", () => {
  const signed = E.signEncounter(draft, "DR1", NOW).encounter;
  const r = E.addAddendum(signed, { text: "الألم بدأ قبل أسبوعين لا أسبوع", reason: "تصحيح التاريخ", authorId: "DR1", at: NOW });
  ok(r.ok);
  eq(r.encounter.state, E.ENC_STATE.AMENDED);
  eq(r.encounter.addenda.length, 1);
  eq(r.encounter.assessment, "اشتباه حصى مرارة", "the ORIGINAL text must be untouched");
});

it("an addendum without a reason is refused", () => {
  const signed = E.signEncounter(draft, "DR1", NOW).encounter;
  eq(E.addAddendum(signed, { text: "x", authorId: "DR1", at: NOW }).reason, "REASON_REQUIRED");
});

it("a draft cannot take an addendum — sign it first", () => {
  eq(E.addAddendum(draft, { text: "x", reason: "y", authorId: "DR1", at: NOW }).reason, "SIGN_FIRST");
});

it("voiding is marked, attributed and reasoned — never a delete", () => {
  const signed = E.signEncounter(draft, "DR1", NOW).encounter;
  const v = E.voidEncounter(signed, "DR1", NOW, "سُجّلت على مريض خطأ");
  ok(v.ok);
  eq(v.encounter.state, E.ENC_STATE.VOID);
  ok(v.encounter.voidReason && v.encounter.voidedBy);
  eq(v.encounter.chiefComplaint, "ألم بطن علوي", "content persists so the error is auditable");
});

/* ==================== 7-10 · LONGITUDINAL ==================== */
describe("٤ · القوائم الطولية");

it("7. chronic and active are orthogonal, not one flag", () => {
  ok(E.isChronicActive({ chronic: true, clinicalStatus: E.COND_STATE.ACTIVE }));
  no(E.isChronicActive({ chronic: true, clinicalStatus: E.COND_STATE.RESOLVED }), "resolved chronic is not active");
  no(E.isChronicActive({ chronic: false, clinicalStatus: E.COND_STATE.ACTIVE }), "acute active is not chronic");
});

it("a problem nobody reviewed in 18 months is flagged stale", () => {
  const list = [
    { id: "C1", display: "السكري", clinicalStatus: E.COND_STATE.ACTIVE, chronic: true, lastReviewed: ago(30) },
    { id: "C2", display: "ارتفاع ضغط", clinicalStatus: E.COND_STATE.ACTIVE, chronic: true, lastReviewed: ago(900) },
  ];
  const a = E.activeConditions(list, NOW);
  eq(a.find((c) => c.id === "C1").stale, false);
  eq(a.find((c) => c.id === "C2").stale, true);
});

it("resolved problems leave the active list", () => {
  const list = [{ id: "C3", clinicalStatus: E.COND_STATE.RESOLVED }, { id: "C4", clinicalStatus: E.COND_STATE.ACTIVE }];
  eq(E.activeConditions(list, NOW).map((c) => c.id), ["C4"]);
});

it("8-9. a medication cannot be stopped without a reason", () => {
  const med = { id: "M1", display: "ميتفورمين", status: E.MED_STATE.ACTIVE, startDate: ago(200) };
  eq(E.stopMedication(med, { at: NOW, actor: "DR1" }).reason, "STOP_REASON_REQUIRED");
  const r = E.stopMedication(med, { at: NOW, actor: "DR1", reason: "قصور كلوي" });
  ok(r.ok);
  eq(r.medication.stopReason, "قصور كلوي");
  eq(r.medication.status, E.MED_STATE.STOPPED);
});

it("an expired course is UNCONFIRMED, never 'current'", () => {
  const old = { id: "M2", display: "أوجمنتين", status: E.MED_STATE.ACTIVE, startDate: ago(60), durationDays: 7 };
  eq(E.medStatus(old, NOW), E.MED_STATE.UNCONFIRMED, "a 7-day course started 60 days ago is not current");
});

it("an open-ended medication goes UNCONFIRMED after six months without review", () => {
  eq(E.medStatus({ status: E.MED_STATE.ACTIVE, startDate: ago(400) }, NOW), E.MED_STATE.UNCONFIRMED);
  eq(E.medStatus({ status: E.MED_STATE.ACTIVE, startDate: ago(30) }, NOW), E.MED_STATE.ACTIVE);
});

it("a stopped medication never reappears as current", () => {
  const meds = [{ id: "M3", status: E.MED_STATE.STOPPED, startDate: ago(300), stopDate: ago(100) }];
  eq(E.currentMedications(meds, NOW).length, 0);
});

it("10. a high-criticality allergy sorts first and a refuted one disappears", () => {
  const list = [
    { substance: "لاتكس", criticality: E.CRITICALITY.LOW },
    { substance: "بنسلين", criticality: E.CRITICALITY.HIGH },
    { substance: "أسبرين", verificationStatus: E.VERIFY.REFUTED, criticality: E.CRITICALITY.HIGH },
  ];
  const a = E.criticalAllergies(list);
  eq(a[0].substance, "بنسلين");
  no(a.some((x) => x.substance === "أسبرين"), "a refuted allergy must not be shown as real");
});

/* ==================== 11-13 · LABS & IMAGING ==================== */
describe("٥ · المختبر والأشعة");

it("11. a result is flagged against its own reference range", () => {
  eq(E.flagResult({ value: 9.1, refLow: 12, refHigh: 16 }), "low");
  eq(E.flagResult({ value: 14, refLow: 12, refHigh: 16 }), "normal");
  eq(E.flagResult({ value: 18, refLow: 12, refHigh: 16 }), "high");
});

it("12. a trend is built in chronological order with a direction", () => {
  const res = [
    { code: "718-7", value: 9.1, unit: "g/dL", effectiveAt: ago(30), performerId: "LAB1" },
    { code: "718-7", value: 11.2, unit: "g/dL", effectiveAt: ago(700), performerId: "LAB1" },
    { code: "718-7", value: 10.4, unit: "g/dL", effectiveAt: ago(365), performerId: "LAB1" },
  ];
  const t = E.trend(res, "718-7");
  eq(t.points.map((p) => p.value), [11.2, 10.4, 9.1], "must be oldest-first");
  eq(t.direction, "falling");
  eq(t.comparable, true);
});

it("a trend across DIFFERENT laboratories declares itself incomparable", () => {
  const res = [
    { code: "718-7", value: 11.2, unit: "g/dL", effectiveAt: ago(700), performerId: "LAB1" },
    { code: "718-7", value: 9.1, unit: "g/dL", effectiveAt: ago(30), performerId: "LAB2" },
  ];
  const t = E.trend(res, "718-7");
  ok(t.mixedLabs, "must flag mixed laboratories");
  no(t.comparable, "must NOT present a confident line across labs");
  eq(t.labs.length, 2);
});

it("a trend with mixed units is flagged", () => {
  const t = E.trend([
    { code: "X", value: 1, unit: "mg/dL", effectiveAt: ago(10) },
    { code: "X", value: 2, unit: "mmol/L", effectiveAt: ago(5) },
  ], "X");
  ok(t.mixedUnits);
  no(t.comparable);
});

/* ==================== 14-17 · EPISODES, SURGERY, CLOSED LOOP ==================== */
describe("٦ · الحلقة والجراحة والمتابعة");

it("14. an episode follows a declared lifecycle", () => {
  ok(E.canEpTransition(E.EP_STATE.OPEN, E.EP_STATE.ACTIVE));
  ok(E.canEpTransition(E.EP_STATE.ACTIVE, E.EP_STATE.COMPLETED));
  no(E.canEpTransition(E.EP_STATE.OPEN, E.EP_STATE.COMPLETED), "cannot complete what never became active");
  no(E.canEpTransition(E.EP_STATE.COMPLETED, E.EP_STATE.ACTIVE), "completed is terminal");
});

it("15. an episode CANNOT close while histopathology is pending", () => {
  const ep = { id: "EP1", status: E.EP_STATE.ACTIVE, pendingSupplementary: true };
  const r = E.canCloseEpisode(ep, []);
  no(r.ok, "this is the route by which a cancer diagnosis is lost");
  ok(r.blockers.includes("SUPPLEMENTARY_PENDING"));
});

it("an episode cannot close over a blocking open task", () => {
  const ep = { id: "EP1", status: E.EP_STATE.ACTIVE };
  const r = E.canCloseEpisode(ep, [{ id: "T9", episodeId: "EP1", blocking: true, status: E.TASK_STATE.OPEN }]);
  no(r.ok);
  ok(r.blockers.some((b) => b.startsWith("OPEN_TASK")));
});

it("an episode with everything resolved closes", () => {
  ok(E.canCloseEpisode({ id: "EP1", status: E.EP_STATE.ACTIVE }, [
    { id: "T1", episodeId: "EP1", blocking: true, status: E.TASK_STATE.DONE }]).ok);
});

it("16. tasks are derived from what did NOT happen", () => {
  const t = E.deriveTasks({
    orders: [{ id: "O1", patientId: "P1", requesterId: "DR1", expectedAt: NOW - DAY }],
    results: [{ id: "R1", patientId: "P1", abnormal: true, orderedBy: "DR1", reportedAt: NOW - 2 * DAY }],
    specimens: [{ id: "S1", patientId: "P1", surgeonId: "DR2" }],
    followUps: [{ id: "F1", patientId: "P1", ownerId: "DR1", dueAt: NOW - 5 * DAY }],
  }, NOW);
  const kinds = t.map((x) => x.kind);
  ok(kinds.includes(E.TASK_KIND.ORDER_NO_RESULT), "an order with no result must surface");
  ok(kinds.includes(E.TASK_KIND.RESULT_ACK), "an abnormal result with no acknowledgement must surface");
  ok(kinds.includes(E.TASK_KIND.PATHOLOGY_PENDING), "an unreported specimen must surface");
  ok(kinds.includes(E.TASK_KIND.FOLLOWUP_DUE));
});

it("an acknowledged abnormal result stops generating a task", () => {
  const t = E.deriveTasks({ results: [{ id: "R1", patientId: "P1", abnormal: true, acknowledgedBy: "DR1" }] }, NOW);
  eq(t.length, 0);
});

it("17. an overdue task is surfaced first", () => {
  const tasks = [
    { id: "T1", status: E.TASK_STATE.OPEN, dueAt: NOW + 10 * DAY },
    { id: "T2", status: E.TASK_STATE.OPEN, dueAt: NOW - 3 * DAY },
  ];
  const o = E.openTasks(tasks, NOW);
  eq(o[0].id, "T2");
  eq(o[0].overdue, true);
});

it("REGRESSION: overdue works with ISO strings AND epoch milliseconds", () => {
  /* This silently broke every fail-safe register: dueAt arrived as an ISO
     string, now as a number, the comparison coerced to NaN, and EVERY overdue
     task read as on-time. A whole safety subsystem disabled by a type. */
  const iso = { id: "T-iso", status: E.TASK_STATE.OPEN, dueAt: ago(3) };
  const num = { id: "T-num", status: E.TASK_STATE.OPEN, dueAt: NOW - 3 * DAY };
  ok(E.isOverdue(iso, NOW), "ISO string dueAt must be comparable");
  ok(E.isOverdue(num, NOW), "epoch dueAt must be comparable");
  no(E.isOverdue({ id: "T-f", status: E.TASK_STATE.OPEN, dueAt: ago(-5) }, NOW), "future is not overdue");
  no(E.isOverdue({ id: "T-n", status: E.TASK_STATE.OPEN, dueAt: null }, NOW), "no due date is not overdue");
  no(E.isOverdue({ id: "T-d", status: E.TASK_STATE.DONE, dueAt: ago(9) }, NOW), "done is never overdue");
});

it("REGRESSION: an abnormal result generates a task whether flagged or computed", () => {
  const computed = E.deriveTasks({ results: [{ id: "RA", patientId: "P1",
    value: 9.1, refLow: 12, refHigh: 16, effectiveAt: ago(5), orderedBy: "DR1" }] }, NOW);
  ok(computed.some((t) => t.kind === E.TASK_KIND.RESULT_ACK), "computed from the reference range");
  const flagged = E.deriveTasks({ results: [{ id: "RB", patientId: "P1",
    abnormal: true, effectiveAt: ago(5), orderedBy: "DR1" }] }, NOW);
  ok(flagged.some((t) => t.kind === E.TASK_KIND.RESULT_ACK), "flagged by an external lab with no range");
  ok(computed[0].overdue, "and it is overdue on arrival — nobody has looked");
});

it("a task closes only by a named human action, never by time", () => {
  const t = { id: "T1", status: E.TASK_STATE.OPEN };
  eq(E.closeTask(t, null, NOW).reason, "ACTOR_REQUIRED");
  const r = E.closeTask(t, "DR1", NOW);
  ok(r.ok);
  eq(r.task.completedBy, "DR1");
});

/* ==================== 18-19 · EXTERNAL RECORDS ==================== */
describe("٧ · السجلات الخارجية");

const ext = { id: "X1", status: E.EXT_STATE.UNVERIFIED, sourceFacility: "مختبر النور", importedBy: "P1" };

it("18. an imported record lands UNVERIFIED and cannot be promoted", () => {
  no(E.canPromote(ext), "an unverified external record must never enter the authoritative lists");
});

it("19. a clinician verifies, rejects, or keeps it external", () => {
  ok(E.verifyExternal(ext, E.EXT_STATE.VERIFIED, "DR1", NOW).ok);
  ok(E.verifyExternal(ext, E.EXT_STATE.KEPT_EXTERNAL, "DR1", NOW).ok);
  eq(E.verifyExternal(ext, E.EXT_STATE.REJECTED, "DR1", NOW).reason, "REASON_REQUIRED");
  ok(E.verifyExternal(ext, E.EXT_STATE.REJECTED, "DR1", NOW, "تخص مريضاً آخر").ok);
});

it("only a verified external record may be promoted", () => {
  const v = E.verifyExternal(ext, E.EXT_STATE.VERIFIED, "DR1", NOW).record;
  ok(E.canPromote(v));
  const k = E.verifyExternal(ext, E.EXT_STATE.KEPT_EXTERNAL, "DR1", NOW).record;
  no(E.canPromote(k), "kept-external is explicitly NOT authoritative");
});

it("an already-decided record cannot be re-decided silently", () => {
  const v = E.verifyExternal(ext, E.EXT_STATE.VERIFIED, "DR1", NOW).record;
  no(E.verifyExternal(v, E.EXT_STATE.REJECTED, "DR2", NOW, "x").ok);
});

/* ==================== 20-23 · ACCESS CONTROL ==================== */
describe("٨ · الصلاحيات");

const treating = { treatingRelationship: true, sameFacility: true };

it("20. an unauthenticated request is refused", () => {
  no(E.canAccess(null, "P1", E.CLASS.PROBLEM, treating).ok);
  no(E.canAccess({}, "P1", E.CLASS.NOTE, treating).ok);
});

it("21. RECEPTION cannot see clinical information — at all", () => {
  const rec = { id: "U1", role: E.ROLE.RECEPTION };
  ok(E.canAccess(rec, "P1", E.CLASS.DEMOGRAPHIC, treating).ok, "may see who is booked");
  for (const c of [E.CLASS.PROBLEM, E.CLASS.NOTE, E.CLASS.MEDICATION, E.CLASS.RESULT, E.CLASS.IMAGING]) {
    no(E.canAccess(rec, "P1", c, treating).ok, "reception must not see " + c);
  }
});

it("a nurse sees medications and vitals but not clinical notes", () => {
  const n = { id: "U2", role: E.ROLE.NURSE };
  ok(E.canAccess(n, "P1", E.CLASS.MEDICATION, treating).ok);
  ok(E.canAccess(n, "P1", E.CLASS.VITALS, treating).ok);
  no(E.canAccess(n, "P1", E.CLASS.NOTE, treating).ok);
});

it("22. a doctor with NO treating relationship is refused", () => {
  const d = { id: "U3", role: E.ROLE.DOCTOR };
  eq(E.canAccess(d, "P1", E.CLASS.NOTE, { treatingRelationship: false }).reason, "NO_TREATING_RELATIONSHIP");
  ok(E.canAccess(d, "P1", E.CLASS.NOTE, treating).ok);
});

it("a specialist with a treating relationship reads the longitudinal record", () => {
  ok(E.canAccess({ id: "U4", role: E.ROLE.SPECIALIST }, "P1", E.CLASS.PROBLEM, treating).ok);
});

it("sensitive data needs an explicit grant even for a treating doctor", () => {
  const d = { id: "U3", role: E.ROLE.DOCTOR };
  eq(E.canAccess(d, "P1", E.CLASS.SENSITIVE, treating).reason, "SENSITIVE_RESTRICTED");
  ok(E.canAccess(d, "P1", E.CLASS.SENSITIVE, { ...treating, sensitiveGrant: true }).ok);
});

it("a patient reads their own record and NOBODY else's", () => {
  const me = { id: "U5", role: E.ROLE.PATIENT, patientId: "P1" };
  ok(E.canAccess(me, "P1", E.CLASS.RESULT, {}).ok);
  eq(E.canAccess(me, "P2", E.CLASS.RESULT, {}).reason, "NOT_YOUR_RECORD");
  ok(E.canAccess(me, "P1", E.CLASS.AUDIT, {}).ok, "the patient must be able to see who opened their record");
  no(E.canAccess(me, "P1", E.CLASS.NOTE, {}).ok, "clinician notes are not in the patient grant by default");
});

it("23. break-glass demands a real reason and is time-boxed", () => {
  const d = { id: "U3", role: E.ROLE.DOCTOR };
  eq(E.breakGlass(d, "P1", "urgent", NOW).reason, "REASON_TOO_SHORT");
  const g = E.breakGlass(d, "P1", "مريض فاقد للوعي في الطوارئ ولا يمكن أخذ موافقته", NOW);
  ok(g.ok);
  ok(g.grant.notifyPatient, "the PATIENT must be told, not only compliance");
  ok(E.breakGlassActive(g.grant, NOW + 10 * 60000));
  no(E.breakGlassActive(g.grant, NOW + 2 * 3600000), "must expire");
});

it("reception and patients can never break glass", () => {
  no(E.breakGlass({ id: "U1", role: E.ROLE.RECEPTION }, "P1", "any long enough reason here", NOW).ok);
  no(E.breakGlass({ id: "U5", role: E.ROLE.PATIENT }, "P1", "any long enough reason here", NOW).ok);
});

it("break-glass opens sensitive data that would otherwise be refused", () => {
  ok(E.canAccess({ id: "U3", role: E.ROLE.DOCTOR }, "P1", E.CLASS.SENSITIVE,
    { breakGlass: true, treatingRelationship: false }).ok);
});

/* ==================== 24-25 · PROVENANCE ==================== */
describe("٩ · المصدرية");

it("24. every datum knows who recorded it, when, and whether it was verified", () => {
  const p = E.provenance({ recordedBy: "DR1", recordedAt: NOW, facilityId: "F1", source: E.SOURCE.CLINICIAN });
  eq(p.recordedBy, "DR1");
  eq(p.verificationStatus, E.VERIFY.CONFIRMED);
  no(p.aiGenerated);
});

it("25. an AI-generated assertion is NEVER authoritative, whatever the caller claims", () => {
  const p = E.provenance({ source: E.SOURCE.AI, verificationStatus: E.VERIFY.CONFIRMED, recordedBy: "AI" });
  ok(p.aiGenerated);
  no(E.isAuthoritative({ source: E.SOURCE.AI, verificationStatus: E.VERIFY.CONFIRMED }),
    "an AI item must not be authoritative even if flagged confirmed");
});

it("patient-reported and external items are distinguishable from clinician-confirmed", () => {
  no(E.isAuthoritative({ source: E.SOURCE.EXTERNAL, verificationStatus: E.VERIFY.EXTERNAL }));
  ok(E.isAuthoritative({ source: E.SOURCE.PATIENT, verificationStatus: E.VERIFY.CONFIRMED }),
    "a clinician-confirmed patient report IS authoritative");
});

/* ==================== 26-28 · SNAPSHOT & TIMELINE ==================== */
describe("١٠ · اللقطة والخط الزمني");

const PT = {
  id: "P1", name: "علي حسن محمود", sex: "male", birthDate: "1990-01-15",
  allergies: [{ substance: "بنسلين", criticality: E.CRITICALITY.HIGH, reaction: "طفح" }],
  conditions: [
    { id: "C1", display: "داء السكري النوع ٢", clinicalStatus: E.COND_STATE.ACTIVE, chronic: true,
      onsetDate: ago(800), lastReviewed: ago(20), episodeId: "EP-DM" },
    { id: "C2", display: "حصى المرارة", clinicalStatus: E.COND_STATE.RESOLVED, onsetDate: ago(420), episodeId: "EP-GB" },
  ],
  medications: [
    { id: "M1", display: "ميتفورمين ٥٠٠", startDate: ago(700), lastConfirmed: ago(20), status: E.MED_STATE.ACTIVE, episodeId: "EP-DM" },
    { id: "M2", display: "أوجمنتين", startDate: ago(400), durationDays: 7, status: E.MED_STATE.ACTIVE },
  ],
  procedures: [{ id: "PR1", display: "استئصال المرارة بالمنظار", performedAt: ago(380), major: true, episodeId: "EP-GB" }],
  results: [
    { id: "R1", code: "4548-4", display: "HbA1c", value: 9.1, unit: "%", refLow: 4, refHigh: 5.6, effectiveAt: ago(800) },
    { id: "R2", code: "4548-4", display: "HbA1c", value: 7.4, unit: "%", refLow: 4, refHigh: 5.6, effectiveAt: ago(20) },
    { id: "R3", code: "718-7", display: "الهيموغلوبين", value: 14, unit: "g/dL", refLow: 12, refHigh: 16, effectiveAt: ago(20) },
  ],
  imaging: [{ id: "I1", modality: "سونار", bodySite: "البطن", impression: "حصى مرارة", effectiveAt: ago(420), episodeId: "EP-GB" }],
  encounters: [{ id: "E1", chiefComplaint: "متابعة سكري", assessment: "مضبوط", startedAt: ago(20),
                 clinicianId: "DR1", state: E.ENC_STATE.SIGNED, episodeId: "EP-DM" }],
  episodes: [
    { id: "EP-DM", title: "السكري", status: E.EP_STATE.ACTIVE },
    { id: "EP-GB", title: "حصى المرارة", status: E.EP_STATE.COMPLETED },
  ],
  tasks: [{ id: "T1", kind: E.TASK_KIND.FOLLOWUP_DUE, status: E.TASK_STATE.OPEN, dueAt: NOW - 2 * DAY }],
  externalRecords: [{ id: "X1", status: E.EXT_STATE.UNVERIFIED }],
};

it("26. the snapshot is derived and answers the five questions", () => {
  const s = E.snapshot(PT, NOW);
  eq(s.identity.age, 36, "age is computed, not stored");
  eq(s.allergies[0].substance, "بنسلين");
  eq(s.activeProblems.length, 1, "resolved problems are not 'active'");
  eq(s.activeProblems[0].display, "داء السكري النوع ٢");
  eq(s.majorProcedures.length, 1);
  ok(s.overdueTasks.length >= 1, "what is still pending must surface");
  eq(s.recentAbnormal.length, 2, "only abnormal results — a normal Hb is not news");
  eq(s.unconfirmedMedications, 1, "the expired Augmentin must be flagged, not shown as current");
  eq(s.unverifiedExternal, 1);
  eq(s.openEpisodes.length, 1, "the gallbladder episode is closed");
});

it("27. the timeline shows decisions, not database rows", () => {
  const t = E.buildTimeline(PT);
  const types = t.map((e) => e.type);
  ok(types.includes(E.EVT.DIAGNOSIS) && types.includes(E.EVT.PROCEDURE) && types.includes(E.EVT.IMAGING));
  eq(t.filter((e) => e.type === E.EVT.RESULT).length, 2, "only abnormal results enter the timeline");
  const dates = t.map((e) => new Date(e.at).getTime());
  eq(dates.slice().sort((a, b) => b - a), dates, "newest first");
});

it("the timeline filters by episode, type and date", () => {
  eq(E.buildTimeline(PT, { episodeId: "EP-GB" }).every((e) => e.episodeId === "EP-GB"), true);
  eq(E.buildTimeline(PT, { type: E.EVT.PROCEDURE }).length, 1);
  ok(E.buildTimeline(PT, { from: ago(100) }).length < E.buildTimeline(PT).length);
});

it("28. the episode view turns scattered events into stories", () => {
  const g = E.timelineByEpisode(PT);
  const gb = g.episodes.find((x) => x.episode.id === "EP-GB");
  ok(gb, "the gallbladder episode must exist");
  ok(gb.events.length >= 3, "diagnosis + imaging + procedure at minimum");
  ok(gb.events.every((e) => e.episodeId === "EP-GB"));
});

/* ==================== 29-30 · LOCALISATION & FHIR ==================== */
describe("١١ · اللغة والتشغيل البيني");

it("29-30. clinical concepts carry Arabic AND English display with a code", () => {
  const c = E.codeable(E.CODE_SYSTEM.SNOMED, "44054006", "داء السكري النوع ٢", "Type 2 diabetes mellitus");
  eq(c.display.ar, "داء السكري النوع ٢");
  eq(c.display.en, "Type 2 diabetes mellitus");
  ok(c.coded);
});

it("the system still works with no terminology licence — uncoded is honest, not broken", () => {
  const c = E.codeable(null, null, "ألم بطن", "Abdominal pain");
  eq(c.system, E.CODE_SYSTEM.LOCAL);
  no(c.coded, "must declare itself uncoded rather than fake a code");
  eq(c.display.ar, "ألم بطن");
});

it("every clinical entity has a declared FHIR mapping", () => {
  for (const k of ["patient", "encounter", "condition", "medication", "allergy", "result",
                   "imaging", "procedure", "episode", "task", "referral", "provenance", "audit"]) {
    ok(E.FHIR_MAP[k] && E.FHIR_MAP[k].resource, "missing FHIR map: " + k);
    ok(Object.keys(E.FHIR_MAP[k].fields).length > 0, "empty field map: " + k);
  }
  eq(E.FHIR_MAP.episode.resource, "EpisodeOfCare");
  eq(E.FHIR_MAP.medication.resource, "MedicationRequest");
});

/* ---------------------------------------------------------------- */
console.log("\n" + "─".repeat(56));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
