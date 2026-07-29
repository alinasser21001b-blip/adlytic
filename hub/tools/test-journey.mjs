#!/usr/bin/env node
/* ============================================================
   قريب · اختبار القبول النهائي — رحلة مريض كاملة
   THE FINAL ACCEPTANCE TEST
   ============================================================
   Run:  node tools/test-journey.mjs

   One synthetic Iraqi patient, eighteen months, three clinicians, two
   facilities, one operation, one unrelated new problem.

   THE QUESTION THIS TEST ANSWERS is the only one that matters: can a THIRD
   doctor, who has never met this patient, understand their story without
   reading a single historical note?

   Everything here is synthetic. No real person, no real facility, no real
   licence number.
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

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("   ✓ " + m); } else { fails.push(m); console.log("   ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — توقّعنا ${JSON.stringify(b)} وجاء ${JSON.stringify(a)}`);

const NOW = new Date("2026-07-29T09:00:00Z").getTime();
const DAY = 86400000;
const at = (d) => new Date(NOW - d * DAY).toISOString();

/* ══════════════ اليوم ٠ — التسجيل ══════════════ */
console.log("\n══ اليوم ٠ · التسجيل في عيادة المنصور ══");

const patient = {
  id: "QP-000241",                       /* معرّف الشبكة — ليس الرقم الوطني */
  name: "زينب كاظم عبد الله",
  sex: "female", birthDate: "1979-06-11",
  district: "mansour",
  identifiers: [
    { type: E.ID_TYPE.NATIONAL, value: "197906110123" },
    { type: E.ID_TYPE.MOBILE, value: "9647801112233" },
  ],
};
ok(E.canRegister(patient).ok, "تسجّلت المريضة بالاسم والبطاقة الوطنية");
ok(patient.id !== "197906110123", "المفتاح الداخلي ليس الرقم الوطني");

/* شقيقتها تسجّل بنفس اليوم — نفس اللقب وسنة الميلاد */
const sister = { id: "QP-000242", name: "زينب كاظم عبدالله", sex: "female",
  birthDate: "1981-02-03", identifiers: [{ type: E.ID_TYPE.NATIONAL, value: "198102030456" }] };
const cands = E.findCandidates(sister, [patient, sister]);
ok(cands.length === 0 || cands[0].verdict !== "REVIEW_LIKELY",
  "الأختان لا تُدمجان تلقائياً — البطاقتان مختلفتان");

/* ══════════════ الزيارة الأولى ══════════════ */
console.log("\n══ الزيارة ١ · طبيب عام — عطش وتعب ══");

let enc1 = { id: "ENC-1", patientId: patient.id, clinicianId: "DR-AHMED", facilityId: "CL-MANSOUR",
  type: E.ENC_TYPE.OUTPATIENT, chiefComplaint: "عطش شديد وتعب منذ شهرين",
  assessment: "اشتباه داء السكري", plan: "سكر صائم + HbA1c", startedAt: at(540), state: E.ENC_STATE.DRAFT };
enc1 = E.signEncounter(enc1, "DR-AHMED", NOW - 540 * DAY).encounter;
eq(enc1.state, E.ENC_STATE.SIGNED, "وُقّعت الزيارة الأولى");

const epDM = { id: "EP-DM", title: "داء السكري النوع ٢", status: E.EP_STATE.ACTIVE,
  responsibleId: "DR-AHMED", startDate: at(540) };
const conditions = [{ id: "C-DM", display: "داء السكري النوع ٢",
  code: E.codeable(E.CODE_SYSTEM.SNOMED, "44054006", "داء السكري النوع ٢", "Type 2 diabetes mellitus"),
  clinicalStatus: E.COND_STATE.ACTIVE, chronic: true, onsetDate: at(535),
  lastReviewed: at(20), episodeId: "EP-DM", recordedBy: "DR-AHMED", facilityId: "CL-MANSOUR" }];

const results = [
  { id: "R-1", code: "4548-4", display: "HbA1c", value: 9.4, unit: "%", refLow: 4, refHigh: 5.6,
    effectiveAt: at(535), performerId: "LAB-NOOR", orderedBy: "DR-AHMED", episodeId: "EP-DM", acknowledgedBy: "DR-AHMED" },
];
ok(E.isAbnormal(results[0]), "HbA1c 9.4 مرفوعة ومعلَّمة");

const medications = [{ id: "M-MET", display: "ميتفورمين ٥٠٠ ملغم",
  dose: "٥٠٠ ملغم مرتين يومياً", startDate: at(535), lastConfirmed: at(20),
  status: E.MED_STATE.ACTIVE, indicationId: "C-DM", episodeId: "EP-DM",
  prescriberId: "DR-AHMED", facilityId: "CL-MANSOUR" }];

const allergies = [{ substance: "بنسلين", reaction: "طفح جلدي واسع",
  criticality: E.CRITICALITY.HIGH, verificationStatus: E.VERIFY.CONFIRMED,
  source: E.SOURCE.PATIENT, recordedBy: "DR-AHMED", recordedAt: at(540) }];

/* ══════════════ متابعة — تحسّن ══════════════ */
console.log("\n══ الزيارة ٢ · متابعة بعد ٦ أشهر ══");
results.push({ id: "R-2", code: "4548-4", display: "HbA1c", value: 7.4, unit: "%", refLow: 4, refHigh: 5.6,
  effectiveAt: at(360), performerId: "LAB-NOOR", orderedBy: "DR-AHMED", episodeId: "EP-DM", acknowledgedBy: "DR-AHMED" });
const tDM = E.trend(results, "4548-4");
eq(tDM.direction, "falling", "الاتجاه يُظهر تحسّن السكري");
ok(tDM.comparable, "نفس المختبر — الاتجاه قابل للمقارنة");

/* ══════════════ مشكلة جديدة — المرارة ══════════════ */
console.log("\n══ الزيارة ٣ · ألم بطن — إحالة ══");

const epGB = { id: "EP-GB", title: "حصى المرارة", status: E.EP_STATE.ACTIVE,
  responsibleId: "DR-AHMED", startDate: at(200) };
conditions.push({ id: "C-GB", display: "حصى المرارة العرضية",
  code: E.codeable(E.CODE_SYSTEM.SNOMED, "235919008", "حصى المرارة", "Cholelithiasis"),
  clinicalStatus: E.COND_STATE.ACTIVE, chronic: false, onsetDate: at(200),
  lastReviewed: at(200), episodeId: "EP-GB", recordedBy: "DR-AHMED" });

const imaging = [{ id: "IMG-1", modality: "سونار", bodySite: "البطن",
  impression: "حصى متعددة بالمرارة مع سماكة الجدار", effectiveAt: at(195),
  facilityId: "IMG-KARKH", episodeId: "EP-GB", orderedBy: "DR-AHMED" }];

const referrals = [{ id: "REF-1", specialty: "جراحة عامة", reason: "حصى مرارة عرضية",
  sentAt: at(190), referrerId: "DR-AHMED", episodeId: "EP-GB", respondedAt: at(185) }];

/* ══════════════ العملية ══════════════ */
console.log("\n══ العملية · استئصال المرارة بالمنظار ══");

const procedures = [{ id: "PR-1", display: "استئصال المرارة بالمنظار",
  performedAt: at(180), performerId: "DR-SURG", facilityId: "HOSP-YARMOUK",
  major: true, episodeId: "EP-GB", outcome: "بلا مضاعفات", asa: 2 }];

/* العيّنة أُرسلت للنسيج المرضي ولم تُقرأ بعد */
let specimens = [{ id: "SP-1", patientId: patient.id, episodeId: "EP-GB",
  surgeonId: "DR-SURG", takenAt: at(180), reportedAt: null }];

let epGBnow = { ...epGB, pendingSupplementary: true };
let tasks = E.deriveTasks({ specimens }, NOW);
ok(tasks.some((t) => t.kind === E.TASK_KIND.PATHOLOGY_PENDING), "النسيج المرضي المعلّق ولّد مهمة تلقائياً");

const blocked = E.canCloseEpisode(epGBnow, tasks);
ok(!blocked.ok, "🛡️ الحلقة لا تُغلق والنسيج المرضي معلّق — هذا هو الحاجز الذي يمنع ضياع تشخيص سرطان");

/* النسيج يصل: التهاب مزمن، حميد */
specimens = [{ ...specimens[0], reportedAt: at(170), impression: "التهاب مرارة مزمن — لا خباثة" }];
epGBnow = { ...epGBnow, pendingSupplementary: false };
tasks = E.deriveTasks({ specimens }, NOW);
ok(E.canCloseEpisode(epGBnow, tasks).ok, "بعد وصول النسيج تُغلق الحلقة");
epGBnow = { ...epGBnow, status: E.EP_STATE.COMPLETED };
conditions[1] = { ...conditions[1], clinicalStatus: E.COND_STATE.RESOLVED, resolvedDate: at(170) };

/* ══════════════ مشكلة جديدة غير مرتبطة ══════════════ */
console.log("\n══ مشكلة جديدة · فقر دم ══");

results.push({ id: "R-3", code: "718-7", display: "الهيموغلوبين", value: 9.1, unit: "g/dL",
  refLow: 12, refHigh: 16, effectiveAt: at(15), performerId: "LAB-RAFIDAIN",
  orderedBy: "DR-AHMED", acknowledgedBy: null });   /* لم يُقرّها أحد بعد */

results.push({ id: "R-0", code: "718-7", display: "الهيموغلوبين", value: 11.2, unit: "g/dL",
  refLow: 12, refHigh: 16, effectiveAt: at(540), performerId: "LAB-NOOR", acknowledgedBy: "DR-AHMED" });

const tHb = E.trend(results, "718-7");
ok(tHb.mixedLabs, "⚠️ الاتجاه يعبر مختبرين — النظام يعلن ذلك");
ok(!tHb.comparable, "ولا يرسم خطاً واثقاً بين نتيجتي مختبرين مختلفين");

tasks = E.deriveTasks({ specimens, results, followUps: [] }, NOW);
ok(tasks.some((t) => t.kind === E.TASK_KIND.RESULT_ACK), "نتيجة غير طبيعية بلا إقرار ولّدت مهمة");

/* ══════════════ سجل خارجي رفعته المريضة ══════════════ */
console.log("\n══ سجل خارجي · تقرير من مستشفى آخر ══");

let ext = { id: "X-1", status: E.EXT_STATE.UNVERIFIED, sourceFacility: "مستشفى أهلي",
  importedBy: patient.id, importedAt: at(10), source: E.SOURCE.EXTERNAL,
  claim: "قصور غدة درقية — ليفوثيروكسين ٥٠" };
ok(!E.canPromote(ext), "التقرير المرفوع لا يدخل القوائم الرسمية قبل تحقق طبيب");

/* ══════════════ الطبيب الثالث — السؤال الحقيقي ══════════════ */
console.log("\n" + "═".repeat(58));
console.log("══ الطبيب الثالث · لم يرَ المريضة قط · يفتح الملف ══");
console.log("═".repeat(58));

const PT = { ...patient, conditions, medications, allergies, procedures, results, imaging,
  referrals, encounters: [enc1], episodes: [epDM, epGBnow], tasks, externalRecords: [ext] };

const snap = E.snapshot(PT, NOW);

console.log(`
   المريضة    : ${snap.identity.name} · ${snap.identity.age} سنة · أنثى
   ⚠️ الحساسية : ${snap.allergies.map((a) => a.substance + " (" + a.reaction + ")").join("، ")}
   المشاكل    : ${snap.activeProblems.map((c) => c.display + (c.stale ? " ⏳" : "")).join("، ")}
   الأدوية    : ${snap.currentMedications.map((m) => m.display + (m.status === E.MED_STATE.UNCONFIRMED ? " (غير مؤكّد)" : "")).join("، ")}
   العمليات   : ${snap.majorProcedures.map((p) => p.display).join("، ")}
   معلّق      : ${snap.pendingTasks.length} مهمة · متأخرة: ${snap.overdueTasks.length}
   غير طبيعي  : ${snap.recentAbnormal.map((r) => r.display + " " + r.value).join("، ")}
   حلقات مفتوحة: ${snap.openEpisodes.map((e) => e.title).join("، ")}
   خارجي غير محقّق: ${snap.unverifiedExternal}`);

ok(snap.allergies[0].substance === "بنسلين", "١. الحساسية الحرجة ظاهرة فوراً");
eq(snap.activeProblems.length, 1, "٢. مشكلة نشطة واحدة — المرارة انحلّت وخرجت");
eq(snap.activeProblems[0].display, "داء السكري النوع ٢", "   والمشكلة النشطة هي الصحيحة");
eq(snap.majorProcedures.length, 1, "٣. العملية الكبرى ظاهرة رغم أن حلقتها أُغلقت");
ok(snap.overdueTasks.length >= 1, "٤. المعلّق ظاهر — نتيجة بلا إقرار");
ok(snap.recentAbnormal.some((r) => r.display === "الهيموغلوبين"), "٥. الشاذ الأخير ظاهر");
eq(snap.openEpisodes.length, 1, "٦. حلقة واحدة مفتوحة (السكري) — المرارة مغلقة");
eq(snap.unverifiedExternal, 1, "٧. السجل الخارجي معلوم وغير مدموج");
eq(snap.unconfirmedMedications, 0, "٨. الميتفورمين مؤكّد حديثاً فهو حالي فعلاً");

/* القصة بالحلقات */
console.log("\n══ القصة مرتّبة بالحلقات ══");
const story = E.timelineByEpisode(PT);
for (const g of story.episodes) {
  console.log(`\n   🔹 ${g.episode.title} — ${g.episode.status}`);
  for (const ev of g.events.slice(0, 6)) {
    console.log(`      ${String(ev.at).slice(0, 10)}  ${ev.type.padEnd(16)} ${ev.title}`);
  }
}
ok(story.episodes.length === 2, "الأحداث انتظمت في قصتين لا في كومة واحدة");
const gb = story.episodes.find((g) => g.episode.id === "EP-GB");
ok(gb.events.length >= 3, "قصة المرارة كاملة: تشخيص + سونار + إحالة + عملية");

/* الصلاحيات على نفس الملف */
console.log("\n══ من يرى ماذا ══");
const treating = { treatingRelationship: true, sameFacility: true };
ok(!E.canAccess({ id: "U-R", role: E.ROLE.RECEPTION }, patient.id, E.CLASS.PROBLEM, treating).ok,
  "الاستقبال لا يرى التشخيص");
ok(E.canAccess({ id: "U-R", role: E.ROLE.RECEPTION }, patient.id, E.CLASS.DEMOGRAPHIC, treating).ok,
  "الاستقبال يرى الاسم والموعد");
ok(!E.canAccess({ id: "DR-X", role: E.ROLE.DOCTOR }, patient.id, E.CLASS.NOTE,
  { treatingRelationship: false }).ok, "طبيب بلا علاقة علاجية يُرفض");
ok(E.canAccess({ id: "DR-3", role: E.ROLE.DOCTOR }, patient.id, E.CLASS.NOTE, treating).ok,
  "الطبيب الثالث المعالج يقرأ الملف");
ok(E.canAccess({ id: "U-P", role: E.ROLE.PATIENT, patientId: patient.id }, patient.id, E.CLASS.AUDIT, {}).ok,
  "المريضة ترى من فتح ملفها");

const bg = E.breakGlass({ id: "DR-ER", role: E.ROLE.DOCTOR }, patient.id,
  "مريضة فاقدة للوعي في الطوارئ ولا يمكن أخذ موافقتها", NOW);
ok(bg.ok && bg.grant.notifyPatient, "كسر الزجاج يعمل — ويُبلَّغ المريض");

console.log("\n" + "─".repeat(58));
if (fails.length) {
  console.log(`${pass} نجحت · ${fails.length} فشلت\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} نجحت · صفر فشل`);
console.log(`
الطبيب الثالث عرف — بلا قراءة ولا ملاحظة تاريخية واحدة:
  أن المريضة تتحسّس البنسلين، وعندها سكري نشط مضبوط على ميتفورمين،
  وأن مرارتها استُؤصلت وانتهت قصتها بنسيج حميد،
  وأن هيموغلوبينها ينخفض ولم يقرّه أحد بعد،
  وأن هناك تقريراً خارجياً يحتاج تحققه هو.
`);
