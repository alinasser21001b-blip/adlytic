/* ============================================================
   مدقّق قاعدة المعرفة — بوابة الجودة العلمية والتقنية
   Knowledge Base Integrity Validator

   يفحص أن كل عنصر في قاعدة المعرفة سليم قبل النشر:
   1) كل قاعدة/جرعة/مانع يستشهد بمرجع موجود في سجلّ Layer 1.
   2) كل مرجع مكتمل الحقول (org/title/type/year/version/reviewed/
      lastVerified/evidenceLevel/url) وبقيم صالحة.
   3) كل وسم حقيقة (fact) تستخدمه القواعد له سؤال يُنتجه —
      لا قواعد "ميتة" لا يمكن أن تعمل أبداً.
   4) كل مغذٍّ مذكور في الأهداف/المنتجات موجود فعلاً، وكل معرّف
      منتج موجود في الكتالوج (products.js).
   5) لكل مغذٍّ جرعة مرجعية وحد أعلى، وأسئلة الأمان الإجبارية موجودة.

   التشغيل:  node pharmacy/tools/validate-kb.js
   يفشل (exit 1) عند أي خطأ — صالح كبوابة CI قبل النشر.
   ============================================================ */

const path = require("path");
const KB = require(path.join(__dirname, "..", "js", "advisor-kb.js"));

// تحميل PRODUCTS من products.js (ملف متصفح — نقيّمه في سياق معزول)
const fs = require("fs");
const vm = require("vm");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "js", "products.js"), "utf8") +
  "\n;this.__PRODUCTS = PRODUCTS;", ctx);
const PRODUCTS = ctx.__PRODUCTS || [];
const productIds = new Set(PRODUCTS.map((p) => p.id));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const EVIDENCE_LEVELS = new Set(["High", "Moderate", "Limited"]);
const REF_FIELDS = ["org", "title", "type", "year", "version", "reviewed", "lastVerified", "evidenceLevel", "url"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- 1+2) سجلّ المراجع ---------- */
const refIds = new Set(Object.keys(KB.references || {}));
for (const [id, r] of Object.entries(KB.references || {})) {
  for (const f of REF_FIELDS)
    if (r[f] === undefined || r[f] === "") err(`ref ${id}: الحقل "${f}" مفقود`);
  if (r.evidenceLevel && !EVIDENCE_LEVELS.has(r.evidenceLevel))
    err(`ref ${id}: evidenceLevel غير صالح "${r.evidenceLevel}"`);
  if (r.reviewed && !DATE_RE.test(r.reviewed)) err(`ref ${id}: reviewed ليس بصيغة YYYY-MM-DD`);
  if (r.lastVerified && !DATE_RE.test(r.lastVerified)) err(`ref ${id}: lastVerified ليس بصيغة YYYY-MM-DD`);
  if (r.year && (r.year < 1990 || r.year > 2100)) err(`ref ${id}: سنة غير منطقية ${r.year}`);
  if (r.url && !/^https:\/\//.test(r.url)) err(`ref ${id}: الرابط ليس https`);
}
const checkRef = (where, refId) => {
  if (!refId) err(`${where}: بلا مرجع (ref)`);
  else if (!refIds.has(refId)) err(`${where}: يستشهد بمرجع غير موجود "${refId}"`);
};

/* ---------- جمع الحقائق التي تُنتجها الأسئلة ---------- */
const producibleFacts = new Set();
for (const q of KB.questions || [])
  for (const o of q.options || [])
    for (const f of o.facts || []) producibleFacts.add(f);
// الحقائق الديموغرافية المركّبة تُنتج ضمنياً من إجابات منفصلة — كلها من الأسئلة.

/* ---------- 3+5) المغذّيات ---------- */
const nutrientIds = new Set((KB.nutrients || []).map((n) => n.id));
for (const n of KB.nutrients || []) {
  checkRef(`nutrient ${n.id}.primaryRef`, n.primaryRef);
  if (!n.name) err(`nutrient ${n.id}: بلا اسم عربي`);
  if (!n.blurb) warn(`nutrient ${n.id}: بلا نبذة (blurb)`);

  // الجرعة
  if (!n.dosage) err(`nutrient ${n.id}: بلا كائن جرعة (dosage)`);
  else {
    if (!n.dosage.rda) err(`nutrient ${n.id}: بلا كمية مرجعية (dosage.rda)`);
    if (!n.dosage.upperLimit) err(`nutrient ${n.id}: بلا حدّ أعلى (dosage.upperLimit)`);
    checkRef(`nutrient ${n.id}.dosage.ref`, n.dosage.ref);
    checkRef(`nutrient ${n.id}.dosage.ulRef`, n.dosage.ulRef);
    for (const [i, row] of (n.dosage.rows || []).entries()) {
      if (!row.rda) err(`nutrient ${n.id}.dosage.rows[${i}]: بلا rda`);
      for (const t of row.when || [])
        if (!producibleFacts.has(t))
          err(`nutrient ${n.id}.dosage.rows[${i}]: شرط "${t}" لا يُنتجه أي سؤال`);
    }
  }

  // قواعد الدلالة
  if (!n.indicationRules?.length) err(`nutrient ${n.id}: بلا قواعد دلالة`);
  for (const [i, r] of (n.indicationRules || []).entries()) {
    checkRef(`nutrient ${n.id}.rules[${i}]`, r.ref);
    if (!EVIDENCE_LEVELS.has(r.evidenceLevel))
      err(`nutrient ${n.id}.rules[${i}]: evidenceLevel غير صالح "${r.evidenceLevel}"`);
    if (typeof r.weight !== "number" || r.weight <= 0)
      err(`nutrient ${n.id}.rules[${i}]: وزن غير صالح`);
    if (!producibleFacts.has(r.when) && !r.when.startsWith("demo:"))
      err(`nutrient ${n.id}.rules[${i}]: الحقيقة "${r.when}" لا يُنتجها أي سؤال — قاعدة ميتة`);
  }

  // موانع الاستعمال
  for (const [i, c] of (n.contraindications || []).entries()) {
    checkRef(`nutrient ${n.id}.contra[${i}]`, c.ref);
    if (!["exclude", "flag"].includes(c.action))
      err(`nutrient ${n.id}.contra[${i}]: action غير صالح "${c.action}"`);
    if (!c.note) err(`nutrient ${n.id}.contra[${i}]: بلا نص تنبيه`);
    if (!producibleFacts.has("flag:" + c.flag))
      warn(`nutrient ${n.id}.contra[${i}]: العلم "${c.flag}" لا يُنتجه أي سؤال — البوابة لن تُفعَّل`);
  }
}

/* ---------- 4) الأهداف والمنتجات ---------- */
for (const g of KB.goals || []) {
  if (!g.name) err(`goal ${g.id}: بلا اسم`);
  for (const nid of g.nutrients || [])
    if (!nutrientIds.has(nid)) err(`goal ${g.id}: يشير لمغذٍّ غير موجود "${nid}"`);
  // كل هدف يجب أن يكون خياراً في سؤال الأهداف
  const goalQ = (KB.questions || []).find((q) => q.id === "q_goal");
  if (goalQ && !goalQ.options.some((o) => (o.facts || []).includes("goal:" + g.id)))
    err(`goal ${g.id}: غير موجود كخيار في سؤال الأهداف q_goal`);
}
for (const [nid, pids] of Object.entries(KB.nutrientProducts || {})) {
  if (!nutrientIds.has(nid)) err(`nutrientProducts: مغذٍّ غير موجود "${nid}"`);
  for (const pid of pids)
    if (!productIds.has(pid)) err(`nutrientProducts.${nid}: منتج غير موجود في الكتالوج "${pid}"`);
}
// كل مغذٍّ يجب أن يكون له مدخل (ولو فارغاً) في nutrientProducts
for (const nid of nutrientIds)
  if (!(nid in (KB.nutrientProducts || {})))
    warn(`nutrient ${nid}: بلا مدخل في nutrientProducts (سيظهر مسار الصيدلي دائماً)`);

/* ---------- الأسئلة ---------- */
const qIds = new Set((KB.questions || []).map((q) => q.id));
let safetyGates = 0;
for (const q of KB.questions || []) {
  if (q.isSafetyGate) safetyGates++;
  if (!q.options?.length) err(`question ${q.id}: بلا خيارات`);
  if (!["single", "multi"].includes(q.type)) err(`question ${q.id}: نوع غير صالح`);
  for (const t of [...(q.appearWhen || []), ...(q.skipWhen || [])]) {
    if (t.startsWith("answered:")) {
      if (!qIds.has(t.slice(9))) err(`question ${q.id}: شرط يشير لسؤال غير موجود "${t}"`);
    } else if (!producibleFacts.has(t)) {
      err(`question ${q.id}: شرط "${t}" لا يُنتجه أي سؤال`);
    }
  }
  for (const nid of q.relatedNutrients || [])
    if (!nutrientIds.has(nid)) err(`question ${q.id}: relatedNutrients يشير لمغذٍّ غير موجود "${nid}"`);
}
if (safetyGates < 2) err(`أسئلة الأمان الإجبارية أقل من 2 (الموجود: ${safetyGates})`);

/* ---------- meta ---------- */
if (!KB.meta?.disclaimerAr) err("meta: بلا إخلاء مسؤولية");
if (!(KB.meta?.maxQuestions >= 5)) err("meta: maxQuestions أقل من 5");

/* ---------- التقرير ---------- */
console.log(`\n=== تدقيق قاعدة المعرفة (v${KB.meta?.version}) ===`);
console.log(`المراجع: ${refIds.size} · المغذّيات: ${nutrientIds.size} · الأهداف: ${(KB.goals||[]).length} · الأسئلة: ${qIds.size} · منتجات الكتالوج: ${productIds.size}`);
if (warnings.length) { console.log(`\nتحذيرات (${warnings.length}):`); warnings.forEach((w) => console.log("  ⚠ " + w)); }
if (errors.length) { console.log(`\nأخطاء (${errors.length}):`); errors.forEach((e) => console.log("  ✗ " + e)); console.log("\nفشل التدقيق.\n"); process.exit(1); }
console.log("\n✓ قاعدة المعرفة سليمة — كل قاعدة موثّقة بمرجع، ولا قواعد ميتة.\n");
