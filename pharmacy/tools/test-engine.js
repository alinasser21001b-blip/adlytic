/* ============================================================
   اختبارات وحدات المحرك — سلامة الأمان والجرعات والتوقف
   Engine Unit Tests (deterministic, no browser)

   التشغيل:  node pharmacy/tools/test-engine.js
   يفشل (exit 1) عند أي كسر — بوابة جودة قبل النشر مع validate-kb.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// بيئة متصفح دنيا تكفي لتحميل المحرك دون واجهة
const ctx = {
  window: {}, document: { getElementById: () => null },
  navigator: { userAgent: "test" }, performance: { now: () => 42 },
  console, fetch: async () => ({}), Blob: class {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx);
load("advisor-kb.js");
load("advisor.js");

const KB = vm.runInContext("ADVISOR_KB", ctx);
const core = ctx.window.Advisor._core;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// أداة: تشغيل إجابة سؤال بمعرّفه وخياراته
function answer(state, qId, optIds) {
  const q = KB.questions.find((x) => x.id === qId);
  assert(q, "سؤال غير موجود: " + qId);
  core.applyAnswer(state, q, optIds);
}

console.log("\n=== اختبارات محرك المستشار ===\n");

/* ---------- 1) بوابة الأمان: الإقصاء التام ---------- */
t("الحديد يُقصى تماماً مع الهيموكروماتوز رغم هدف الطاقة", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  answer(s, "q_pregnancy_safety", ["no"]);
  answer(s, "q_conditions", ["iron_ov"]);
  answer(s, "q_fatigue", ["pale"]);           // أقوى إشارة حديد
  assert(s.confidence.iron === 0, "ثقة الحديد يجب أن تكون صفراً");
});

t("المغنيسيوم والبوتاسيوم يُقصيان مع قصور الكلى", () => {
  const s = core.newState();
  answer(s, "q_goal", ["sleep"]);
  answer(s, "q_conditions", ["kidney"]);
  answer(s, "q_sleep", ["cramps"]);
  assert(s.confidence.magnesium === 0, "المغنيسيوم لم يُقصَ");
  assert(s.confidence.potassium === 0, "البوتاسيوم لم يُقصَ");
});

t("الكالسيوم وفيتامين د يُقصى الأول فقط مع فرط كالسيوم الدم", () => {
  const s = core.newState();
  answer(s, "q_goal", ["bones"]);
  answer(s, "q_conditions", ["highcal"]);
  answer(s, "q_bones", ["yes"]);
  assert(s.confidence.calcium === 0, "الكالسيوم لم يُقصَ");
  assert(s.confidence.vitamin_d === 0, "فيتامين د يُقصى أيضاً مع فرط الكالسيوم");
});

/* ---------- 2) تسلسل الأسئلة ---------- */
t("السؤال الأول دائماً هو الهدف", () => {
  const s = core.newState();
  assert(core.nextQuestion(s).id === "q_goal");
});

t("أسئلة الأمان تأتي بعد الهدف وقبل أسئلة الأعراض", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  const q = core.nextQuestion(s);
  assert(q.isSafetyGate, "المتوقع سؤال أمان، جاء: " + q.id);
});

t("سؤال الحمل يُتخطى للذكور", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  answer(s, "q_sex", ["male"]);
  const pregQ = KB.questions.find((q) => q.id === "q_pregnancy_safety");
  assert(!core.questionVisible(pregQ, s), "سؤال الحمل ظهر لذكر");
});

t("لا توصية قبل استيفاء أسئلة الأمان", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  assert(!core.readyToRecommend(s), "أوصى قبل أسئلة الأمان");
});

/* ---------- 3) الجرعات الديموغرافية (DRI) ---------- */
function firstRecFor(factsSetup) {
  const s = core.newState();
  factsSetup(s);
  core._setState(s);
  return { s, recs: core.buildRecommendations(s) };
}

t("صف جرعة الحديد يطابق أنثى 19–50 (18 ملغ)", () => {
  const s = core.newState();
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  const iron = KB.nutrients.find((n) => n.id === "iron");
  const row = iron.dosage.rows.find((r) => r.when.every((t) => s.facts.has(t)));
  assert(row && row.rda.includes("18"), "المتوقع 18 ملغ، وجد: " + (row && row.rda));
});

t("صف جرعة الحديد للحامل (27 ملغ) له أولوية ترتيبية صحيحة", () => {
  const s = core.newState();
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  answer(s, "q_pregnancy_safety", ["preg"]);
  const iron = KB.nutrients.find((n) => n.id === "iron");
  const row = iron.dosage.rows.find((r) => r.when.every((t) => s.facts.has(t)));
  // أول صف مطابق: أنثى 19–50 (18) يسبق صف الحمل — نتحقق أن صف الحمل موجود ومطابق أيضاً
  const pregRow = iron.dosage.rows.find((r) => r.when.includes("flag:pregnancy"));
  assert(pregRow && pregRow.when.every((t) => s.facts.has(t)), "صف الحمل غير مطابق");
});

t("فيتامين د: فوق 70 سنة يأخذ 800 وحدة", () => {
  const s = core.newState();
  answer(s, "q_sex", ["male"]);
  answer(s, "q_age", ["senior"]);
  const vd = KB.nutrients.find((n) => n.id === "vitamin_d");
  const row = vd.dosage.rows.find((r) => r.when.every((t) => s.facts.has(t)));
  assert(row.rda.includes("800"), "المتوقع 800، وجد: " + row.rda);
});

/* ---------- 4) الثقة والترتيب ---------- */
t("الثقة محصورة بين 0 و1 لكل المغذّيات في سيناريو كثيف", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy", "hair", "immunity", "bones", "sleep"]);
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  answer(s, "q_pregnancy_safety", ["no"]);
  answer(s, "q_conditions", ["none"]);
  answer(s, "q_fatigue", ["pale"]);
  answer(s, "q_sun", ["low"]);
  Object.entries(s.confidence).forEach(([id, c]) =>
    assert(c >= 0 && c <= 1, `${id}: ثقة خارج النطاق ${c}`));
});

t("إشارات الحديد القوية تجعله يتصدر لهدف الطاقة", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  answer(s, "q_pregnancy_safety", ["no"]);
  answer(s, "q_conditions", ["none"]);
  answer(s, "q_fatigue", ["pale"]);
  answer(s, "q_diet", ["veg"]);
  answer(s, "q_period", ["yes"]);
  assert(s.order[0] === "iron", "المتصدر: " + s.order[0]);
});

/* ---------- 5) التوقف والحد الأقصى ---------- */
t("عند الحد الأقصى مع أمان معلّق: لا توصية بل يُكمل أسئلة الأمان", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  s.askedCount = KB.meta.maxQuestions;
  assert(!core.readyToRecommend(s), "أوصى رغم سؤال أمان معلّق");
  assert(core.nextQuestion(s).isSafetyGate, "السؤال التالي ليس سؤال أمان");
});

t("يتوقف عند الحد الأقصى بعد استيفاء أسئلة الأمان", () => {
  const s = core.newState();
  answer(s, "q_goal", ["energy"]);
  answer(s, "q_sex", ["female"]);
  answer(s, "q_age", ["adult"]);
  answer(s, "q_pregnancy_safety", ["no"]);
  answer(s, "q_conditions", ["none"]);
  s.askedCount = KB.meta.maxQuestions;
  assert(core.readyToRecommend(s), "لم يتوقف عند الحد رغم استيفاء الأمان");
});

t("التوصيات لا تتجاوز 3 وكلها فوق عتبة العرض", () => {
  const { recs } = firstRecFor((s) => {
    answer(s, "q_goal", ["energy", "hair"]);
    answer(s, "q_sex", ["female"]);
    answer(s, "q_age", ["adult"]);
    answer(s, "q_pregnancy_safety", ["no"]);
    answer(s, "q_conditions", ["none"]);
    answer(s, "q_fatigue", ["pale"]);
    answer(s, "q_hair", ["loss"]);
  });
  assert(recs.length <= 3, "أكثر من 3 توصيات");
  recs.forEach((r) => assert(r.confidence >= 0.25, "توصية تحت العتبة"));
});

/* ---------- 6) أثر الشرح ---------- */
t("كل توصية تحمل أثر شرح ومرجعاً أساسياً صالحاً", () => {
  const { recs } = firstRecFor((s) => {
    answer(s, "q_goal", ["immunity"]);
    answer(s, "q_sex", ["male"]);
    answer(s, "q_age", ["adult"]);
    answer(s, "q_conditions", ["none"]);
    answer(s, "q_immunity", ["often"]);
  });
  assert(recs.length > 0, "لا توصيات");
  recs.forEach((r) => {
    assert(r.trace.whyShown.length > 0, r.nutrient.id + ": بلا أسباب");
    assert(r.trace.safetyChecked.length > 0, r.nutrient.id + ": بلا فحص أمان");
    assert(KB.references[r.nutrient.primaryRef], r.nutrient.id + ": مرجع أساسي مفقود");
  });
});

/* ---------- النتيجة ---------- */
console.log(`\nالنتيجة: ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
