/* ============================================================
   Advisor Brain — عقل المستشار (Knowledge Graph يُبنى عند التشغيل)

   لا يقرأ المستشار المنتجات مباشرة أثناء المحادثة؛ عند تحميل
   الصفحة يبني هذا الملف رسماً معرفياً يربط:

       المنتجات ⇄ المواد الفعّالة/المغذّيات ⇄ الأعراض ⇄ الأهداف

   الربط تلقائي: يفحص اسم المنتج والاسم الإنجليزي والوسوم والمكوّنات
   ضد قائمة المرادفات (aliases) لكل مغذٍّ في قاعدة المعرفة، ويدمجها
   مع الربط الصريح (nutrientProducts). النتيجة:

   ➕ إضافة منتج جديد في products.js بوسومه
      ⇒ يرتبط بمغذّياته ويدخل محرك التوصية تلقائياً — صفر كود.

   يُحمَّل قبل advisor.js:
     <script src="js/advisor-brain.js"></script>
   ============================================================ */
(function () {
  if (typeof ADVISOR_KB === "undefined") return;
  const KB = ADVISOR_KB;
  const PRODS = (typeof PRODUCTS !== "undefined") ? PRODUCTS : [];

  const norm = (s) => (s || "").toString().toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

  function productText(p) {
    return norm([p.name, p.en, p.brand, p.summary,
      ...(p.tags || []), ...(p.ingredients || [])].join(" · "));
  }

  /* ---------- بناء الرسم المعرفي ---------- */
  const t0 = Date.now();
  const nutrientProducts = {};   // nutrientId -> Set(productId)
  const productNutrients = {};   // productId -> Set(nutrientId)
  let autoLinks = 0, explicitLinks = 0;

  // 1) الربط الصريح من قاعدة المعرفة
  for (const [nid, pids] of Object.entries(KB.nutrientProducts || {})) {
    nutrientProducts[nid] = new Set();
    for (const pid of pids) {
      if (!PRODS.some((p) => p.id === pid)) continue; // منتج حُذف — يتجاهله العقل
      nutrientProducts[nid].add(pid);
      (productNutrients[pid] = productNutrients[pid] || new Set()).add(nid);
      explicitLinks++;
    }
  }

  // 2) الربط التلقائي عبر المرادفات (المواد الفعّالة)
  for (const n of KB.nutrients || []) {
    const aliases = (n.aliases || []).map(norm).filter((a) => a.length >= 3);
    if (!aliases.length) continue;
    nutrientProducts[n.id] = nutrientProducts[n.id] || new Set();
    for (const p of PRODS) {
      if (nutrientProducts[n.id].has(p.id)) continue;
      const txt = productText(p);
      if (aliases.some((a) => txt.includes(a))) {
        nutrientProducts[n.id].add(p.id);
        (productNutrients[p.id] = productNutrients[p.id] || new Set()).add(n.id);
        autoLinks++;
      }
    }
  }

  // 3) إحصاءات الرسم (أعراض/أهداف/قواعد من قاعدة المعرفة)
  const ruleCount = (KB.nutrients || []).reduce((s, n) => s + (n.indicationRules || []).length, 0)
                  + (KB.nutrients || []).reduce((s, n) => s + (n.contraindications || []).length, 0)
                  + (KB.redFlags || []).length;
  const symptomSet = new Set();
  (KB.questions || []).forEach((q) => q.options.forEach((o) =>
    (o.facts || []).forEach((f) => { if (f.startsWith("symptom:")) symptomSet.add(f); })));

  const stats = {
    products: PRODS.length,
    nutrients: (KB.nutrients || []).length,
    goals: (KB.goals || []).length,
    symptoms: symptomSet.size,
    questions: (KB.questions || []).length,
    references: Object.keys(KB.references || {}).length,
    rules: ruleCount,
    explicitLinks, autoLinks,
    linkedProducts: Object.keys(productNutrients).length,
    buildMs: Date.now() - t0,
  };

  /* ---------- الواجهة ---------- */
  const AdvisorBrain = {
    stats,
    // منتجات مغذٍّ ما — الصريح + المكتشف تلقائياً
    productsFor(nutrientId) {
      return [...(nutrientProducts[nutrientId] || [])];
    },
    nutrientsFor(productId) {
      return [...(productNutrients[productId] || [])];
    },
    summary() {
      return `🧠 Advisor Brain — قرأ ${stats.products} منتجاً · ` +
        `${stats.nutrients} مادة فعّالة · ربط ${stats.linkedProducts} منتجاً ` +
        `(${stats.explicitLinks} صريح + ${stats.autoLinks} تلقائي) · ` +
        `${stats.symptoms} عرضاً · ${stats.goals} أهداف صحية · ` +
        `${stats.rules} قاعدة موثّقة بـ${stats.references} مرجعاً دولياً · ` +
        `جاهز في ${stats.buildMs}ms`;
    },
  };

  if (typeof window !== "undefined") {
    window.AdvisorBrain = AdvisorBrain;
    try { console.info(AdvisorBrain.summary()); } catch (e) {}
  }
  if (typeof module !== "undefined") module.exports = AdvisorBrain;
})();
