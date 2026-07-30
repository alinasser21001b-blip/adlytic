#!/usr/bin/env node
/* ============================================================
   قريب · اختبار القبول — THE COMPLETE PATIENT JOURNEY
   ============================================================
   Run:  node tools/test-qareeb.mjs

   Section 32 of the brief, executed rather than described, and section 37's
   success criterion checked at the end.

   This is not a unit test. It runs ONE synthetic Iraqi patient through the
   whole core loop, in order, against the shipped bytes of every domain
   module, and asserts the chain the brief calls the heart of Qareeb:

     Patient → Doctor → Encounter → Clinical Record
             → Lab / Medication / Document → Follow-up → Timeline

   The success criterion is not "the pages work". It is that a SECOND doctor,
   months later, who has never met this patient, can read her story without
   starting from nothing — and cannot read a word of it without her consent.

   All data is synthetic. No real person, clinic or number appears here.
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

let pass = 0; const fails = [];
function step(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const act = (n) => console.log("\n══ " + n + " ══");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

const DAY = 86400000, HOUR = 3600000;
const T0 = new Date("2025-09-14T09:00:00Z").getTime();   /* first registration */
const at = (d) => T0 + d * DAY;
const iso = (t) => new Date(t).toISOString();
const day = (t) => iso(t).slice(0, 10);

/* The record, held exactly as the app holds it. */
const db = { patient: null, conditions: [], medications: [], allergies: [], procedures: [],
  results: [], documents: [], immunizations: [], encounters: [], prescriptions: [],
  episodes: [], tasks: [], appointments: [], shares: [], accessLog: [], requests: [], orders: [] };

/* Every read by a non-patient goes through this, exactly as ui-record.js
   does — so the journey exercises the real access path, not a shortcut. */
function read(actor, scope, dataClass, now) {
  const d = C.decideAccess({ actor, patientId: db.patient.id, scope, dataClass,
    shares: db.shares, breakGlass: db.breakGlass, now });
  if (d.auditRequired) db.accessLog.unshift(C.accessEntry({ actor, patientId: db.patient.id, scope, dataClass }, d, now));
  return d;
}

const DR_SUHA = { id: "DR-SUHA", name: "د. سهى", role: E.ROLE.DOCTOR, specialty: "باطنية",
  licenseNumber: "IQ-11821", syndicateId: "BGD-4471", licenseStatus: "VERIFIED", organizationId: "CLN-KARRADA" };
const DR_LAYTH = { id: "DR-LAYTH", name: "د. ليث", role: E.ROLE.DOCTOR, specialty: "غدد صماء",
  licenseNumber: "IQ-20907", syndicateId: "BGD-6612", licenseStatus: "VERIFIED", organizationId: "CLN-MANSOUR" };
const DR_STRANGER = { id: "DR-X", name: "د. مجهول", role: E.ROLE.DOCTOR, licenseStatus: "VERIFIED",
  licenseNumber: "IQ-1", syndicateId: "B-1", specialty: "عامة" };

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║  رحلة مريضة عراقية كاملة — من التسجيل إلى الطبيب الثاني  ║");
console.log("╚══════════════════════════════════════════════════════╝");

/* ============================================================
   ١ · المريضة تسجّل — with no government document at all
   ============================================================ */
act("١ · التسجيل — بلا أي وثيقة حكومية");

step("زينب تسجّل باسمها المركّب وتاريخ ميلادها فقط", () => {
  const cand = {
    nameParts: { given: "زينب", father: "كاظم", grandfather: "عبدالله", family: "الجبوري" },
    birthDate: "1986-11-02", sex: "female", district: "karrada", identifiers: [],
  };
  const g = E.canRegister(cand);
  ok(g.ok, "a patient with no card must still be registerable — a million Iraqis hold none");
  db.patient = { ...cand, id: "PAT-Z", registeredAt: iso(T0) };
  eq(E.fullName(db.patient), "زينب كاظم عبدالله الجبوري");
});

step("الديانة مرفوضة عند التسجيل — لا تُخزَّن ولا تُعرض", () => {
  const g = E.canRegister({ ...db.patient, religion: "مسيحية" });
  no(g.ok);
  eq(g.reason, "FORBIDDEN_FIELD");
});

step("تضيف هاتفها كوسيلة وصول — لا كهوية", () => {
  db.patient.identifiers.push({ type: E.ID_TYPE.MOBILE, value: "9647700000111",
    verification: E.ID_VERIFY.SELF, validFrom: day(T0) });
  no(E.isIdentityBearing(E.ID_TYPE.MOBILE), "a phone reaches a person; it does not identify them");
});

step("تسجّل حساسيتها من البنسلين قبل أي شي ثاني", () => {
  db.allergies.push({ id: "AL1", substance: "البنسلين", reaction: "طفح جلدي منتشر",
    criticality: E.CRITICALITY.HIGH, verificationStatus: E.VERIFY.PATIENT_REPORTED,
    recordedBy: db.patient.id, recordedAt: iso(T0) });
  eq(E.criticalAllergies(db.allergies).length, 1);
});

/* ============================================================
   ٢ · ترفع تقاريرها القديمة — the plastic bag becomes a record
   ============================================================ */
act("٢ · ترفع تقاريرها الورقية القديمة");

step("ترفع تقرير سونار من ٢٠٢٣ — من قبل ما يوجد قريب", () => {
  const a = R.attachDocument({ id: "DOC1", patientId: db.patient.id,
    title: "سونار البطن — مستشفى أهلي", type: R.DOC_TYPE.IMAGING,
    documentDate: "2023-06-11", uploadedBy: db.patient.id, origin: R.DOC_ORIGIN.FACILITY }, at(1));
  ok(a.ok);
  db.documents.push(a.document);
  ok(a.document.immutable, "the source is never edited");
});

step("النظام يقرأ منه — والقراءة تبقى ادعاءً لا حقيقة", () => {
  const r = R.recordExtraction(db.documents[0], [
    { kind: R.CLAIM_KIND.CONDITION, name: "تكيّس بسيط في الكبد", date: "2023-06-11" },
  ], "ocr-v1", at(1));
  ok(r.ok);
  db.documents[0] = r.document;
  eq(R.confirmedClaims(r.document).length, 0, "a machine confirms nothing");
  eq(R.awaitingVerification(db.documents).length, 1, "and the backlog is visible");
});

step("المريضة نفسها لا تقدر تأكّده في السجل الرسمي", () => {
  const bad = R.confirmClaim(db.documents[0], db.documents[0].claims[0].id,
    R.EXTRACT_STATE.CONFIRMED, { id: db.patient.id, role: E.ROLE.PATIENT }, at(1));
  eq(bad.reason, "CLINICIAN_REQUIRED");
});

/* ============================================================
   ٣ · تحجز وتزور — the network hands over to the record
   ============================================================ */
act("٣ · تحجز موعداً وتزور د. سهى");

step("تحجز موعداً — والموعد بالماضي مرفوض", () => {
  eq(R.bookAppointment({ patientId: db.patient.id, providerId: DR_SUHA.id, startsAt: at(1) }, at(3)).reason,
    "IN_THE_PAST");
  const b = R.bookAppointment({ id: "APT1", patientId: db.patient.id, providerId: DR_SUHA.id,
    facilityId: "CLN-KARRADA", startsAt: at(5) }, at(3));
  ok(b.ok);
  db.appointments.push(b.appointment);
});

step("الطبيبة لا تشوف شي قبل الموافقة — مهما كانت موثّقة", () => {
  const d = read(DR_SUHA, C.SCOPE.SUMMARY, null, at(5));
  no(d.ok);
  eq(d.reason, "NO_ACTIVE_SHARE");
  eq(db.accessLog.length, 1, "and the refused attempt is written down");
});

step("تطلب الاطّلاع، وتقول ليش — والمريضة تقرأ السبب", () => {
  const r = C.requestAccess({ id: "REQ1", patientId: db.patient.id, requester: DR_SUHA,
    purpose: "مراجعة تاريخك وأدويتك قبل الفحص",
    scopes: [C.SCOPE.SUMMARY, C.SCOPE.MEDICATIONS, C.SCOPE.CONDITIONS, C.SCOPE.DOCUMENTS] }, at(5));
  ok(r.ok);
  db.requests.push(r.request);
  eq(C.requestState(r.request, at(5)), C.REQ_STATE.PENDING);
});

step("زينب توافق — لكن تضيّق النطاق بنفسها", () => {
  const res = C.respondToRequest(db.requests[0], C.REQ_STATE.APPROVED, db.patient.id, at(5),
    { shareId: "SH1", scopes: [C.SCOPE.SUMMARY, C.SCOPE.MEDICATIONS, C.SCOPE.CONDITIONS],
      duration: "VISIT", modality: "IN_APP" });
  ok(res.ok);
  db.requests[0] = res.request;
  db.shares.push(res.share);
  no(res.share.scopes.includes(C.SCOPE.DOCUMENTS), "she declined the documents, and that stands");
  ok(res.share.scopes.includes(C.SCOPE.ALLERGIES), "but allergies ride along whatever she ticked");
});

step("الآن الطبيبة تقرأ — والحساسية أول ما تشوف", () => {
  const d = read(DR_SUHA, C.SCOPE.SUMMARY, null, at(5) + HOUR);
  ok(d.ok);
  eq(d.basis, "SHARE");
  const brief = R.preVisitBrief(db.patient, db, at(5) + HOUR);
  eq(brief.allergies[0].substance, "البنسلين");
  eq(brief.patient.age, 38);
});

step("لكن المستندات ما زالت مقفلة — لأنها ما شاركتها", () => {
  no(read(DR_SUHA, C.SCOPE.DOCUMENTS, null, at(5) + HOUR).ok);
});

/* ============================================================
   ٤ · الزيارة — encounter → structured clinical record
   ============================================================ */
act("٤ · الزيارة الأولى — التشخيص والدواء والفحص");

step("الموعد يصير زيارة — فقط لأنها حضرت فعلاً", () => {
  db.appointments[0] = { ...db.appointments[0], state: R.APPT_STATE.ARRIVED, arrivedAt: at(5) };
  const e = R.appointmentToEncounter(db.appointments[0]);
  ok(e.ok);
  db.encounters.push({ ...e.encounter, id: "ENC1", chiefComplaint: "عطش وتبوّل متكرر وتعب",
    assessment: "اشتباه داء السكري النوع ٢", clinicianName: DR_SUHA.name });
});

step("لا تُوقَّع بلا تقييم — والحقول الناقصة تُسمّى", () => {
  const draft = { ...db.encounters[0], assessment: "" };
  const g = E.canSign(draft);
  no(g.ok);
  ok(g.missing.includes("assessment"));
});

step("توقّع الزيارة", () => {
  const s = E.signEncounter(db.encounters[0], DR_SUHA.id, at(5) + HOUR);
  ok(s.ok);
  db.encounters[0] = s.encounter;
  eq(db.encounters[0].state, E.ENC_STATE.SIGNED);
});

step("الحلقة تُفتح — القصة لا الأحداث المتفرقة", () => {
  db.episodes.push({ id: "EP-DM", patientId: db.patient.id, title: "السكري",
    state: E.EP_STATE.ACTIVE, openedAt: iso(at(5)) });
});

step("الفحص يُطلَب — ويصير مهمّة لها صاحب وموعد", () => {
  db.orders.push({ id: "ORD1", patientId: db.patient.id, code: "HbA1c", display: "الخضاب السكري",
    orderedBy: DR_SUHA.id, orderedAt: iso(at(5)), episodeId: "EP-DM", status: "active" });
  const derived = E.deriveTasks({ orders: db.orders, results: db.results }, at(5));
  ok(derived.some((t) => t.kind === E.TASK_KIND.ORDER_NO_RESULT),
    "'come back when it's out' is not a plan — the register is built from ABSENCE");
  db.tasks.push(...derived);
});

/* ============================================================
   ٥ · النتيجة تصل — closed loop, or the failure that kills
   ============================================================ */
act("٥ · النتيجة تصل بعد ٦ أيام");

step("النتيجة غير طبيعية — والنظام يعرف ذلك من المدى المرجعي", () => {
  db.results.push({ id: "RES1", orderId: "ORD1", patientId: db.patient.id, code: "HbA1c",
    display: "الخضاب السكري", value: 9.2, unit: "%", refLow: 4, refHigh: 5.6,
    effectiveAt: day(at(11)), performerId: "LAB-IBN-SINA", episodeId: "EP-DM" });
  ok(E.isAbnormal(db.results[0]));
  eq(E.flagResult(db.results[0]), "high");
});

step("مهمّة «طُلب بلا نتيجة» تُغلَق، ومهمّة «نتيجة بلا إقرار» تُفتح", () => {
  const derived = E.deriveTasks({ orders: db.orders, results: db.results }, at(11));
  no(derived.some((t) => t.kind === E.TASK_KIND.ORDER_NO_RESULT), "the order now has its result");
  ok(derived.some((t) => t.kind === E.TASK_KIND.RESULT_ACK),
    "an abnormal result nobody acknowledged is the loop that kills");
  db.tasks = derived;
});

step("الملخّص يرفع النتيجة غير المُقرّة فوق كل شي", () => {
  const brief = R.preVisitBrief(db.patient, db, at(12));
  ok(brief.unacknowledgedAbnormal.some((x) => x.code === "HbA1c" && x.value === 9.2));
});

step("الطبيبة تُقرّ النتيجة وتُشخّص", () => {
  db.results[0].acknowledgedBy = DR_SUHA.id;
  db.results[0].acknowledgedAt = iso(at(12));
  db.conditions.push({ id: "CND-DM", patientId: db.patient.id, display: "داء السكري النوع ٢",
    clinicalStatus: E.COND_STATE.ACTIVE, chronic: true, onsetDate: day(at(12)),
    lastReviewed: day(at(12)), episodeId: "EP-DM", encounterId: "ENC1",
    recordedBy: DR_SUHA.id, verificationStatus: E.VERIFY.CONFIRMED });
  eq(E.activeConditions(db.conditions, at(12)).length, 1);
});

/* ============================================================
   ٦ · الوصفة — structured, and it produces the longitudinal fact
   ============================================================ */
act("٦ · الوصفة");

step("طبيب غير موثّق لا يقدر يكتب بالسجل", () => {
  eq(R.canPrescribe({ patientId: db.patient.id, prescriberId: "X", medication: "ميتفورمين",
    dose: "٥٠٠ ملغم", frequency: "BID", durationDays: 90, indication: "السكري" },
    { id: "X", licenseStatus: "SELF_ASSERTED" }).reason, "PRESCRIBER_UNVERIFIED");
});

step("وصفة بلا سبب سريري مرفوضة", () => {
  eq(R.canPrescribe({ patientId: db.patient.id, prescriberId: DR_SUHA.id, medication: "ميتفورمين",
    dose: "٥٠٠ ملغم", frequency: "BID", durationDays: 90, indication: "" }, DR_SUHA).reason,
    "INDICATION_REQUIRED");
});

step("الوصفة تُصدَر — وتُنتج أمراً غير قابل للتعديل ودواءً في القائمة", () => {
  const r = R.issuePrescription({ id: "RX1", patientId: db.patient.id, prescriberId: DR_SUHA.id,
    medication: "ميتفورمين", dose: "٥٠٠ ملغم", frequency: "BID", durationDays: 90,
    indication: "داء السكري النوع ٢", startDate: day(at(12)) }, DR_SUHA, at(12));
  ok(r.ok);
  db.prescriptions.push(r.prescription);
  db.medications.push({ ...r.medication, id: "MED1", episodeId: "EP-DM" });
  ok(r.prescription.immutable);
  eq(r.medication.prescriberId, DR_SUHA.id, "the record can say who started it");
  eq(E.medStatus(db.medications[0], at(20)), E.MED_STATE.ACTIVE);
});

step("الصيدلية تصرف — والصرف ملاحظة على الأمر لا تعديل له", () => {
  const d = R.recordDispense(db.prescriptions[0],
    { pharmacyId: "PH-KARRADA-2", state: R.DISPENSE_STATE.DISPENSED }, at(12));
  ok(d.ok);
  eq(d.dispense.prescriptionId, "RX1");
  eq(db.prescriptions[0].dose, "٥٠٠ ملغم", "the pharmacy cannot change what the doctor wrote");
});

/* ============================================================
   ٧ · تصحيح — history is added to, never rewritten
   ============================================================ */
act("٧ · الطبيبة تكتشف خطأً في ملاحظتها");

step("الزيارة الموقّعة لا تُعدَّل — التصحيح ملحق باسم صاحبه وسببه", () => {
  const a = E.addAddendum(db.encounters[0],
    { text: "الجرعة كانت ٥٠٠ ملغم مرتين، لا مرة واحدة", authorId: DR_SUHA.id,
     reason: "خطأ نسخ", at: iso(at(13)) });
  ok(a.ok);
  db.encounters[0] = a.encounter;
  eq(db.encounters[0].state, E.ENC_STATE.AMENDED);
  eq(db.encounters[0].assessment, "اشتباه داء السكري النوع ٢",
    "the original assertion is untouched — a clinician believed this at that moment");
  ok(db.encounters[0].addenda.length, "and the correction is visible with its reason");
});

step("ملحق بلا سبب مرفوض", () => {
  eq(E.addAddendum(db.encounters[0], { text: "x", authorId: DR_SUHA.id, at: iso(at(13)) }).reason,
    "REASON_REQUIRED");
});

/* ============================================================
   ٨ · المشاركة تنتهي وحدها
   ============================================================ */
act("٨ · بعد الزيارة");

step("وصول الطبيبة انغلق وحده — بلا ما يشغّل أحد شي", () => {
  no(C.isShareActive(db.shares[0], at(6)), "a visit-length share is over the next day");
  no(read(DR_SUHA, C.SCOPE.SUMMARY, null, at(20)).ok);
});

step("زينب تشوف بالضبط منو فتح ملفها ومتى", () => {
  const h = C.accessHistory(db.accessLog, at(20));
  ok(h.length >= 2);
  ok(h.some((r) => r.granted && r.actorId === DR_SUHA.id), "the consultation is there");
  ok(h.some((r) => !r.granted), "and so is the attempt made before she consented");
});

/* ============================================================
   ٩ · ثمانية أشهر تمر — the record accumulates
   ============================================================ */
act("٩ · بعد ثمانية أشهر");

step("تحليل ثانٍ يُسجَّل، والاتجاه يُبنى", () => {
  db.results.push({ id: "RES2", patientId: db.patient.id, code: "HbA1c", display: "الخضاب السكري",
    value: 7.4, unit: "%", refLow: 4, refHigh: 5.6, effectiveAt: day(at(250)),
    performerId: "LAB-IBN-SINA", acknowledgedBy: DR_SUHA.id, episodeId: "EP-DM" });
  const t = E.trend(db.results, "HbA1c");
  eq(t.points.length, 2);
  eq(t.direction, "falling", "the treatment is working, and the record shows it");
  no(t.mixedLabs, "same laboratory both times");
});

step("تطعيم من بطاقة ورقية — ويُوسَم أنه موثّق لا متذكَّر", () => {
  const i = R.recordImmunization({ patientId: db.patient.id, vaccine: "التيتانوس",
    date: day(at(120)), evidence: R.IMM_EVIDENCE.CARD });
  ok(i.ok);
  db.immunizations.push(i.immunization);
  ok(i.immunization.documented);
});

step("متابعة تأخّرت — والنظام يعرف", () => {
  db.tasks.push({ id: "T-FU", patientId: db.patient.id, kind: E.TASK_KIND.FOLLOWUP_DUE,
    status: E.TASK_STATE.OPEN, dueAt: iso(at(200)), about: "مراجعة السكري كل ٣ أشهر",
    owner: DR_SUHA.id, episodeId: "EP-DM" });
  const open = E.openTasks(db.tasks, at(250));
  ok(open.some((t) => t.id === "T-FU" && t.overdue),
    "an overdue loop that reads as on-time disables the whole fail-safe register");
});

/* ============================================================
   ١٠ · طبيب ثانٍ — the success criterion
   ============================================================ */
act("١٠ · طبيب ثانٍ لم يرَ المريضة قط");

step("د. ليث لا يشوف شي — الموثوقية ليست إذناً", () => {
  const d = read(DR_LAYTH, C.SCOPE.SUMMARY, null, at(255));
  no(d.ok, "being a verified doctor grants nothing; only the patient does");
});

step("زينب تصدر رمزاً محمولاً — تشتغل ورقة بلا إنترنت ولا كهرباء", () => {
  const c = C.issueCarryCode(db.patient.id,
    [C.SCOPE.SUMMARY, C.SCOPE.CONDITIONS, C.SCOPE.MEDICATIONS, C.SCOPE.LABS], at(255), "K7NQR4");
  ok(c.ok);
  db.carry = c.carry;
});

step("العيادة تستبدل الرمز — فتفتح مشاركة بمدة زيارة واحدة", () => {
  const r = C.redeemCarryCode(db.carry, DR_LAYTH, at(255));
  ok(r.ok);
  db.carry = r.carry;
  db.shares.push(r.share);
  eq(r.share.duration, "VISIT", "the paper is an introduction, not a transfer");
  ok(r.share.scopes.includes(C.SCOPE.ALLERGIES));
});

step("الرمز لا يُستعمل مرتين — ورقة مصوَّرة لا تفتح الملف للأبد", () => {
  eq(C.redeemCarryCode(db.carry, DR_STRANGER, at(255)).reason, "ALREADY_REDEEMED");
});

let brief;
step("د. ليث يقرأ — والوصول مسجّل باسمه", () => {
  const d = read(DR_LAYTH, C.SCOPE.SUMMARY, null, at(255));
  ok(d.ok);
  brief = R.preVisitBrief(db.patient, db, at(255));
});

/* ── THE ACCEPTANCE TEST ─────────────────────────────────────
   Section 37: can a doctor who has never met her understand her story,
   without reading a single historical note? */
act("★ معيار القبول — هل يفهم قصتها بلا ما يقرأ ملاحظة واحدة؟");

step("يعرف أنها تتحسّس البنسلين", () => {
  eq(brief.allergies[0].substance, "البنسلين");
  eq(brief.allergies[0].criticality, E.CRITICALITY.HIGH);
});

step("يعرف أن عندها سكري نشط مزمن، ومتى بدأ", () => {
  const dm = brief.active.find((c) => c.name === "داء السكري النوع ٢");
  ok(dm, "the active problem must be there");
  ok(dm.chronic);
  eq(dm.since, day(at(12)));
});

step("يعرف الدواء والجرعة والسبب — لا مجرد اسم", () => {
  const m = brief.medications.find((x) => x.name === "ميتفورمين");
  ok(m);
  eq(m.dose, "٥٠٠ ملغم");
  eq(m.indication, "داء السكري النوع ٢");
});

step("يعرف أن الخضاب السكري انخفض ٩٫٢ ← ٧٫٤", () => {
  const t = brief.trends.find((x) => x.code === "HbA1c");
  ok(t, "the lab that moved must surface without him searching for it");
  eq(t.direction, "falling");
  eq(t.points.map((p) => p.value), [9.2, 7.4]);
});

step("يعرف أن هناك متابعة متأخّرة", () => {
  ok(brief.overdue.length >= 1);
});

step("يعرف أن هناك معلومة مستخرجة لم يتحقق منها أحد — وأنها تنتظر قراره", () => {
  eq(brief.unverifiedClaims, 1);
});

step("يقرأ آخر زيارة وتقييمها", () => {
  ok(brief.lastEncounter);
  eq(brief.lastEncounter.assessment, "اشتباه داء السكري النوع ٢");
});

step("ولا يقرأ رقم أي وثيقة — الملخّص لا يحمل قيم المعرّفات", () => {
  no(JSON.stringify(brief).includes("9647700000111"),
    "a summary that carries identifiers leaks them into every log and cache");
});

step("والملخّص يحمل تحفّظه معه — لا يغني عن سؤال المريضة", () => {
  ok(brief.caveat.includes("لا يغني عن سؤال المريض"));
});

/* ── the second half of the criterion ───────────────────────── */
act("★ والنصف الثاني — لا يقرأ حرفاً بلا موافقتها");

step("طبيب ثالث بلا موافقة يُرفض — ويُسجَّل رفضه", () => {
  const before = db.accessLog.length;
  no(read(DR_STRANGER, C.SCOPE.SUMMARY, null, at(255)).ok);
  eq(db.accessLog.length, before + 1);
});

step("وصول د. ليث ينتهي وحده بعد الزيارة", () => {
  no(read(DR_LAYTH, C.SCOPE.SUMMARY, null, at(256)).ok);
});

step("زينب تقدر تلغي أي مشاركة فوراً وبلا سبب", () => {
  const fresh = C.grantShare({ id: "SH9", patientId: db.patient.id, grantedBy: db.patient.id,
    granteeId: DR_LAYTH.id, scopes: [C.SCOPE.SUMMARY], duration: "MONTH", modality: "IN_APP" }, at(256)).share;
  db.shares.push(fresh);
  ok(C.isShareActive(fresh, at(257)));
  const rv = C.revokeShare(fresh, db.patient.id, at(257));
  ok(rv.ok);
  db.shares = db.shares.map((s) => s.id === "SH9" ? rv.share : s);
  no(read(DR_LAYTH, C.SCOPE.SUMMARY, null, at(258)).ok);
});

step("طوارئ: لو كانت فاقدة الوعي تُفتح بطاقة الطوارئ — لا الملف كله", () => {
  const ER = { id: "DR-ER", role: E.ROLE.DOCTOR, name: "د. طوارئ" };
  const g = E.breakGlass(ER, db.patient.id, "حادث — فاقدة الوعي", at(260));
  ok(g.ok);
  db.breakGlass = g.grant;
  /* Tier 1 gives what an unconscious patient's care needs. */
  const card = read(ER, C.SCOPE.ALLERGIES, null, at(260));
  ok(card.ok);
  eq(card.tier, C.EMERGENCY_TIER.CRITICAL);
  ok(card.mustNotify, "what makes emergency access survivable is that she learns about it");
  /* And not a word more without a second, separate decision. */
  const labs = read(ER, C.SCOPE.LABS, null, at(260));
  no(labs.ok, "an override that opens everything is a universal key with a form attached");
  eq(labs.reason, "BEYOND_EMERGENCY_DATASET");
  const alerts = C.accessAlerts(db.accessLog, at(260));
  ok(alerts.some((a) => a.kind === "BREAK_GLASS"));
});

step("والتصعيد للملف الكامل قرار ثانٍ بمبرّر خاص به — ومدّته أقصر", () => {
  const ER = { id: "DR-ER", role: E.ROLE.DOCTOR, name: "د. طوارئ" };
  const up = C.escalateEmergency(db.breakGlass, "أحتاج التاريخ الكامل قبل التخدير الطارئ", ER, at(260));
  ok(up.ok);
  ok(up.grant.expiresAt - at(260) < db.breakGlass.expiresAt - at(260),
    "the wider the access, the less of it there should be");
  db.breakGlass = up.grant;
  ok(read(ER, C.SCOPE.LABS, null, at(260)).ok);
});

step("وصول الطوارئ ينغلق وحده", () => {
  no(read({ id: "DR-ER", role: E.ROLE.DOCTOR }, C.SCOPE.LABS, null, at(260) + 2 * HOUR).ok);
});

/* ============================================================
   ١١ · السلسلة كاملة — the chain the brief calls the heart
   ============================================================ */
act("★ السلسلة: مريض ← طبيب ← زيارة ← سجل ← فحص/دواء ← متابعة ← خط زمني");

step("كل حلقة في السلسلة موصولة بالتي قبلها بمعرّف حقيقي", () => {
  const enc = db.encounters[0];
  eq(enc.patientId, db.patient.id, "encounter → patient");
  eq(enc.appointmentId, "APT1", "encounter → appointment");
  eq(db.conditions[0].encounterId, "ENC1", "condition → encounter");
  eq(db.results[0].orderId, "ORD1", "result → order");
  eq(db.medications[0].prescriptionId, "RX1", "medication → prescription");
  eq(db.prescriptions[0].prescriberId, DR_SUHA.id, "prescription → prescriber");
  eq(db.medications[0].episodeId, "EP-DM", "medication → episode");
  eq(db.tasks.find((t) => t.id === "T-FU").episodeId, "EP-DM", "task → episode");
});

step("الخط الزمني ينتظم في قصة، لا في كومة", () => {
  const tl = E.buildTimeline({ ...db, patientId: db.patient.id });
  ok(tl.length >= 4, "diagnosis, medication, results and procedure-class events");
  const kinds = [...new Set(tl.map((e) => e.type))];
  ok(kinds.includes("diagnosis"), "a new diagnosis is a timeline event");
  ok(kinds.includes("medication-start"), "so is starting a drug");
  ok(kinds.includes("result"), "so is a result");
});

step("والحلقة لا تُغلق وفيها مهمّة مفتوحة", () => {
  const ep = { ...db.episodes[0] };
  const g = E.canCloseEpisode(ep, { tasks: E.openTasks(db.tasks, at(255)) });
  no(g.ok, "closing a story while a follow-up is still open is how patients get lost");
});

/* ============================================================
   REPORT
   ============================================================ */
console.log("\n" + "─".repeat(58));
if (fails.length) {
  console.log(`${pass} نجحت · ${fails.length} فشلت\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} نجحت · صفر فشل`);
console.log(`
د. ليث — ما شاف زينب بحياته — عرف بلا ما يقرأ ملاحظة واحدة:
  أنها تتحسّس البنسلين تحسّساً خطراً،
  وأن عندها سكري نوع ٢ مزمن بدأ في ${day(at(12))}،
  وأنها على ميتفورمين ٥٠٠ ملغم مرتين يومياً لأجل السكري،
  وأن خضابها السكري نزل من ٩٫٢ إلى ٧٫٤،
  وأن عندها متابعة تأخّرت، ومعلومة من تقرير قديم تنتظر قراره.

وما وصل لأي حرف من هذا إلا لأنها وافقت — ولمدة زيارة واحدة،
وكل من حاول بلا موافقتها مكتوب باسمه في سجلها.
`);
