/* ============================================================
   صيدلية در الشارقة — محرك المستشار الصحي (حتمي، قابل للتفسير)
   Rule-Based Recommendation Engine  (الركيزة 3)

   لا يحتوي أي معرفة طبية ولا أسماء مغذّيات — كلها في advisor-kb.js.
   لا يستخدم أي ذكاء اصطناعي خارجي. يعمل أوفلاين بالكامل.

   يعتمد على: advisor-kb.js (ADVISOR_KB), products.js (PRODUCTS/byId),
              app.js (waGeneralLink, thumbHtml, addToCart…).
   ============================================================ */
(function () {
  if (typeof ADVISOR_KB === "undefined") return;
  const KB = ADVISOR_KB;
  const M = KB.meta;
  const efactor = (lvl) => M.evidenceFactor[lvl] ?? 0.5;
  // Layer 3 يقرأ مراجع Layer 1 عبر المعرّف — لا يخترع أي بيانات
  const refOf = (id) => (KB.references && KB.references[id]) || null;

  /* ---------- حالة المحادثة (تُحدَّث بعد كل إجابة) ---------- */
  function newState() {
    return {
      facts: new Set(),        // وسوم الحقائق المتراكمة (goal:/symptom:/lifestyle:/flag:)
      answered: {},            // qId -> [optionIds]
      askedCount: 0,
      confidence: {},          // nutrientId -> 0..1
      order: [],               // ترتيب المغذّيات تنازلياً
      topConfidence: 0,
      gap: 0,
    };
  }

  /* ---------- توافق الحقائق مع شرط ---------- */
  const factActive = (state, tok) =>
    tok.startsWith("answered:") ? !!state.answered[tok.slice(9)] : state.facts.has(tok);

  function questionVisible(q, state) {
    if (state.answered[q.id]) return false;
    if ((q.skipWhen || []).some((t) => factActive(state, t))) return false;
    if (!q.appearWhen || q.appearWhen.length === 0) return true;
    return q.appearWhen.some((t) => factActive(state, t));
  }

  /* ---------- تطبيق إجابة على الحالة ---------- */
  function applyAnswer(state, q, optionIds) {
    state.answered[q.id] = optionIds;
    state.askedCount++;
    q.options
      .filter((o) => optionIds.includes(o.id))
      .forEach((o) => (o.facts || []).forEach((f) => state.facts.add(f)));
    recompute(state);
  }

  /* ---------- الثقة التدريجية + بوابة الأمان ---------- */
  function nutrientMaxScore(n) {
    return n.indicationRules.reduce((s, r) => (r.weight > 0 ? s + r.weight * efactor(r.evidenceLevel) : s), 0);
  }

  function safetyOf(n, state) {
    // يعيد {excluded:bool, cautions:[{note,source}]}
    const res = { excluded: false, cautions: [] };
    (n.contraindications || []).forEach((c) => {
      if (!state.facts.has("flag:" + c.flag)) return;
      if (c.action === "exclude") res.excluded = true;
      else res.cautions.push({ note: c.note, source: (refOf(c.ref) || {}).org || c.ref });
    });
    return res;
  }

  // نسبة اكتمال المعلومات لمغذٍّ: كم من أسئلته ذات الصلة أُجيب عنها
  function completeness(nId, state) {
    const rel = KB.questions.filter((q) => (q.relatedNutrients || []).includes(nId));
    if (!rel.length) return 1;
    const done = rel.filter((q) => state.answered[q.id]).length;
    return done / rel.length;
  }

  function recompute(state) {
    const conf = {};
    KB.nutrients.forEach((n) => {
      const safety = safetyOf(n, state);
      if (safety.excluded) { conf[n.id] = 0; return; }
      const max = nutrientMaxScore(n) || 1;
      let raw = 0;
      n.indicationRules.forEach((r) => {
        if (state.facts.has(r.when)) raw += r.weight * efactor(r.evidenceLevel);
      });
      let c = Math.max(0, Math.min(1, raw / max));
      // كبح الثقة عند نقص المعلومات (نطلب مزيداً من الأسئلة بدل توصية مبكرة)
      c *= 0.55 + 0.45 * completeness(n.id, state);
      conf[n.id] = c;
    });
    state.confidence = conf;
    state.order = Object.keys(conf)
      .filter((id) => conf[id] > 0.001)
      .sort((a, b) => conf[b] - conf[a]);
    state.topConfidence = state.order.length ? conf[state.order[0]] : 0;
    state.gap = state.order.length > 1 ? conf[state.order[0]] - conf[state.order[1]] : state.topConfidence;
  }

  /* ---------- اختيار السؤال التالي (تقليل عدم اليقين) ---------- */
  function pendingSafetyGate(state) {
    return KB.questions.find((q) => q.isSafetyGate && questionVisible(q, state));
  }

  function activeRedFlags(state) {
    return (KB.redFlags || []).filter((rf) => state.facts.has(rf.fact));
  }

  function activeGoals(state) {
    return [...state.facts].filter((f) => f.startsWith("goal:")).map((f) => f.slice(5));
  }

  function nextQuestion(state) {
    // نسأل الهدف أولاً، ثم أسئلة الأمان الإجبارية قبل أي توصية
    const gate = pendingSafetyGate(state);
    if (gate && state.answered["q_goal"]) return gate;

    const goals = activeGoals(state);
    const candidates = KB.questions.filter((q) => questionVisible(q, state));
    if (!candidates.length) return null;

    // المغذّيات المتنافسة قرب القمة (ضمن فجوة 0.2) — تفريقها هو المكسب المعلوماتي
    const contested = state.order.filter((id) => state.topConfidence - state.confidence[id] <= 0.2);

    let best = null, bestScore = -Infinity;
    candidates.forEach((q) => {
      const rel = q.relatedNutrients || [];
      const goalRelevance = (q.relatedGoals || rel.length ? rel : []).length; // احتياط
      const infoGain = rel.filter((id) => contested.includes(id)).length; // كم يفرّق المتنافسين
      const goalMatch = goals.length
        ? rel.filter((id) => KB.nutrients.find((n) => n.id === id &&
            n.indicationRules.some((r) => goals.some((g) => r.when === "goal:" + g)))).length
        : 0;
      const score = q.priority * 1.0 + infoGain * 2.5 + goalMatch * 1.5;
      if (score > bestScore) { bestScore = score; best = q; }
    });
    return best;
  }

  /* ---------- قاعدة التوقّف / توقيت التوصية ---------- */
  function readyToRecommend(state) {
    if (pendingSafetyGate(state)) return false;
    if (activeRedFlags(state).length) return true; // خطورة: نتوقف فوراً وننصح بالطبيب
    if (state.askedCount >= M.maxQuestions) return true;
    if (!nextQuestion(state)) return true; // لا مزيد من الأسئلة ذات الصلة
    return (
      state.topConfidence >= M.confidenceThreshold &&
      state.gap >= M.confidenceGap &&
      state.askedCount >= 3
    );
  }

  /* ---------- بناء التوصيات + أثر الشرح ---------- */
  function buildRecommendations(state) {
    const goals = activeGoals(state);
    return state.order
      .filter((id) => state.confidence[id] >= 0.25)
      .slice(0, 3)
      .map((id) => {
        const n = KB.nutrients.find((x) => x.id === id);
        const safety = safetyOf(n, state);
        // أبرز الدوافع
        const drivers = n.indicationRules
          .filter((r) => state.facts.has(r.when))
          .sort((a, b) => b.weight * efactor(b.evidenceLevel) - a.weight * efactor(a.evidenceLevel))
          .slice(0, 3)
          .map((r) => ({ label: factLabel(r.when), weight: r.weight, level: r.evidenceLevel }));
        const comp = completeness(id, state);
        // المنتجات المتوفّرة لهذا المغذّي — من العقل (صريح + تلقائي) إن وُجد
        const prodIds = (typeof AdvisorBrain !== "undefined")
          ? AdvisorBrain.productsFor(id)
          : (KB.nutrientProducts[id] || []);
        const products = prodIds.map((pid) => (typeof byId === "function" ? byId(pid) : null))
          .filter((p) => p); // موجود في الكتالوج
        return {
          nutrient: n,
          confidence: state.confidence[id],
          trace: {
            whyShown: drivers.map((d) => d.label),
            topDrivers: drivers,
            reducedBy: comp < 1 ? ["بعض المعلومات ذات الصلة لم تُجمع بعد"] : [],
            safetyChecked: buildSafetyChecked(n, state),
            cautions: safety.cautions,
            missingForHigher: comp < 1 ? "إجابات إضافية ترفع الدقة" : null,
          },
          products,
        };
      });
  }

  const FLAG_LABELS = {
    hypercalcemia: "ارتفاع كالسيوم الدم", kidney_disease: "مرض الكلى",
    iron_overload: "زيادة الحديد", blood_thinner: "مميّع الدم",
    lab_tests_soon: "تحاليل دم قريبة", male_adult: "رجل بالغ",
    pregnancy: "الحمل", nursing: "الرضاعة",
  };
  const flagLabel = (f) => FLAG_LABELS[f] || f;

  function buildSafetyChecked(n, state) {
    const out = [];
    (n.contraindications || []).forEach((c) => {
      const present = state.facts.has("flag:" + c.flag);
      if (c.action === "exclude" && !present) out.push("لا يوجد مانع (" + flagLabel(c.flag) + ") ✓");
      if (c.action === "flag" && present) out.push("تنبيه: " + c.note);
    });
    if (!out.length) out.push("لا موانع أمان مسجّلة لحالتك ✓");
    return out;
  }

  const FACT_LABELS = {
    "goal:energy": "هدفك: طاقة", "goal:focus": "هدفك: تركيز", "goal:hair": "هدفك: شعر",
    "goal:immunity": "هدفك: مناعة", "goal:sleep": "هدفك: نوم", "goal:bones": "هدفك: عظام",
    "goal:skin": "هدفك: بشرة", "goal:pregnancy": "هدفك: الحمل",
    "symptom:fatigue": "إرهاق متكرر", "symptom:pale": "شحوب", "symptom:hair_loss": "تساقط شعر",
    "symptom:brittle_nails": "أظافر هشّة", "symptom:tingling": "تنميل", "symptom:brain_fog": "تشتّت ذهني",
    "symptom:frequent_colds": "نزلات برد متكررة", "symptom:poor_sleep": "قلة نوم", "symptom:stress": "توتر",
    "symptom:cramps": "تشنّج عضلي", "symptom:bone_pain": "ألم عظام", "symptom:dull_skin": "بهتان البشرة",
    "symptom:heavy_period": "دورة غزيرة", "symptom:slow_healing": "التئام بطيء",
    "lifestyle:sun_low": "قلة تعرّض للشمس", "lifestyle:indoor": "عمل داخلي",
    "lifestyle:vegetarian": "نظام نباتي", "lifestyle:low_meat": "قليل اللحوم",
    "lifestyle:low_fish": "قليل الأسماك", "lifestyle:heavy_period": "دورة غزيرة",
    "flag:pregnancy": "حمل", "flag:planning_pregnancy": "تخطيط للحمل",
  };
  const factLabel = (t) => FACT_LABELS[t] || t;

  /* ================= واجهة المحادثة (الركيزة 1 — UI) ================= */
  let STATE = null, MOUNT = null;

  function start() {
    STATE = newState();
    render();
    Analytics.event("advisor_start", {});
  }

  function selectAndAnswer(q, selected) {
    if (!selected.length && q.type !== "multi") return;
    applyAnswer(STATE, q, selected);
    Analytics.event("advisor_answer", { q: q.id, opts: selected });
    render();
  }

  function render() {
    if (!MOUNT) return;
    const ready = readyToRecommend(STATE);
    const q = ready ? null : nextQuestion(STATE);
    if (!q) return renderResults();
    renderQuestion(q);
  }

  function progressPct() {
    const total = Math.max(3, Math.min(M.maxQuestions, KB.questions.length));
    return Math.min(100, Math.round((STATE.askedCount / total) * 100));
  }

  function renderQuestion(q) {
    const multi = q.type === "multi";
    const opts = q.options.map((o, i) =>
      `<button class="adv-opt" data-i="${i}">${o.label}</button>`).join("");
    const gate = q.isSafetyGate
      ? `<span class="adv-gate">سؤال أمان</span>` : "";
    MOUNT.innerHTML = `
      <div class="adv-card">
        <div class="adv-progress"><span style="width:${progressPct()}%"></span></div>
        <div class="adv-qhead">${gate}<span class="adv-step">سؤال ${STATE.askedCount + 1}</span></div>
        <h3 class="adv-q">${q.text}</h3>
        <div class="adv-opts ${multi ? "multi" : ""}">${opts}</div>
        ${multi ? `<button class="adv-next" disabled>متابعة ←</button>` : ""}
        <p class="adv-note">${KB.meta.disclaimerAr}</p>
      </div>`;
    const chosen = new Set();
    const optEls = [...MOUNT.querySelectorAll(".adv-opt")];
    const nextBtn = MOUNT.querySelector(".adv-next");
    optEls.forEach((el) => el.addEventListener("click", () => {
      const i = +el.dataset.i, id = q.options[i].id;
      if (multi) {
        if (chosen.has(id)) { chosen.delete(id); el.classList.remove("on"); }
        else { chosen.add(id); el.classList.add("on"); }
        if (nextBtn) nextBtn.disabled = chosen.size === 0;
      } else {
        selectAndAnswer(q, [id]);
      }
    }));
    if (nextBtn) nextBtn.addEventListener("click", () => selectAndAnswer(q, [...chosen]));
  }

  function confBar(c) {
    const pct = Math.round(c * 100);
    const lvl = c >= 0.7 ? "عالية" : c >= 0.45 ? "متوسطة" : "مبدئية";
    return `<div class="adv-conf"><span style="width:${pct}%"></span></div>
            <small class="adv-conf-l">ملاءمة ${lvl} (${pct}%)</small>`;
  }

  function evBadge(lvl) {
    const map = { High: "دليل قوي", Moderate: "دليل متوسط", Limited: "دليل محدود" };
    const cls = { High: "hi", Moderate: "mid", Limited: "lo" }[lvl] || "lo";
    return `<span class="adv-ev ${cls}">${map[lvl] || lvl}</span>`;
  }

  function productMini(p) {
    const thumb = typeof thumbHtml === "function" ? thumbHtml(p) : "";
    return `<a class="adv-prod" href="product.html?id=${p.id}"
              onclick="Advisor._clickProduct('${p.id}')">
        <div class="adv-prod-img">${thumb}</div>
        <div class="adv-prod-b"><b>${p.name}</b><small>${p.brand || ""}</small>
          <span class="adv-prod-ask">اسأل عن السعر والتوفّر ←</span></div>
      </a>`;
  }

  function renderDoctorReferral(reds) {
    Analytics.event("advisor_results", {
      goals: activeGoals(STATE), nutrients: [], questions: STATE.askedCount,
      topConfidence: 0, redFlags: reds.map((r) => r.fact),
    });
    const items = reds.map((rf) => {
      const ref = refOf(rf.ref) || {};
      return `<div class="adv-red-item">
        <b>${rf.label}</b>
        <p>${rf.advice}</p>
        <small class="adv-cite">المرجع: ${ref.org || ""} — ${ref.title || ""} (${ref.year || ""})</small>
      </div>`;
    }).join("");
    MOUNT.innerHTML = `
      <div class="adv-card adv-results">
        <div class="adv-doctor">
          <div class="adv-doctor-ic">🩺</div>
          <h3 class="adv-q">ننصحك بمراجعة طبيب — هذه الأعراض لا تُعالَج بالمكملات</h3>
          <p class="adv-doctor-lead">بناءً على إجاباتك، ذكرت عرضاً (أو أكثر) تصنّفه الإرشادات
            السريرية الدولية كعرض يستوجب تقييماً طبياً. المكملات الغذائية ليست العلاج
            المناسب هنا، والأولوية هي الفحص الطبي.</p>
          ${items}
          <div class="adv-handoff">
            <p>صيدلينا يستطيع توجيهك — أرسل حالتك كاملة وسيرشدك للخطوة الصحيحة:</p>
            <a class="btn-pill" target="_blank" rel="noopener"
               href="${waConsult([])}" onclick="Advisor._clickWa()">
              <svg class="wa-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/></svg>
              أرسل حالتي لصيدلي الآن
            </a>
            <button class="adv-restart" onclick="Advisor.restart()">ابدأ استشارة جديدة</button>
          </div>
          <p class="adv-note">${KB.meta.disclaimerAr}</p>
        </div>
      </div>`;
  }

  function renderResults() {
    const reds = activeRedFlags(STATE);
    if (reds.length) return renderDoctorReferral(reds);
    const recs = buildRecommendations(STATE);
    Analytics.event("advisor_results", {
      goals: activeGoals(STATE),
      nutrients: recs.map((r) => r.nutrient.id),
      questions: STATE.askedCount,
      topConfidence: +STATE.topConfidence.toFixed(2),
    });

    if (!recs.length) {
      MOUNT.innerHTML = `
        <div class="adv-card">
          <h3 class="adv-q">لم نجمع دلائل كافية لاقتراح دقيق</h3>
          <p class="adv-note">الأفضل أن يوجّهك صيدلي مباشرة بناءً على حالتك.</p>
          <a class="btn-pill" target="_blank" rel="noopener"
             href="${waConsult([])}" onclick="Advisor._clickWa()">استشر صيدلياً على واتساب</a>
          <button class="adv-restart" onclick="Advisor.restart()">ابدأ من جديد</button>
        </div>`;
      return;
    }

    const cards = recs.map((r) => {
      const n = r.nutrient;
      const ev = refOf(n.primaryRef) || {};          // مرجع Layer 1
      const dose = n.dosage || {};
      // اختيار صف الجرعة المطابق للفئة الديموغرافية من جداول DRI — حتمي:
      // أول صف تتحقق كل شروطه؛ الصف بلا شروط هو الافتراضي. لا اختراع للقيم.
      const row = (dose.rows || []).find((r) => (r.when || []).every((t) => STATE.facts.has(t)));
      const rdaText = (row && row.rda) || dose.rda;
      const doseRef = refOf(dose.ref) || ev;
      const ulRef = refOf(dose.ulRef) || doseRef;
      const prods = r.products.length
        ? `<div class="adv-prods">${r.products.slice(0, 3).map(productMini).join("")}</div>`
        : `<p class="adv-note">لا يوجد منتج معروض حالياً لهذا المغذّي — تحدّث لصيدلينا عن بديل متوفّر.</p>`;
      const cautions = r.trace.cautions.length
        ? `<div class="adv-caution">⚠️ ${r.trace.cautions.map((c) => c.note).join(" · ")}</div>` : "";
      return `
      <div class="adv-rec">
        <div class="adv-rec-head">
          <h4>${n.name} ${evBadge(ev.evidenceLevel)}</h4>
          ${confBar(r.confidence)}
        </div>
        <p class="adv-blurb">${n.blurb}</p>
        ${cautions}
        <div class="adv-dose">
          <div><b>الكمية المرجعية لفئتك:</b> ${rdaText || "راجع الصيدلي"}
            <span class="adv-cite">(${(doseRef.org || "")}${doseRef.year ? "، " + doseRef.year : ""})</span></div>
          <div><b>الحد الأعلى:</b> ${dose.upperLimit || "راجع الصيدلي"}
            <span class="adv-cite">(${(ulRef.org || "")}${ulRef.year ? "، " + ulRef.year : ""})</span></div>
        </div>
        <details class="adv-why">
          <summary>لماذا اقتُرح لك؟ والمصادر العلمية</summary>
          <ul>
            ${r.trace.whyShown.map((w) => `<li>✓ ${w}</li>`).join("")}
            ${r.trace.safetyChecked.map((s) => `<li>🛡️ ${s}</li>`).join("")}
            ${r.trace.reducedBy.map((s) => `<li>◦ ${s}</li>`).join("")}
          </ul>
          <div class="adv-src">
            <b>المرجع الأساسي:</b>
            <a href="${ev.url || "#"}" target="_blank" rel="noopener">${ev.org || ""}</a>
            — ${ev.title || ""}${ev.type ? " · " + ev.type : ""}
            ${ev.year ? " · " + ev.year : ""} · إصدار ${ev.version || "—"}
            · مستوى الدليل: ${ev.evidenceLevel || "—"}
            · آخر تحقق ${ev.lastVerified || ev.reviewed || "—"}
          </div>
        </details>
        ${prods}
      </div>`;
    }).join("");

    MOUNT.innerHTML = `
      <div class="adv-card adv-results">
        <div class="adv-res-top">
          <span class="adv-badge">نتيجتك التثقيفية</span>
          <h3 class="adv-q">اقتراحات قد تناسب أهدافك</h3>
        </div>
        ${cards}
        <div class="adv-handoff">
          <p>القرار النهائي مع مختص. أرسل نتيجتك لصيدلينا ليؤكّد الأنسب والجرعة والتوفّر:</p>
          <a class="btn-pill" target="_blank" rel="noopener"
             href="${waConsult(recs)}" onclick="Advisor._clickWa()">
            <svg class="wa-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/></svg>
            استشر صيدلياً على واتساب
          </a>
          <button class="adv-restart" onclick="Advisor.restart()">ابدأ استشارة جديدة</button>
        </div>
        <p class="adv-note">${KB.meta.disclaimerAr}</p>
      </div>`;
  }

  function factsByPrefix(prefix) {
    return [...STATE.facts].filter((f) => f.startsWith(prefix)).map(factLabel);
  }

  // تقرير الاستشارة الكامل للصيدلي — كل ما سأله النظام وحالة الزبون
  function waConsult(recs) {
    const goals = activeGoals(STATE).map((g) => {
      const go = KB.goals.find((x) => x.id === g); return go ? go.name : g;
    });
    const demo = [];
    if (STATE.facts.has("demo:male")) demo.push("ذكر");
    if (STATE.facts.has("demo:female")) demo.push("أنثى");
    if (STATE.facts.has("demo:age_14_18")) demo.push("14–18 سنة");
    if (STATE.facts.has("demo:age_19_50")) demo.push("19–50 سنة");
    if (STATE.facts.has("demo:age_51_70")) demo.push("51–70 سنة");
    if (STATE.facts.has("demo:age_70_plus")) demo.push("فوق 70 سنة");
    const symptoms = factsByPrefix("symptom:");
    const lifestyle = factsByPrefix("lifestyle:");
    const flags = factsByPrefix("flag:");
    const reds = activeRedFlags(STATE).map((rf) => rf.label);
    const nutr = recs.map((r) => `${r.nutrient.name} (ملاءمة ${Math.round(r.confidence * 100)}%)`);

    const lines = [
      "*استشارة المستشار الصحي — صيدلية در الشارقة*",
      "───────────────",
      demo.length ? "الفئة: " + demo.join("، ") : "",
      goals.length ? "الأهداف: " + goals.join("، ") : "",
      symptoms.length ? "الأعراض المذكورة: " + symptoms.join("، ") : "",
      lifestyle.length ? "نمط الحياة: " + lifestyle.join("، ") : "",
      flags.length ? "⚠️ أعلام الأمان: " + flags.join("، ") : "أعلام الأمان: لا يوجد",
      reds.length ? "🚨 أعراض إنذارية: " + reds.join("، ") : "",
      reds.length ? "أوصى النظام بمراجعة الطبيب وعدم الاكتفاء بالمكملات." : "",
      "───────────────",
      nutr.length ? "اقتراحات النظام (تثقيفية): " + nutr.join("، ") : "",
      `عدد الأسئلة المُجابة: ${STATE.askedCount}`,
      "───────────────",
      reds.length
        ? "أرغب بنصيحتكم حول حالتي وما إذا كنت أحتاج مراجعة طبيب."
        : "أرغب بتأكيد الأنسب لحالتي والجرعة والتوفّر والسعر.",
    ].filter(Boolean);
    const num = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.whatsappNumber) || "9647710595805";
    return `https://wa.me/${num}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  /* ================= الركيزة 4: Learning Analytics (مجهول، بلا AI) ================= */
  const Analytics = {
    endpoint: "/.netlify/functions/log-consult",
    sid: null,
    _sid() {
      if (this.sid) return this.sid;
      // معرّف جلسة عشوائي غير مرتبط بأي هوية شخصية
      this.sid = "anon_" + Math.abs(hashStr(String(performance.now()) + navigator.userAgent)).toString(36);
      return this.sid;
    },
    event(type, payload) {
      const body = { sessionId: this._sid(), type, ...payload };
      // لا تُرسل أبداً: اسم/هاتف/مدينة/نص حر — payload من المحرك فقط
      try {
        if (navigator.sendBeacon)
          navigator.sendBeacon(this.endpoint, new Blob([JSON.stringify(body)], { type: "application/json" }));
        else
          fetch(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body), keepalive: true }).catch(() => {});
      } catch (e) { /* التحليلات لا تعطّل التجربة أبداً */ }
    },
  };
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return h; }

  /* ---------- التركيب في الصفحة ---------- */
  const Advisor = {
    mount(el) { MOUNT = typeof el === "string" ? document.getElementById(el) : el; if (MOUNT) start(); },
    restart() { start(); },
    _clickProduct(pid) { Analytics.event("advisor_product_click", { product: pid }); },
    _clickWa() { Analytics.event("advisor_to_whatsapp", {}); },
    _debug() { return { STATE, KB }; },
    // نواة المحرك مكشوفة للاختبارات الآلية فقط — لا تُستخدم من الواجهة
    _core: { newState, applyAnswer, nextQuestion, readyToRecommend, recompute, buildRecommendations,
             questionVisible, _setState(s) { STATE = s; } },
  };
  window.Advisor = Advisor;
})();
