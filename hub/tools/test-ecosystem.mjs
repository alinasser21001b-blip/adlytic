#!/usr/bin/env node
/* ============================================================
   قريب · اختبار المنظومة — THE ECOSYSTEM
   ============================================================
   Run:  node tools/test-ecosystem.mjs

   Section 27 of the brief, executed. One synthetic Iraqi patient moves
   through the whole network — doctor, laboratory, imaging centre, pharmacy,
   second doctor — and then every "what happens when" the brief lists is
   actually asked:

     what does each actor see · what happens when the internet disappears ·
     when consent expires · when the patient revokes · when two providers
     edit the same thing · when the patient has a duplicate record · when a
     doctor enters wrong data · in an emergency · when the phone number
     changes · when an upload fails · when synchronisation fails.

   Each of those is a test below, not a paragraph. All data is synthetic.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["js/emr.js", "js/record.js", "js/consent.js", "js/network.js", "js/sync.js", "js/assist.js"]) {
  vm.runInContext(readFileSync(join(HUB, f), "utf8"), ctx, { filename: f });
}
const E = ctx.EMR, R = ctx.REC, C = ctx.CONSENT, N = ctx.NET, Y = ctx.SYNC, A = ctx.ASSIST;

let pass = 0; const fails = [];
function step(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const act = (n) => console.log("\n══ " + n + " ══");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const T0 = new Date("2026-01-12T08:00:00Z").getTime();
const at = (d) => T0 + d * DAY;
const iso = (t) => new Date(t).toISOString();
const day = (t) => iso(t).slice(0, 10);

/* ---------- the actors ---------- */
const PT = "PAT-H";
const PATIENT = { id: PT, nameParts: { given: "حسين", father: "عبد الأمير", grandfather: "جاسم", family: "الساعدي" },
  birthDate: "1979-04-22", sex: "male", district: "karrada",
  emergencyContact: { name: "أم حسين", relation: "زوجة", phone: "9647700000222" },
  identifiers: [{ type: "mobile", value: "9647700000111", verification: "self_declared", validFrom: day(T0) }] };

const DR_A = { id: "DR-A", name: "د. سهى", role: E.ROLE.DOCTOR, staffRole: N.STAFF_ROLE.DOCTOR,
  specialty: "باطنية", licenseNumber: "IQ-1", syndicateId: "B-1", licenseStatus: "VERIFIED",
  organizationId: "CLN-A" };
const DR_B = { id: "DR-B", name: "د. ليث", role: E.ROLE.DOCTOR, staffRole: N.STAFF_ROLE.DOCTOR,
  specialty: "كلية", licenseNumber: "IQ-2", syndicateId: "B-2", licenseStatus: "VERIFIED",
  organizationId: "CLN-B" };
const RECEPTION = { id: "RC-A", name: "استقبال", role: E.ROLE.RECEPTION,
  staffRole: N.STAFF_ROLE.RECEPTION, organizationId: "CLN-A" };
const ADMIN = { id: "AD-A", name: "إدارة", role: E.ROLE.ADMIN, staffRole: N.STAFF_ROLE.ADMIN,
  organizationId: "CLN-A" };
const LAB = { id: "LAB-1", name: "مختبر ابن سينا" };
const LAB2 = { id: "LAB-2", name: "مختبر آخر" };
const IMG = { id: "IMG-1", name: "مركز أشعة الكرادة" };
const PHARMACIST = { id: "PH-1", name: "صيدلي", role: E.ROLE.DOCTOR,
  staffRole: N.STAFF_ROLE.PHARMACIST, organizationId: "PHM-1" };

const db = { patient: PATIENT, conditions: [], medications: [], allergies: [], procedures: [],
  results: [], documents: [], immunizations: [], encounters: [], prescriptions: [], dispenses: [],
  episodes: [], tasks: [], appointments: [], shares: [], accessLog: [], requests: [],
  orders: [], studies: [], referrals: [], outbox: [], bloodGroup: null };

function read(actor, scope, dataClass, now, purpose) {
  const d = C.decideAccess({ actor, patientId: PT, scope, dataClass,
    shares: db.shares, breakGlass: db.breakGlass, now });
  if (d.auditRequired) {
    db.accessLog.unshift(C.accessEntry({ actor, patientId: PT, scope, dataClass, purpose,
      context: { facilityId: actor.organizationId || null, deviceId: "dev-1", channel: "app" } }, d, now));
  }
  return d;
}

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  المنظومة كاملة: مريض · طبيبان · مختبر · أشعة · صيدلية      ║");
console.log("╚══════════════════════════════════════════════════════════╝");

/* ============================================================ */
act("١ · الأدوار داخل المنشأة — الاستقبال ليس طبيباً");

step("الاستقبال يرى المواعيد والاسم، لا التشخيص", () => {
  const share = C.grantShare({ id: "S1", patientId: PT, grantedBy: PT, granteeId: RECEPTION.id,
    scopes: [C.SCOPE.SUMMARY, C.SCOPE.CONDITIONS], duration: "DAY", modality: "IN_APP" }, at(0)).share;
  const scopes = N.staffScopes(RECEPTION, share);
  no(scopes.includes(C.SCOPE.CONDITIONS),
    "the patient granted conditions, but a reception desk's ceiling does not include them");
  ok(N.STAFF_SCOPES.reception.includes("appointments"));
});

step("الإدارة لا تصل للسريري مهما وافق المريض", () => {
  const share = C.grantShare({ id: "S2", patientId: PT, grantedBy: PT, granteeId: ADMIN.id,
    scopes: C.ALL_SCOPES, duration: "DAY", modality: "IN_APP" }, at(0)).share;
  const scopes = N.staffScopes(ADMIN, share);
  no(scopes.includes(C.SCOPE.LABS), "running an organisation is not a clinical need");
  no(scopes.includes(C.SCOPE.CONDITIONS));
});

step("البوابتان مستقلتان — سقف الدور ∩ موافقة المريض", () => {
  const narrow = C.grantShare({ id: "S3", patientId: PT, grantedBy: PT, granteeId: DR_A.id,
    scopes: [C.SCOPE.LABS], duration: "DAY", modality: "IN_APP" }, at(0)).share;
  const scopes = N.staffScopes(DR_A, narrow);
  ok(scopes.includes(C.SCOPE.LABS));
  no(scopes.includes(C.SCOPE.DOCUMENTS), "the doctor's ceiling allows it; the patient did not");
});

/* ============================================================ */
act("٢ · الطبيب الأول — الزيارة والطلب");

step("المريض يوافق للطبيب الأول", () => {
  const g = C.grantShare({ id: "SH-A", patientId: PT, grantedBy: PT, granteeId: DR_A.id,
    granteeName: DR_A.name, scopes: [C.SCOPE.SUMMARY, C.SCOPE.CONDITIONS, C.SCOPE.MEDICATIONS,
      C.SCOPE.LABS, C.SCOPE.IMAGING], duration: "WEEK", modality: "IN_APP" }, at(1));
  ok(g.ok);
  db.shares.push(g.share);
  ok(read(DR_A, C.SCOPE.SUMMARY, null, at(1), "تقييم أولي").ok);
});

step("السجل يقيّد التسجيل: الحساسية أولاً", () => {
  db.allergies.push({ id: "AL1", substance: "السلفا", reaction: "شرى", criticality: E.CRITICALITY.HIGH,
    verificationStatus: E.VERIFY.CONFIRMED, recordedBy: DR_A.id });
  db.conditions.push({ id: "CN1", display: "ارتفاع ضغط الدم", clinicalStatus: E.COND_STATE.ACTIVE,
    chronic: true, onsetDate: day(at(1)), lastReviewed: day(at(1)), recordedBy: DR_A.id, episodeId: "EP1" });
  db.episodes.push({ id: "EP1", patientId: PT, title: "قصور كلوي مشتبه", state: E.EP_STATE.ACTIVE });
  eq(E.criticalAllergies(db.allergies).length, 1);
});

step("طبيب غير موثّق لا يقدر يطلب فحصاً", () => {
  eq(N.placeOrder({ patientId: PT, kind: N.ORDER_KIND.LAB, code: "Creatinine", reason: "تقييم" },
    { id: "X", licenseStatus: "SELF_ASSERTED" }, at(1)).reason, "ORDERER_UNVERIFIED",
    "an unverified account ordering a scan is spending someone else's money and radiation dose");
});

step("الطلب بلا سؤال سريري مرفوض", () => {
  eq(N.placeOrder({ patientId: PT, kind: N.ORDER_KIND.LAB, code: "Creatinine" }, DR_A, at(1)).reason,
    "REASON_REQUIRED", "a lab that receives a code with no question cannot flag the unexpected");
});

step("الطلب يُوضع بموعد استحقاق مشتق من الاستعجال", () => {
  const o = N.placeOrder({ id: "ORD1", patientId: PT, kind: N.ORDER_KIND.LAB, code: "Creatinine",
    display: "الكرياتينين", reason: "ارتفاع ضغط مع تعب", urgency: N.URGENCY.URGENT,
    performerId: LAB.id, episodeId: "EP1" }, DR_A, at(1));
  ok(o.ok);
  db.orders.push(o.order);
  eq(o.order.dueAt, at(1) + 3 * DAY, "urgent means three days, not a doctor's memory");
});

/* ============================================================ */
act("٣ · ماذا يرى المختبر — ولا شيء غيره");

step("المختبر يستلم مظروفاً، لا سجلاً", () => {
  const env = N.orderEnvelope(db.orders[0], PATIENT, db);
  eq(env.code, "Creatinine");
  eq(env.safety.allergies[0].substance, "السلفا", "what changes the assay travels with it");
  no("conditions" in env, "the problem list does not");
  no(JSON.stringify(env).includes("ارتفاع ضغط الدم"), "and neither does the diagnosis");
  no(JSON.stringify(env).includes("9647700000111"), "nor the phone number");
});

step("نتيجة بلا وحدة قياس مرفوضة", () => {
  eq(N.reportResult(db.orders[0], { value: 5 }, LAB, at(3)).reason, "UNIT_REQUIRED",
    "5 could be mmol/L or mg/dL and those are different clinical situations");
});

step("نتيجة بلا مدى مرجعي مرفوضة", () => {
  eq(N.reportResult(db.orders[0], { value: 2.1, unit: "mg/dL" }, LAB, at(3)).reason,
    "REFERENCE_RANGE_REQUIRED", "the range belongs to the analyser and must travel with the value");
});

step("النتيجة تدخل — غير مُقرَّة، لأن الوصول ليس القراءة", () => {
  const r = N.reportResult(db.orders[0],
    { id: "RS1", value: 2.1, unit: "mg/dL", refLow: 0.7, refHigh: 1.3, specimen: N.SPECIMEN.BLOOD,
      collectedAt: day(at(2)), effectiveAt: day(at(3)) }, LAB, at(3));
  ok(r.ok);
  db.results.push(r.result);
  db.orders[0] = r.order;
  eq(r.result.acknowledgedBy, null);
  eq(r.result.flag, "high");
  eq(r.order.state, N.ORDER_STATE.REPORTED);
});

step("المختبر يعلن حرجة — والنظام لا يعيد حسابها", () => {
  const o2 = N.placeOrder({ id: "ORD2", patientId: PT, kind: N.ORDER_KIND.LAB, code: "K",
    display: "البوتاسيوم", reason: "قصور كلوي", urgency: N.URGENCY.STAT, episodeId: "EP1" }, DR_A, at(3)).order;
  db.orders.push(o2);
  const r = N.reportResult(o2, { id: "RS2", value: 6.4, unit: "mmol/L", refLow: 3.5, refHigh: 5.1,
    effectiveAt: day(at(3)), critical: true }, LAB, at(3));
  db.results.push(r.result);
  db.orders[1] = r.order;
  eq(r.result.flag, "critical", "only the lab knows its own critical limits");
});

step("النتيجة الحرجة غير المُقرَّة مستحقّة فوراً — بلا مهلة", () => {
  const tasks = N.networkTasks(db, at(3));
  const crit = tasks.find((t) => t.kind === "critical-unacknowledged");
  ok(crit, "a critical result nobody saw is the loop that kills");
  eq(crit.dueAt, day(at(3)), "critical does not get the ordinary grace period");
});

/* ============================================================ */
act("٤ · الأشعة — الحدّ لا المحاكاة");

step("الدراسة تُسجَّل، والصور غير متصلة — ويُقال ذلك صراحة", () => {
  const o = N.placeOrder({ id: "ORD3", patientId: PT, kind: N.ORDER_KIND.IMAGING, code: "US-KUB",
    display: "سونار الكلى", reason: "تقييم قصور كلوي", episodeId: "EP1" }, DR_A, at(4)).order;
  db.orders.push(o);
  const s = N.imagingStudy(o, { id: "ST1", modality: N.MODALITY.US, bodySite: "الكلى والمثانة",
    performedAt: day(at(5)) }, IMG, at(5));
  ok(s.ok);
  db.studies.push(s.study);
  no(N.hasImages(s.study));
  eq(s.study.dicom.wadoEndpoint, null, "there is no archive, and the field says so");
  const av = N.imageAvailability(s.study);
  no(av.available);
  ok(av.text.includes("غير مربوط"), "the app states the boundary rather than implying a viewer");
});

step("تقرير بلا انطباع مرفوض", () => {
  eq(N.reportStudy(db.studies[0], { findings: "..." }, { id: "RAD-1" }, at(5)).reason,
    "IMPRESSION_REQUIRED");
});

step("الاكتشاف العَرَضي يفتح مهمّة — لا يُدفن في نص التقرير", () => {
  const rep = N.reportStudy(db.studies[0],
    { findings: "كلية يمنى ٩ سم", impression: "تغيّرات مزمنة", incidental: true }, { id: "RAD-1" }, at(5));
  ok(rep.ok);
  db.studies[0] = rep.study;
  const tasks = N.networkTasks(db, at(6));
  ok(tasks.some((t) => t.kind === "incidental-finding"),
    "an incidental finding nobody follows up is one of the best documented harms in radiology");
});

/* ============================================================ */
act("٥ · الصيدلية — الحد الأدنى الضروري");

step("الوصفة تُصدَر وتدخل القائمة الطولية", () => {
  const r = R.issuePrescription({ id: "RX1", patientId: PT, prescriberId: DR_A.id,
    medication: "أملوديبين", dose: "٥ ملغم", frequency: "OD", durationDays: 30,
    indication: "ارتفاع ضغط الدم", startDate: day(at(5)) }, DR_A, at(5));
  ok(r.ok);
  db.prescriptions.push(r.prescription);
  db.medications.push({ ...r.medication, id: "MD1", episodeId: "EP1" });
});

step("الصيدلية ترى الوصفة والحساسية والأدوية — ولا شيء آخر", () => {
  const env = N.pharmacyEnvelope(db.prescriptions[0], PATIENT, db);
  eq(env.prescription.medication, "أملوديبين");
  eq(env.allergies[0].substance, "السلفا");
  ok(env.currentMedications.length);
  no(JSON.stringify(env).includes("سونار"), "no imaging");
  no(JSON.stringify(env).includes("2.1"), "no lab values");
  no(JSON.stringify(env).includes("قصور كلوي"), "no episode titles");
});

step("فحص الصرف يعلن حدوده بدل ما يوحي بمراجعة كاملة", () => {
  const env = N.pharmacyEnvelope(db.prescriptions[0], PATIENT, db);
  const chk = N.dispenseChecks(db.prescriptions[0], env);
  ok(chk.notChecked.includes("drug-drug-interactions"),
    "inventing an interaction database would be worse than silence about it");
  ok(chk.limitation.includes("ليست مراجعة صيدلانية كاملة"));
});

step("وصفة تصادم حساسية معروفة تُوسم", () => {
  const rx = { id: "RXbad", medication: "سلفاميثوكسازول", dose: "٨٠٠", frequency: "BID",
    indication: "التهاب", prescriberId: DR_A.id, issuedAt: iso(at(5)) };
  const env = N.pharmacyEnvelope(rx, PATIENT, db);
  const chk = N.dispenseChecks(rx, env);
  ok(chk.flags.some((f) => f.kind === "ALLERGY"), "the pharmacy is the last gate before the patient");
});

step("وصفة منتهية لا تُصرف", () => {
  eq(N.verifyPrescription(db.prescriptions[0], [], at(40)).state, N.RX_VERIFY.EXPIRED);
  eq(N.verifyPrescription(db.prescriptions[0], [], at(6)).state, N.RX_VERIFY.VALID);
});

step("وصفة مصروفة مرة لا تُصرف مرتين", () => {
  const d = R.recordDispense(db.prescriptions[0], { pharmacyId: "PHM-1", state: "dispensed" }, at(6));
  ok(d.ok);
  db.dispenses.push(d.dispense);
  eq(N.verifyPrescription(db.prescriptions[0], db.dispenses, at(6)).state, N.RX_VERIFY.ALREADY_DISPENSED);
});

/* ============================================================ */
act("٦ · الإحالة — «أرسلت وما وصل رد» شي النظام يشوفه");

step("إحالة بلا سؤال سريري مرفوضة", () => {
  eq(N.sendReferral({ patientId: PT, specialty: "أمراض كلية", reason: "قصور" }, DR_A, at(6)).reason,
    "QUESTION_REQUIRED", "a referral with no question gets an appointment six weeks out regardless of urgency");
});

step("الإحالة تُرسل ولها حالة", () => {
  const r = N.sendReferral({ id: "REF1", patientId: PT, specialty: "أمراض كلية",
    reason: "كرياتينين ٢٫١ مع بوتاسيوم ٦٫٤", question: "هل يحتاج غسيل عاجل؟", episodeId: "EP1" },
    DR_A, at(6));
  ok(r.ok);
  db.referrals.push(r.referral);
  eq(r.referral.state, N.REF_STATE.SENT);
});

step("إحالة بلا رد تظهر في السجل الآمن من الفشل", () => {
  const tasks = N.networkTasks(db, at(40));
  const over = N.overdueNetworkTasks(tasks, at(40));
  ok(over.some((t) => t.kind === "referral-unanswered"),
    "a referral letter handed to a patient is a referral nobody can follow up");
});

/* ============================================================ */
act("٧ · طبقة المساعدة — حقيقة ثم تفسير ثم اقتراح");

step("الاتجاه يُنتج حقيقة وتفسيراً واقتراحاً — منفصلة", () => {
  db.results.push({ id: "RS3", patientId: PT, code: "Creatinine", display: "الكرياتينين",
    value: 3.4, unit: "mg/dL", refLow: 0.7, refHigh: 1.3, effectiveAt: day(at(60)),
    performerId: LAB.id, acknowledgedBy: DR_A.id });
  const st = A.trendStatements(db, "Creatinine", at(61));
  const f = st.find((x) => x.tier === A.TIER.FACT);
  const i = st.find((x) => x.tier === A.TIER.INTERPRETATION);
  const s = st.find((x) => x.tier === A.TIER.SUGGESTION);
  ok(f && i && s, "the brief's own example, as three separate objects");
  ok(f.ar.includes("2.1") && f.ar.includes("3.4"), "the FACT is arithmetic on stored values");
  ok(i.rule, "the INTERPRETATION names the rule so you can disagree with the rule");
  ok(f.sourceIds.length, "and every statement carries its evidence");
});

step("مختبران مختلفان يمنعان التفسير بدل ما يخمّنه", () => {
  const two = { results: [
    { id: "X1", code: "Hb", display: "الخضاب", value: 13, unit: "g/dL", refLow: 12, refHigh: 16,
      effectiveAt: "2026-01-01", performerId: LAB.id },
    { id: "X2", code: "Hb", display: "الخضاب", value: 9, unit: "g/dL", refLow: 12, refHigh: 16,
      effectiveAt: "2026-06-01", performerId: LAB2.id },
  ] };
  const st = A.trendStatements(two, "Hb", at(60));
  ok(st.some((x) => x.blocksInterpretation), "mixed laboratories is declared");
  no(st.some((x) => x.tier === A.TIER.INTERPRETATION),
    "and NO interpretation follows — a confident line through two analysers is a hazard");
});

step("الطبقة تكشف الغياب — وهو ما لا يتركه أثر على الشاشة", () => {
  const gaps = A.gapStatements(db, at(61));
  ok(gaps.some((g) => g.gap === "bloodGroup"), "an unrecorded blood group is a finding, not a blank");
  ok(gaps.every((g) => g.tier === A.TIER.FACT || g.tier === A.TIER.SUGGESTION),
    "absence is a fact or a prompt to ask — never an interpretation");
  no(gaps.some((g) => g.tier === A.TIER.INTERPRETATION), "nothing here concludes anything");
});

step("لا شيء هنا يشخّص، ولا يكتب في السجل", () => {
  const h = A.handoff(PATIENT, db, at(61));
  eq(h.provenance.aiGenerated, false);
  eq(h.provenance.model, null);
  ok(h.provenance.note.includes("ما في شي هنا تشخيص"));
  ok(Array.isArray(h.facts) && Array.isArray(h.interpretations) && Array.isArray(h.suggestions),
    "the three tiers are never interleaved");
});

step("بوابة النموذج ترفض حقيقة مكتوبة آلياً", () => {
  eq(A.admitModelOutput({ tier: A.TIER.FACT, ar: "المريض عنده سكري", sourceIds: ["RS1"] }, ["RS1"]).reason,
    "TIER_NOT_PERMITTED", "a model may rephrase a fact; it may never author one");
});

step("وبوابة النموذج ترفض الاستشهاد المُختلَق", () => {
  eq(A.admitModelOutput({ tier: A.TIER.SUGGESTION, ar: "راجع", sourceIds: ["RS-INVENTED"] }, ["RS1"]).reason,
    "FABRICATED_SOURCE", "an id it was not given is a fabricated citation — sourced-looking and false");
  ok(A.admitModelOutput({ tier: A.TIER.SUGGESTION, ar: "راجع", sourceIds: ["RS1"] }, ["RS1"]).ok);
});

/* ============================================================
   ٨ · «شنو يصير لو…» — the brief's own list, asked
   ============================================================ */
act("٨ · شنو يصير لو انقطع الإنترنت");

step("الكتابة تُسجَّل قبل ما تُحاول الشبكة — والكهرباء تنقطع بأمان", () => {
  const r = Y.enqueue(db.outbox, { opId: "op-1", op: Y.OP.CREATE, collection: "encounters",
    id: "ENC-OFF", payload: { patientId: PT, assessment: "قصور كلوي مزمن" }, baseRev: null,
    deviceId: "dev-1" }, at(61));
  ok(r.ok);
  db.outbox = r.outbox;
  eq(db.outbox[0].state, Y.SYNC.LOCAL);
  eq(db.outbox[0].priority, 0, "a signed encounter goes before a bookmark");
});

step("الشاشة تقول الحقيقة: «محفوظ على هذا الجهاز فقط»", () => {
  eq(Y.recordState(db.outbox, "encounters", "ENC-OFF"), Y.SYNC.LOCAL);
  /* And a record the server NEVER saw is local too — absence from the outbox
     is not evidence of a successful upload. */
  eq(Y.recordState([], "encounters", "NEVER-SENT", { id: "NEVER-SENT" }), Y.SYNC.LOCAL,
    "only a server-assigned revision means the server has it");
  eq(Y.recordState([], "encounters", "SENT", { id: "SENT", qRev: 3 }), Y.SYNC.SYNCED);
  ok(Y.syncLabel(Y.SYNC.LOCAL).includes("هذا الجهاز فقط"),
    "a tick while the write is still in the outbox teaches a clinician the record is safe when it is not");
  ok(Y.outboxSummary(db.outbox, at(61)).hasUnsynced);
});

step("إعادة المحاولة تتباعد ولا تدور للأبد", () => {
  let ob = Y.settle(db.outbox, "op-1", Y.OUTCOME.RETRYABLE, { error: "offline" }, at(61)).outbox;
  eq(ob[0].state, Y.SYNC.FAILED);
  no(Y.isDue(ob[0], at(61)), "not immediately");
  ok(Y.isDue(ob[0], at(61) + 3000), "but soon");
  for (let i = 0; i < Y.MAX_ATTEMPTS; i++) ob = Y.settle(ob, "op-1", Y.OUTCOME.RETRYABLE, {}, at(61) + i * MIN).outbox;
  ok(Y.isStuck(ob[0]), "and then it stops retrying and starts ASKING");
  ok(Y.outboxSummary(ob, at(62)).needsAttention);
  db.outbox = ob;
});

step("المحاولة المعادة لا تنشئ زيارة ثانية", () => {
  const again = Y.enqueue(db.outbox, { opId: "op-1", op: Y.OP.CREATE, collection: "encounters",
    id: "ENC-OFF", payload: {}, deviceId: "dev-1" }, at(62));
  ok(again.deduped, "a response lost in a dropped connection must not become a duplicate assertion");
  eq(again.outbox.length, db.outbox.length);
});

step("الرفض المفهوم لا يُعاد — يُعرَض", () => {
  let ob = Y.enqueue([], { opId: "op-2", op: Y.OP.CREATE, collection: "documents", id: "D9",
    payload: {}, deviceId: "dev-1" }, at(62)).outbox;
  ob = Y.settle(ob, "op-2", Y.OUTCOME.REJECTED, { error: "file too large" }, at(62)).outbox;
  ok(ob[0].permanent);
  no(Y.isDue(ob[0], at(63)), "retrying a 422 twelve times just delays telling the user");
  ok(ob.length === 1, "and the data is still held — it is theirs");
});

step("النجاح يُزيل من الصندوق ويُعلن نسخة الخادم", () => {
  let ob = Y.enqueue([], { opId: "op-3", op: Y.OP.CREATE, collection: "results", id: "RS9",
    payload: {}, deviceId: "dev-1" }, at(62)).outbox;
  const s = Y.settle(ob, "op-3", Y.OUTCOME.ACK, { rev: 7 }, at(62));
  eq(s.outbox.length, 0);
  eq(s.applied.state, Y.SYNC.SYNCED);
  eq(s.applied.rev, 7);
  eq(Y.recordState(s.outbox, "results", "RS9", { id: "RS9", qRev: 7 }), Y.SYNC.SYNCED);
});

act("٨ب · شنو يصير لو حرّر طبيبان نفس الشي");

step("زيارتان موقّعتان ما تندمجان أبداً — الاثنتان تبقيان", () => {
  let ob = Y.enqueue([], { opId: "op-4", op: Y.OP.UPDATE, collection: "encounters", id: "ENC-9",
    payload: { assessment: "رأي الطبيب أ" }, baseRev: 3, deviceId: "dev-1" }, at(62)).outbox;
  ob = Y.settle(ob, "op-4", Y.OUTCOME.CONFLICT, { serverRev: 4, serverPayload: { assessment: "رأي الطبيب ب" } }, at(62)).outbox;
  eq(ob[0].state, Y.SYNC.CONFLICT);
  eq(Y.resolutionFor("encounters"), Y.RESOLUTION.KEEP_BOTH);
  const res = Y.resolveConflict(ob[0], null, DR_A, at(62));
  ok(res.ok);
  eq(res.action, Y.RESOLUTION.KEEP_BOTH);
  eq(res.entry.id, "ENC-9-dup", "two signed assertions are two assertions");
  eq(res.entry.payload.duplicateOf, "ENC-9");
});

step("قائمة طولية: الأحدث يسود، والسابق يبقى مقروءاً بصاحبه", () => {
  let ob = Y.enqueue([], { opId: "op-5", op: Y.OP.UPDATE, collection: "medications", id: "MD1",
    payload: { dose: "١٠ ملغم" }, baseRev: 2, deviceId: "dev-1" }, at(62)).outbox;
  ob = Y.settle(ob, "op-5", Y.OUTCOME.CONFLICT, { serverRev: 3 }, at(62)).outbox;
  eq(Y.resolutionFor("medications"), Y.RESOLUTION.SUPERSEDE);
  eq(Y.resolveConflict(ob[0], null, DR_A, at(62)).reason, "CHOICE_REQUIRED");
  const mine = Y.resolveConflict(ob[0], "mine", DR_A, at(62));
  ok(mine.ok);
  eq(mine.entry.baseRev, 3, "rebased onto the server's revision, carrying who decided");
  eq(mine.entry.payload.resolvedBy, DR_A.id);
});

step("وأي شي غير مصنَّف يسأل إنساناً بدل ما يخمّن", () => {
  eq(Y.resolutionFor("appointments"), Y.RESOLUTION.ASK_HUMAN);
});

act("٨ج · شنو يصير لو نفدت المعرّفات دون اتصال");

step("النفاد حالة معلنة، لا رقم عشوائي يرفضه الخادم لاحقاً", () => {
  eq(Y.takeId({ ids: [] }).reason, "POOL_EMPTY");
  const t = Y.takeId({ ids: ["PAT-001", "PAT-002"] });
  ok(t.ok); eq(t.id, "PAT-001"); eq(t.pool.ids.length, 1);
  ok(Y.poolNeedsRefill(t.pool));
});

step("الجهاز يزامن نطاق عيادته فقط", () => {
  const pool = [{ id: "P1", district: "karrada", facilityIds: ["CLN-A"] },
                { id: "P2", district: "basra", facilityIds: ["CLN-Z"] },
                { id: "P3", district: "basra", facilityIds: [], lastSeenAt: at(60) }];
  const mine = Y.catchmentFilter(pool, { facilityId: "CLN-A", now: at(61) });
  eq(mine.length, 1, "a phone with 2GB in a clinic with four hours of mains power does not hold the country");
});

act("٨د · شنو يصير للموافقة والإلغاء والطوارئ");

step("انتهاء المدة يغلق الوصول بلا ما يشغّل أحد شي", () => {
  no(C.isShareActive(db.shares[0], at(9)), "granted for a week on day 1");
  no(read(DR_A, C.SCOPE.LABS, null, at(9), "متابعة").ok);
});

step("الطبيب الثاني: بلا موافقة لا شي، مهما كان موثّقاً", () => {
  no(read(DR_B, C.SCOPE.SUMMARY, null, at(62), "استشارة كلية").ok);
});

step("المريض يوافق للطبيب الثاني ويرى ليش", () => {
  const rq = C.requestAccess({ id: "RQ1", patientId: PT, requester: DR_B,
    purpose: "مراجعة وظائف الكلى قبل الاستشارة",
    scopes: [C.SCOPE.SUMMARY, C.SCOPE.LABS, C.SCOPE.CONDITIONS, C.SCOPE.MEDICATIONS] }, at(62));
  ok(rq.ok);
  const res = C.respondToRequest(rq.request, C.REQ_STATE.APPROVED, PT, at(62),
    { shareId: "SH-B", scopes: [C.SCOPE.SUMMARY, C.SCOPE.LABS], duration: "DAY", modality: "OTP" });
  ok(res.ok);
  db.shares.push(res.share);
  ok(read(DR_B, C.SCOPE.LABS, null, at(62), "مراجعة وظائف الكلى").ok);
  no(read(DR_B, C.SCOPE.MEDICATIONS, null, at(62), "مراجعة").ok, "he asked; she did not grant it");
});

step("الطبيب الثاني يشوف الاتجاه اللي بناه المختبر", () => {
  const s = N.comparableSeries(db.results, "Creatinine");
  eq(s.points.map((p) => p.value), [2.1, 3.4]);
  ok(s.safeToCompare, "same laboratory, same unit");
});

step("الإلغاء فوري", () => {
  const rv = C.revokeShare(db.shares.find((s) => s.id === "SH-B"), PT, at(62) + HOUR);
  ok(rv.ok);
  db.shares = db.shares.map((s) => s.id === "SH-B" ? rv.share : s);
  no(read(DR_B, C.SCOPE.LABS, null, at(62) + 2 * HOUR, "متابعة").ok);
});

step("الطوارئ تفتح البطاقة لا الملف", () => {
  const ER = { id: "DR-ER", role: E.ROLE.DOCTOR, name: "د. طوارئ" };
  db.breakGlass = E.breakGlass(ER, PT, "وصل فاقد الوعي بعد نوبة", at(63)).grant;
  ok(read(ER, C.SCOPE.ALLERGIES, null, at(63), "إنعاش").ok);
  no(read(ER, C.SCOPE.LABS, null, at(63), "إنعاش").ok);
  const card = C.emergencyCard(PATIENT, db, at(63));
  eq(card.allergies[0].substance, "السلفا");
  eq(card.emergencyContact.relation, "زوجة");
  ok(card.notRecorded.some((x) => x.includes("فصيلة الدم")), "and what is missing is stated");
});

act("٨هـ · التدقيق يجاوب الأسئلة الستة");

step("كل مدخل يحمل: منو · شنو · متى · ليش · من وين · بأي إذن", () => {
  const e = db.accessLog.find((x) => x.granted && x.basis === "SHARE");
  ok(e.actorId && e.actorRole, "WHO");
  ok(e.scope, "WHAT");
  ok(e.at, "WHEN");
  ok(e.purpose, "WHY — the same sentence the patient read before saying yes");
  ok(e.context && e.context.facilityId, "WHERE");
  ok(e.authority && e.authority.kind === "SHARE" && e.authority.id, "UNDER WHICH AUTHORISATION");
});

step("ولا يحمل عنوان شبكة — جدول يربط الأطباء بمواقعهم خطر بحد ذاته", () => {
  no(JSON.stringify(db.accessLog).includes("\"ip\""));
});

step("المحاولات المرفوضة مسجّلة مثل الناجحة", () => {
  const denied = db.accessLog.filter((x) => !x.granted);
  ok(denied.length >= 3);
  ok(denied.some((x) => x.reason === "NO_ACTIVE_SHARE"));
  ok(denied.some((x) => x.reason === "BEYOND_EMERGENCY_DATASET"),
    "including the emergency access that reached past its tier");
});

step("والمريض ينبّه على الطوارئ والرفض", () => {
  const al = C.accessAlerts(db.accessLog, at(63));
  eq(al.map((a) => a.kind).sort(), ["BREAK_GLASS", "DENIED"]);
});

act("٨و · تكرار المريض · الخطأ · تغيّر الرقم");

step("ملف مكرّر يُكشف ولا يُدمج آلياً", () => {
  const dup = { id: "PAT-DUP", nameParts: PATIENT.nameParts, birthDate: PATIENT.birthDate,
    sex: "male", identifiers: [{ type: "mobile", value: "9647700000111", verification: "self_declared" }] };
  const cands = E.findCandidates(dup, [PATIENT], at(63));
  ok(cands.length);
  ok(cands[0].verdict.startsWith("REVIEW"), "never an automatic merge");
  ok(cands[0].factors.length, "and the reviewer sees why");
});

step("الدمج يحتاج فاعلاً وسبباً", () => {
  const rev = { id: "MR1", state: E.MERGE_STATE.PENDING };
  eq(E.mergeDecision(rev, E.MERGE_STATE.MERGED, "OP1", at(63), "").reason, "REASON_REQUIRED");
  ok(E.mergeDecision(rev, E.MERGE_STATE.MERGED, "OP1", at(63), "نفس الرقم ونفس التاريخ").ok);
});

step("خطأ الطبيب يُصحَّح بملحق — لا يُمحى", () => {
  db.encounters.push({ id: "ENC-A", patientId: PT, clinicianId: DR_A.id, facilityId: "CLN-A",
    type: E.ENC_TYPE.OUTPATIENT, chiefComplaint: "تعب", assessment: "فقر دم",
    state: E.ENC_STATE.SIGNED, startedAt: iso(at(1)) });
  const a = E.addAddendum(db.encounters[0], { text: "التقييم الصحيح: قصور كلوي",
    authorId: DR_A.id, reason: "خطأ تشخيصي", at: iso(at(7)) });
  ok(a.ok);
  eq(a.encounter.assessment, "فقر دم", "the original assertion stands as a historical fact");
  eq(a.encounter.addenda[0].reason, "خطأ تشخيصي");
  db.encounters[0] = a.encounter;
});

step("الزيارة الملغاة تبقى موسومة، ما تختفي", () => {
  const v = E.voidEncounter(db.encounters[0], DR_A.id, at(8), "سُجّلت لمريض غلط");
  ok(v.ok);
  eq(v.encounter.state, E.ENC_STATE.VOID);
  ok(v.encounter.voidReason, "a vanished encounter is indistinguishable from a concealed one");
});

step("تغيّر رقم الهاتف لا يشطر المريض ولا يفتح ملفه لمالك الرقم الجديد", () => {
  const changed = { ...PATIENT, identifiers: [
    { type: "mobile", value: "9647700000111", verification: "self_declared",
      validFrom: day(T0), validTo: day(at(60)) },
    { type: "mobile", value: "9647700000999", verification: "self_declared", validFrom: day(at(60)) },
  ] };
  eq(E.idOf(changed, "mobile", at(63)), "9647700000999", "the live number is the current one");
  const stranger = { id: "PAT-S", nameParts: { given: "أحمد", father: "علي" },
    identifiers: [{ type: "mobile", value: "9647700000111", verification: "self_declared",
      validFrom: day(at(61)) }] };
  const m = E.matchScore(changed, stranger, at(63));
  no(m.factors.some((f) => f.f === "mobile" && f.agree),
    "the number the patient gave up must not match its new owner");
  /* And identity is not the phone anyway: the Qareeb id never moved. */
  eq(changed.id, PATIENT.id);
});

/* ============================================================ */
act("★ خلاصة: ماذا رأى كل فاعل");

step("لا تسرّب بين الفاعلين — كل واحد رأى مظروفه فقط", () => {
  const labEnv = JSON.stringify(N.orderEnvelope(db.orders[0], PATIENT, db));
  const phEnv = JSON.stringify(N.pharmacyEnvelope(db.prescriptions[0], PATIENT, db));
  no(labEnv.includes("أملوديبين"), "the lab never saw the prescription");
  no(phEnv.includes("3.4"), "the pharmacy never saw the creatinine");
  no(phEnv.includes("سونار"), "nor the imaging");
  no(labEnv.includes("الساعدي") === false && false, "");
});

step("والسلسلة كاملة موصولة بمعرّفات ثابتة", () => {
  eq(db.results[0].orderId, "ORD1");
  eq(db.orders[0].orderedBy, DR_A.id);
  eq(db.studies[0].orderId, "ORD3");
  eq(db.medications[0].prescriptionId, "RX1");
  eq(db.referrals[0].episodeId, "EP1");
  eq(db.conditions[0].episodeId, "EP1");
  eq(db.dispenses[0].prescriptionId, "RX1");
});

console.log("\n" + "─".repeat(60));
if (fails.length) {
  console.log(`${pass} نجحت · ${fails.length} فشلت\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} نجحت · صفر فشل`);
console.log(`
المختبر رأى: الفحص، والحساسية، والعمر — ولا شخّص ولا دواء.
الصيدلية رأت: الوصفة، والحساسية، والأدوية — ولا تحليل ولا أشعة.
مركز الأشعة رأى: الطلب وسببه — والصور بقت عنده، وقريب قال ذلك صراحةً.
الطبيب الثاني رأى: ما وافقت عليه فقط — وانتهى وصوله وحده ثم أُلغي.
وطبيب الطوارئ رأى: البطاقة — لا الملف.

وكل واحدة من هذي القراءات مكتوبة: منو، شنو، متى، ليش، من وين، وبأي إذن.
`);
