// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/commandCenter.ts — PHASE 3
//
//  THE PHONE HOME SCREEN. One decision surface, read top to bottom:
//
//      STATUS → MOST IMPORTANT CHANGE → MOST IMPORTANT PROBLEM
//             → WHY → ACTION → CAMPAIGNS NEEDING ATTENTION
//
//  ── WHAT THIS FILE IS NOT ─────────────────────────────────────────────
//  It is not a card grid, and it is not the desktop dashboard reflowed.
//  Everything the merchant needs to decide fits in the first viewport; the
//  full analytical dashboard stays one tap away behind a disclosure.
//
//  ── THE RULE THIS FILE EXISTS TO OBEY ─────────────────────────────────
//  Every number, every verdict and every piece of Arabic prose about the
//  account arrives DECIDED on the DTO. There is no analytics here:
//    · no CTR, CPC, CPM, ROAS, cost-per-result or delta is computed
//    · no ratio is derived from raw components
//    · no threshold decides what is healthy, broken or urgent
//  Multiplying a DTO ratio by 100 to print "5.9%" is FORMATTING and is the
//  only arithmetic in this file. See test_analytics_architecture.ts PART B.
//
//  ── THE THREE SEMANTIC RULES ──────────────────────────────────────────
//  1. RESULTS ARE NEVER SUMMED ACROSS UNITS. 84 conversations and 12 orders
//     are different quantities; 96 is not a number that exists. We render
//     resultBreakdown.displayAr and every byUnit row. `dominant` frames the
//     headline and NEVER stands in for the rest.
//  2. INSUFFICIENT_DATA is "still collecting" (لا تزال البيانات قيد التجميع),
//     never "no data" and never a failure. It is distinct from a real zero
//     and from NOT_APPLICABLE (a metric this objective does not have).
//  3. CONFIDENCE IS ALWAYS VISIBLE, including when it is low, and an
//     approximate figure always carries a visible تقريبي label.
//
//  ── FUNNEL ────────────────────────────────────────────────────────────
//  dashData.funnel is rendered as-is. We surface funnel.degradedStage —
//  which the engine defines as the EARLIEST materially broken link, not the
//  largest drop — and we never invent a stage or flatten an objective's
//  shape. INSUFFICIENT_DATA is reported, not diagnosed.
//
//  ── STYLE / TEMPLATE-LITERAL SAFETY ───────────────────────────────────
//  The exported JS below is a TypeScript template literal that emits browser
//  JavaScript. It therefore contains NO backtick and NO dollar-brace
//  sequence anywhere, including in comments. String building uses '+'.
//
//  Consumes: #command-center.  Uses: escHtml (global, from SHARED_JS).
// ════════════════════════════════════════════════════════════════════════

// ── CSS ───────────────────────────────────────────────────────────────
//  Emitted through the page's `extraHead`, i.e. BEFORE layout's
//  MOBILE_FLOORS_CSS, so the shared touch/text floors still win the cascade.
//  Every interactive element here is declared at 48px+ anyway, and the small
//  labels reuse .cc-meta / .cc-conf / .cc-unit-label, which the frozen floors
//  block already pins to 12px.
export const commandCenterStyles = `<style>
  /* ═══ COMMAND CENTER ═══
     Design tokens are the app's own (--surface / --text / --success / …).
     Nothing here invents a colour, because a hard-coded light value on this
     warm-dark ledger surface renders as grey-on-white. */
  #command-center { display: none; }
  #command-center.cc-on { display: block; }

  .cc {
    margin: 0 0 12px;
    display: flex; flex-direction: column; gap: 6px;
    min-width: 0;
  }
  .cc * { min-width: 0; }
  .cc-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 12px;
    overflow-wrap: anywhere;
  }

  /* Step header: what question this block answers, and how sure we are. */
  .cc-step {
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px; flex-wrap: wrap; margin-bottom: 5px;
  }
  .cc-step-name {
    font-size: 12px; font-weight: 700; letter-spacing: .02em;
    color: var(--text-3);
  }
  .cc-tagrow { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .cc-meta { font-size: 12px; color: var(--text-2); line-height: 1.55; }
  .cc-unit-label { font-size: 12px; color: var(--text-2); }

  /* — confidence, never hidden, including when it is low — */
  .cc-conf {
    display: inline-flex; align-items: center;
    padding: 2px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 700; white-space: nowrap;
    border: 1px solid transparent;
  }
  .cc-conf-high    { background: var(--success-dim);  color: var(--success); }
  .cc-conf-medium  { background: var(--warning-dim);  color: var(--warning); }
  .cc-conf-low     { background: var(--error-dim);    color: var(--error); }
  /* "still collecting" is neutral on purpose — it is not a failure state. */
  .cc-conf-collect { background: var(--surface-2); color: var(--text-2); border-color: var(--border-2); }
  .cc-sev          { background: var(--critical-dim); color: var(--error); }

  .cc-approx {
    display: inline-flex; align-items: center;
    margin-inline-start: 4px;
    padding: 1px 6px; border-radius: 999px;
    background: var(--warning-dim); color: var(--warning);
    font-size: 12px; font-weight: 700; white-space: nowrap;
  }

  /* — 1. STATUS — */
  .cc-status { border-width: 2px; }
  .cc-status.band-excellent, .cc-status.band-good { border-color: var(--success); }
  .cc-status.band-attention { border-color: var(--warning); }
  .cc-status.band-poor      { border-color: var(--error); }
  .cc-status.band-critical  { border-color: var(--critical); }
  .cc-status.band-none      { border-color: var(--border-2); }

  .cc-status-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .cc-band-word { font-family: var(--font-display); font-size: 20px; font-weight: 700; line-height: 1.2; }
  .band-excellent .cc-band-word, .band-good .cc-band-word { color: var(--success); }
  .band-attention .cc-band-word { color: var(--warning); }
  .band-poor .cc-band-word, .band-critical .cc-band-word { color: var(--error); }
  .band-none .cc-band-word { color: var(--text-2); }
  .cc-score { font-size: 14px; font-weight: 700; color: var(--text-2); }
  .cc-score-max { font-size: 12px; color: var(--text-3); }

  .cc-line {
    display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
    margin-top: 5px; padding-top: 5px;
    border-top: 1px solid var(--border);
  }
  .cc-line-value { font-size: 15px; font-weight: 800; color: var(--text); }
  .cc-delta { font-size: 12px; font-weight: 700; white-space: nowrap; }
  .cc-delta.good { color: var(--success); }
  .cc-delta.bad  { color: var(--error); }
  .cc-delta.flat { color: var(--text-3); }

  /* Per-unit results. There is deliberately no single cross-unit total. */
  .cc-units { display: flex; flex-wrap: wrap; gap: 5px; }
  .cc-unit {
    display: inline-flex; align-items: baseline; gap: 4px;
    padding: 3px 9px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .cc-unit b { font-size: 14px; font-weight: 800; color: var(--text); }

  /* — 2/3. CHANGE + PROBLEM — */
  .cc-headline { font-size: 14px; font-weight: 700; line-height: 1.45; color: var(--text); }
  .cc-sub { font-size: 13px; line-height: 1.55; color: var(--text-2); margin-top: 3px; }
  .cc-problem.sev-CRITICAL { border-color: var(--critical); }
  .cc-problem.sev-HIGH     { border-color: var(--warning); }

  /* — 4. WHY — the earliest broken link, then the engine's own evidence — */
  .cc-break {
    display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
    padding: 7px 9px; border-radius: var(--radius);
    background: var(--error-dim); border: 1px solid var(--border);
    font-size: 13px; color: var(--text);
  }
  .cc-break-label { font-size: 12px; font-weight: 700; color: var(--error); }
  .cc-break-arrow { color: var(--text-3); }
  .cc-break b { font-weight: 800; }
  .cc-why-list { margin: 6px 0 0; padding: 0; list-style: none; }
  .cc-why-list li {
    font-size: 12px; line-height: 1.55; color: var(--text-2);
    padding-inline-start: 11px; position: relative; margin-top: 3px;
  }
  .cc-why-list li::before {
    content: ""; position: absolute; inset-inline-start: 0; top: .6em;
    width: 4px; height: 4px; border-radius: 50%; background: var(--text-3);
  }

  /* — 5. ACTION — the one thing to do, sized for a thumb — */
  .cc-action { border-color: var(--accent); border-width: 2px; }
  .cc-action-text { font-size: 14px; font-weight: 700; line-height: 1.5; color: var(--text); }
  a.cc-action-btn.btn {
    display: flex; width: 100%; margin-top: 6px;
    min-height: 52px; padding: 12px 16px;
    border-radius: var(--radius-lg);
    font-size: 15px; font-weight: 800;
    white-space: normal; text-align: center;
  }

  /* — 6. CAMPAIGNS — */
  .cc-camp-list { display: flex; flex-direction: column; gap: 6px; }
  a.cc-camp {
    display: block; min-height: 48px;
    padding: 8px 10px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--surface-2);
    text-decoration: none; color: inherit;
  }
  .cc-camp-name { font-size: 13px; font-weight: 700; line-height: 1.4; color: var(--text); }
  .cc-camp-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
  .cc-band {
    display: inline-flex; align-items: center;
    padding: 2px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 700; white-space: nowrap;
  }
  .cc-band.band-excellent, .cc-band.band-good { background: var(--success-dim); color: var(--success); }
  .cc-band.band-attention { background: var(--warning-dim);  color: var(--warning); }
  .cc-band.band-poor      { background: var(--error-dim);    color: var(--error); }
  .cc-band.band-critical  { background: var(--critical-dim); color: var(--error); }
  .cc-band.band-none      { background: var(--surface-hover); color: var(--text-2); }
  .cc-camp-kpi {
    display: inline-flex; align-items: baseline; gap: 4px;
    padding: 2px 8px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .cc-camp-kpi b { font-size: 12px; font-weight: 800; color: var(--text); }

  /* — footer: freshness, the full dashboard, a refresh — */
  .cc-foot { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  button.cc-toggle, button.cc-refresh {
    flex: 1 1 130px;
    min-height: 48px; padding: 10px 12px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--surface-2); color: var(--text-2);
    font-family: var(--font-body);
    font-size: 13px; font-weight: 700;
    cursor: pointer;
  }

  /* ═══ PHONE: the command centre REPLACES the desktop dashboard ═══
     Collapsed is the default. The rules are scoped to :not(.cc-expanded)
     rather than toggling display on the sections themselves, so expanding
     simply stops matching and every section returns to whatever its own
     inline style / JS decided. A section JS kept hidden for lack of data
     therefore stays hidden after expanding. */
  @media (max-width: 768px) {
    /* Every pixel above the CTA pushes it towards the fixed bottom nav
       (63px tall), so phone chrome is tighter than desktop chrome. */
    .cc { gap: 5px; }
    .cc-block { padding: 7px 10px; }
    .cc-step { margin-bottom: 4px; }
    .cc-line { margin-top: 4px; padding-top: 4px; }
    .cc-band-word { font-size: 19px; }
    .cc-break { padding: 6px 8px; }
    .cc-why-list { margin-top: 4px; }
    .cc-why-list li { line-height: 1.45; }
    .cc-headline { line-height: 1.4; }
    .cc-action-text { line-height: 1.4; }
    .cc-sub { margin-top: 2px; }
    a.cc-action-btn.btn { min-height: 48px; padding: 10px 14px; }

    #dashboard-content:not(.cc-expanded) > .cmd-bar,
    #dashboard-content:not(.cc-expanded) > #morning-story,
    #dashboard-content:not(.cc-expanded) > #insight-strip,
    #dashboard-content:not(.cc-expanded) > #intelligence-section,
    #dashboard-content:not(.cc-expanded) > #exec-pulse-section,
    #dashboard-content:not(.cc-expanded) > #health-gauge-section,
    #dashboard-content:not(.cc-expanded) > #main-move-section,
    #dashboard-content:not(.cc-expanded) > #predictions-section,
    #dashboard-content:not(.cc-expanded) > #ai-recs-section,
    #dashboard-content:not(.cc-expanded) > #creative-health-strip,
    #dashboard-content:not(.cc-expanded) > #quick-actions-bar,
    #dashboard-content:not(.cc-expanded) > #live-insights-section,
    #dashboard-content:not(.cc-expanded) > #hero-grid,
    #dashboard-content:not(.cc-expanded) > #active-section,
    #dashboard-content:not(.cc-expanded) > .split-grid,
    #dashboard-content:not(.cc-expanded) > #timeline-section,
    #dashboard-content:not(.cc-expanded) > #weekly-report-section,
    #dashboard-content:not(.cc-expanded) > .v2-advanced { display: none !important; }
  }

  /* This is the PHONE home screen, and only that. Above the shared mobile
     breakpoint the desktop dashboard already answers these questions with
     room to spare, so the command centre stands down entirely rather than
     printing the same verdict a second time above it. Nothing changes for a
     desktop reader. */
  @media (min-width: 769px) {
    #command-center, #command-center.cc-on { display: none; }
  }
</style>`;

// ── RENDERER ──────────────────────────────────────────────────────────
export const renderCommandCenterJs = `
  // ── Vocabulary. Presentation only: every verdict arrives on the DTO. ──
  var CC_BAND_AR = {
    excellent: 'ممتاز',
    good:      'جيد',
    attention: 'يحتاج انتباه',
    poor:      'ضعيف',
    critical:  'حرج',
    none:      'غير متاح'
  };

  // INSUFFICIENT_DATA is "still collecting", never "no data" and never a
  // failure. It is a different state from a real zero and from NOT_APPLICABLE.
  var CC_STILL_COLLECTING = 'لا تزال البيانات قيد التجميع';

  var CC_CONF_AR = {
    HIGH:              { ar: 'ثقة عالية',        cls: 'cc-conf-high' },
    MEDIUM:            { ar: 'ثقة متوسطة',       cls: 'cc-conf-medium' },
    LOW:               { ar: 'ثقة منخفضة',       cls: 'cc-conf-low' },
    INSUFFICIENT_DATA: { ar: CC_STILL_COLLECTING, cls: 'cc-conf-collect' }
  };

  var CC_PROBLEM_AR = {
    DELIVERY:          'مشكلة في الوصول',
    CLICK:             'مشكلة في التصميم',
    POST_CLICK:        'مشكلة بعد الضغط',
    CONVERSION:        'مشكلة في إتمام النتيجة',
    EFFICIENCY:        'ارتفاع التكلفة',
    NO_MATERIAL_BREAK: 'لا توجد مشكلة جوهرية'
  };

  var CC_SEVERITY_AR = {
    CRITICAL: 'خطورة حرجة', HIGH: 'خطورة عالية',
    MEDIUM:   'خطورة متوسطة', LOW: 'خطورة منخفضة'
  };

  var CC_STAGE_AR = {
    impressions:        'مرات الظهور',
    reach:              'الوصول',
    link_clicks:        'النقرات على الرابط',
    landing_page_views: 'مشاهدات صفحة الهبوط',
    conversations:      'المحادثات',
    leads:              'العملاء المحتملون',
    purchases:          'المشتريات',
    interactions:       'التفاعلات',
    installs:           'التثبيتات'
  };

  // Bands the SERVER already judged as needing a human. Reading a
  // server-assigned band is not a threshold decision of our own.
  var CC_ATTENTION_BANDS = { attention: 1, poor: 1, critical: 1 };

  function ccEsc(s) { return escHtml(s == null ? '' : s); }

  function ccCount(n) {
    return (n == null || !isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US');
  }

  // A DTO ratio printed as a percentage. FORMATTING, not calculation.
  function ccRatioPct(r) {
    return (r == null || !isFinite(Number(r))) ? '—' : (Number(r) * 100).toFixed(1) + '%';
  }

  function ccBandWord(b) { return CC_BAND_AR[b] || CC_BAND_AR.none; }
  function ccBandClass(b) { return CC_BAND_AR[b] ? ('band-' + b) : 'band-none'; }

  // Confidence is rendered even when it is low, and even when the answer is
  // "we are still collecting". Never omitted, never softened away.
  function ccConf(confidence) {
    if (confidence == null) return '';           // not published — say nothing
    var c = CC_CONF_AR[confidence] || CC_CONF_AR.INSUFFICIENT_DATA;
    return '<span class="cc-conf ' + c.cls + '">' + ccEsc(c.ar) + '</span>';
  }

  function ccApprox(isApprox) {
    return isApprox ? '<span class="cc-approx">تقريبي</span>' : '';
  }

  function ccStepHead(name, right) {
    return '<div class="cc-step">'
      +   '<span class="cc-step-name">' + ccEsc(name) + '</span>'
      +   '<span class="cc-tagrow">' + (right || '') + '</span>'
      + '</div>';
  }

  function ccKpi(dashData, key) {
    var list = (dashData && dashData.kpis) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return list[i];
    return null;
  }

  // deltaPct arrives as a ratio (0.1 = 10%). Multiplying to print it is
  // formatting; the direction and the good/bad polarity both arrive decided.
  function ccDelta(k) {
    if (!k || k.deltaPct == null) return '';
    var up = k.direction === 'up';
    var goodWhenUp = k.goodWhenUp !== false;
    var cls = k.direction === 'flat' ? 'flat' : ((up === goodWhenUp) ? 'good' : 'bad');
    var arrow = k.direction === 'flat' ? '→' : (up ? '↑' : '↓');
    return '<span class="cc-delta ' + cls + '">' + arrow + ' '
      + Math.abs(Number(k.deltaPct) * 100).toFixed(1) + '%</span>';
  }

  // ══ 1. STATUS ════════════════════════════════════════════════════════
  //  Health · spend · primary results · cost per primary result. Nothing
  //  the objective does not care about gets a line here.
  function ccRenderStatus(dashData) {
    var objHealth = dashData.intelligence && dashData.intelligence.health;
    var src = objHealth || dashData.health || { score: null, band: 'none' };
    var score = src.score;
    var band = src.band || 'none';
    var confidence = src.confidence != null ? src.confidence : null;

    var scoreHtml = (score == null)
      ? '<span class="cc-score">' + ccEsc(CC_STILL_COLLECTING) + '</span>'
      : '<span class="cc-score">' + ccEsc(String(score)) + '<span class="cc-score-max">/100</span></span>';

    var lines = '';

    // — spend —
    var spend = ccKpi(dashData, 'spend');
    if (spend) {
      lines += '<div class="cc-line">'
        +   '<span class="cc-unit-label">المبلغ المنفق</span>'
        +   '<span class="cc-line-value">' + ccEsc(String(spend.display || '—')) + '</span>'
        +   ccDelta(spend)
        + '</div>';
    }

    lines += ccResultsLine(dashData);
    lines += ccCostLine(dashData);
    lines += ccStatusNote(dashData);

    return '<div class="cc-block cc-status ' + ccBandClass(band) + '">'
      +   ccStepHead('الوضع الآن', ccConf(confidence))
      +   '<div class="cc-status-head">'
      +     '<span class="cc-band-word">' + ccEsc(ccBandWord(band)) + '</span>' + scoreHtml
      +   '</div>'
      +   lines
      + '</div>';
  }

  /**
   * Primary results — one row PER UNIT, never a cross-unit total.
   *
   * resultBreakdown deliberately exposes no such total and we do not invent
   * one: 84 conversations plus 12 orders is not 96 of anything. byUnit is
   * always rendered; dominant only frames the sentence beneath it.
   */
  function ccResultsLine(dashData) {
    var rb = dashData.resultBreakdown;
    if (!rb || !rb.byUnit || !rb.byUnit.length) {
      return '<div class="cc-line">'
        +   '<span class="cc-unit-label">النتائج</span>'
        +   '<span class="cc-meta">' + ccEsc(CC_STILL_COLLECTING) + ' — لم تُحسم وحدة النتيجة بعد.</span>'
        + '</div>';
    }

    var units = rb.byUnit.map(function (u) {
      return '<span class="cc-unit">'
        +   '<b>' + ccEsc(ccCount(u.count)) + '</b>'
        +   '<span class="cc-unit-label">' + ccEsc(u.labelAr) + '</span>'
        +   ccApprox(u.approximate)
        + '</span>';
    }).join('');

    return '<div class="cc-line">'
      +   '<span class="cc-unit-label">النتائج' + ccApprox(rb.approximate) + '</span>'
      +   '<span class="cc-units">' + units + '</span>'
      + '</div>';
  }

  /**
   * One footnote that carries the three things the numbers above cannot say
   * on their own: which result owns the spend (dominant — FRAMING ONLY), that
   * a mixed account's results are never summed, and that no account-level
   * cost-per-result exists for it. Kept to a single line so the ACTION button
   * still clears the phone's fixed bottom navigation.
   */
  function ccStatusNote(dashData) {
    var rb = dashData.resultBreakdown;
    if (!rb) return '';
    var bits = [];
    // dominant only frames a headline when there is more than one unit to
    // frame; on a single-unit account it is trivially 100% and pure noise.
    if (rb.mixed && rb.dominant && rb.dominant.spendShare != null) {
      bits.push('الأغلب ' + ccEsc(ccUnitLabel(rb, rb.dominant.unit))
        + ' (' + ccEsc(ccRatioPct(rb.dominant.spendShare)) + ' من الإنفاق)');
    }
    if (rb.mixed) {
      bits.push('وحدات مختلطة: لا تُجمع النتائج ولا تُحسب تكلفة نتيجة للحساب — التفصيل بكل حملة');
    } else if (!dashData.objectiveKpis) {
      // Single-purpose account, but the server published no objectiveKpis, so
      // there is no cost per result to show. Say that rather than divide.
      bits.push('تكلفة النتيجة غير منشورة لهذا الحساب — التفصيل بكل حملة');
    }
    return bits.length ? '<div class="cc-meta" style="margin-top:5px;">' + bits.join(' · ') + '</div>' : '';
  }

  function ccUnitLabel(rb, unit) {
    var list = (rb && rb.byUnit) || [];
    for (var i = 0; i < list.length; i++) if (list[i].unit === unit) return list[i].labelAr;
    return unit;
  }

  /**
   * Cost per primary result.
   *
   * The analytics layer publishes it on objectiveKpis for an account with ONE
   * resolved purpose. A mixed account has no such figure, and we refuse to
   * manufacture one by dividing spend by a cross-unit sum. See dtoGaps.
   */
  function ccCostLine(dashData) {
    var ok = dashData.objectiveKpis;
    if (ok && ok.cards && ok.cards.length) {
      var headline = ok.cards.filter(function (c) { return c.priority === 1; }).slice(0, 3);
      if (headline.length) {
        var chips = headline.map(function (c) {
          return '<span class="cc-unit">'
            +   '<span class="cc-unit-label">' + ccEsc(c.labelAr) + '</span>'
            +   '<b>' + ccEsc(String(c.display || '—')) + '</b>'
            +   ccApprox(c.approximate)
            + '</span>';
        }).join('');
        return '<div class="cc-line">'
          +   '<span class="cc-unit-label">مؤشرات هدفك</span>'
          +   '<span class="cc-units">' + chips + '</span>'
          + '</div>';
      }
    }
    // A mixed account has no account-level cost per result. Rather than spend
    // a row saying so, ccStatusNote carries the refusal in one line.
    return '';
  }

  // ══ 2. MOST IMPORTANT CHANGE ═════════════════════════════════════════
  //  The objective's PRIMARY RESULT facet — the analytics layer named it and
  //  weighted it (40 of 100). We do not rank metrics ourselves.
  function ccRenderChange(dashData) {
    var intel = dashData.intelligence;
    var health = intel && intel.health;
    var facet = null;
    if (health && health.facets) {
      for (var i = 0; i < health.facets.length; i++) {
        if (health.facets[i].key === 'primaryResult') { facet = health.facets[i]; break; }
      }
    }

    var tags = '';
    if (intel && intel.anomaly && intel.anomaly.significant) {
      tags = '<span class="cc-conf cc-sev">تغيّر غير معتاد</span>' + ccConf(intel.anomaly.confidence);
    }

    var body;
    if (facet && facet.applicable && facet.evidence) {
      body = '<div class="cc-headline">النتيجة الأساسية — ' + ccEsc(facet.evidence) + '</div>';
    } else if (facet && !facet.applicable) {
      // NOT_APPLICABLE: a metric this objective does not have. Not a zero.
      body = '<div class="cc-headline">' + ccEsc(facet.evidence || 'لا ينطبق هذا المؤشر على هدف الحساب.') + '</div>';
    } else if (dashData.morningStory && dashData.morningStory.text) {
      body = '<div class="cc-headline">' + ccEsc(dashData.morningStory.text) + '</div>';
    } else {
      body = '<div class="cc-headline">' + ccEsc(CC_STILL_COLLECTING) + ' — لا يوجد تغيّر مؤكَّد بعد.</div>';
    }

    return '<div class="cc-block">' + ccStepHead('أهم تغيّر', tags) + body + '</div>';
  }

  // ══ 3. MOST IMPORTANT PROBLEM ════════════════════════════════════════
  //  One reconciled problem class, decided by the engine named in decidedBy.
  function ccRenderProblem(dashData) {
    var intel = dashData.intelligence;

    if (!intel) {
      // No single funnel shape (mixed purposes) or an unresolved objective —
      // the server withheld the diagnosis, so we report that, not a guess.
      var issue = (dashData.issues && dashData.issues[0]) || null;
      var body = issue
        ? '<div class="cc-headline">' + ccEsc(issue.title) + '</div>'
        : '<div class="cc-headline">لم يصدر تشخيص موحّد لهذا الحساب.</div>'
          + '<div class="cc-sub">لا يوجد مسار واحد يمكن تشخيصه — راجع كل حملة على حدة.</div>';
      return '<div class="cc-block">' + ccStepHead('أهم مشكلة', '') + body + '</div>';
    }

    var title = CC_PROBLEM_AR[intel.problemClass] || intel.problemClass;
    var rec = intel.recommendation;
    var tags = ccConf(intel.confidence);
    if (rec && CC_SEVERITY_AR[rec.severity]) {
      tags = '<span class="cc-conf cc-sev">' + ccEsc(CC_SEVERITY_AR[rec.severity]) + '</span>' + tags;
    }

    if (intel.problemClass === 'NO_MATERIAL_BREAK') {
      var quiet = intel.confidence === 'INSUFFICIENT_DATA'
        ? CC_STILL_COLLECTING + ' — لم نُصدر تشخيصاً بعد، وسنخبرك فور اكتماله.'
        : 'كل نسب المسار مستقرة. لا يوجد ما يستدعي التدخل الآن.';
      return '<div class="cc-block">'
        +   ccStepHead('أهم مشكلة', tags)
        +   '<div class="cc-headline">' + ccEsc(title) + '</div>'
        +   '<div class="cc-sub">' + ccEsc(quiet) + '</div>'
        + '</div>';
    }

    return '<div class="cc-block cc-problem sev-' + ccEsc(String((rec && rec.severity) || '')) + '">'
      +   ccStepHead('أهم مشكلة', tags)
      +   '<div class="cc-headline">' + ccEsc(title) + '</div>'
      +   (rec ? '<div class="cc-sub">' + ccEsc(rec.problem) + '</div>' : '')
      + '</div>';
  }

  // ══ 4. WHY ═══════════════════════════════════════════════════════════
  //  The EARLIEST broken link (funnel.degradedStage — the engine's own
  //  definition, not the largest drop), then its deterministic evidence.
  function ccRenderWhy(dashData) {
    var intel = dashData.intelligence;
    var funnel = dashData.funnel;

    var tags = '';
    if (funnel && funnel.approximateInvolved) tags += ccApprox(true);
    if (funnel && funnel.confidence) tags += ccConf(funnel.confidence);

    var evidence = (intel && intel.evidence) || [];
    var evidenceHtml = evidence.length
      ? '<ul class="cc-why-list">'
        + evidence.slice(0, 1).map(function (e) { return '<li>' + ccEsc(e) + '</li>'; }).join('')
        + '</ul>'
      : '';

    var approxWarn = (funnel && funnel.approximateInvolved)
      ? '<div class="cc-meta" style="margin-top:4px;">تشخيص مبني على مؤشر تقريبي — إشارة لا حقيقة.</div>'
      : '';

    return '<div class="cc-block">'
      +   ccStepHead('لماذا؟', tags)
      +   ccRenderFunnelBreak(funnel, dashData)
      +   evidenceHtml
      +   approxWarn
      + '</div>';
  }

  function ccRenderFunnelBreak(funnel, dashData) {
    if (!funnel) {
      var rb = dashData.resultBreakdown;
      var why = (rb && rb.mixed)
        ? 'الحساب يجمع أهدافاً مختلفة، فلا يوجد شكل مسار واحد يمكن تشخيصه.'
        : 'مسار العميل غير متاح لهذا الحساب.';
      return '<div class="cc-meta">' + ccEsc(why) + '</div>';
    }

    // The DTO says it is still collecting: report that, do not diagnose.
    if (funnel.status === 'INSUFFICIENT_DATA') {
      return '<div class="cc-meta">المسار: ' + ccEsc(CC_STILL_COLLECTING)
        + ' — لا نُصدر تشخيصاً للمسار قبل اكتمالها.</div>';
    }
    if (funnel.status === 'NO_MATERIAL_BREAK') {
      return '<div class="cc-meta">المسار: لا توجد حلقة مكسورة في هذه الفترة.</div>';
    }

    var stages = (funnel.stages && funnel.stages.current) || [];
    var idx = -1;
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].stageKey === funnel.degradedStage) { idx = i; break; }
    }
    if (idx <= 0) return '';   // no stage pair to show; the evidence stands alone

    var prev = stages[idx - 1];
    var cur = stages[idx];
    var ratioTxt = (cur.status === 'OK' && cur.ratioFromPrevious != null)
      ? ccRatioPct(cur.ratioFromPrevious)
      : CC_STILL_COLLECTING;

    return '<div class="cc-break">'
      +   '<span class="cc-break-label">أول حلقة تنكسر</span>'
      +   '<span>' + ccEsc(CC_STAGE_AR[prev.stageKey] || prev.stageKey)
      +     ' <b>' + ccEsc(ccCount(prev.count)) + '</b>' + ccApprox(prev.approximate) + '</span>'
      +   '<span class="cc-break-arrow">←</span>'
      +   '<span><b>' + ccEsc(ratioTxt) + '</b></span>'
      +   '<span class="cc-break-arrow">←</span>'
      +   '<span>' + ccEsc(CC_STAGE_AR[cur.stageKey] || cur.stageKey)
      +     ' <b>' + ccEsc(ccCount(cur.count)) + '</b>' + ccApprox(cur.approximate) + '</span>'
      + '</div>';
  }

  // ══ 5. ACTION ════════════════════════════════════════════════════════
  //  One action, one button, deliberately placed within thumb reach.
  function ccRenderAction(dashData) {
    var intel = dashData.intelligence;
    var rec = intel && intel.recommendation;
    var pa = dashData.priorityAction;

    var text = null, impact = null, tags = '';
    if (rec) {
      text = rec.action;
      impact = rec.expectedImpact;
      tags = ccConf(rec.confidence);
    } else if (pa) {
      text = pa.text;
      impact = pa.expectation || null;
    }

    if (!text) {
      return '<div class="cc-block cc-action">'
        +   ccStepHead('ما الذي تفعله الآن', tags)
        +   '<div class="cc-action-text">لا يوجد إجراء عاجل الآن.</div>'
        +   '<a class="btn btn-secondary cc-action-btn" href="/campaigns">راجع الحملات</a>'
        + '</div>';
    }

    var cost = (pa && pa.costDisplay)
      ? '<div class="cc-meta" style="margin-top:4px;">كلفة استمرار الوضع: ' + ccEsc(String(pa.costDisplay)) + ' أسبوعياً</div>'
      : '';

    return '<div class="cc-block cc-action">'
      +   ccStepHead('ما الذي تفعله الآن', tags)
      +   '<div class="cc-action-text">' + ccEsc(text) + '</div>'
      +   '<a class="btn btn-primary cc-action-btn" href="/recommendations">افتح خطة التنفيذ</a>'
      +   (impact ? '<div class="cc-meta" style="margin-top:6px;">المتوقع: ' + ccEsc(impact) + '</div>' : '')
      +   cost
      + '</div>';
  }

  // ══ 6. CAMPAIGNS NEEDING ATTENTION ═══════════════════════════════════
  //  Selected by the SERVER-ASSIGNED band, shown with the KPIs that this
  //  campaign's own objective cares about — nothing else.
  function ccRenderCampaigns(dashData) {
    var all = Array.isArray(dashData.campaigns) ? dashData.campaigns : [];
    var need = all.filter(function (c) { return c && CC_ATTENTION_BANDS[c.band]; }).slice(0, 3);

    var rows = '', note = '';
    if (need.length) {
      rows = need.map(ccCampaignRow).join('');
      note = need.length + ' حملة تحتاج انتباهك';
    } else if (dashData.worstCampaign) {
      rows = ccCampaignRow(dashData.worstCampaign);
      note = 'أضعف حملة في الحساب';
    } else {
      return '';
    }

    return '<div class="cc-block">'
      +   ccStepHead('حملات تحتاج انتباهك', '<span class="cc-meta">' + ccEsc(note) + '</span>')
      +   '<div class="cc-camp-list">' + rows + '</div>'
      + '</div>';
  }

  function ccCampaignRow(c) {
    var tags = '<span class="cc-band ' + ccBandClass(c.band) + '">'
      + ccEsc(ccBandWord(c.band))
      + (c.health != null ? ' · ' + ccEsc(String(c.health)) : '')
      + '</span>';

    if (c.purposeLabelAr) {
      tags += '<span class="cc-camp-kpi"><span class="cc-unit-label">' + ccEsc(c.purposeLabelAr) + '</span></span>';
    }

    // The objective's own headline KPIs, chosen server-side. A metric this
    // objective does not care about is simply not in the list.
    var cards = (c.objectiveKpis && c.objectiveKpis.cards) || [];
    cards.filter(function (k) { return k.priority === 1; }).slice(0, 2).forEach(function (k) {
      tags += '<span class="cc-camp-kpi">'
        +   '<span class="cc-unit-label">' + ccEsc(k.labelAr) + '</span>'
        +   '<b>' + ccEsc(String(k.display || '—')) + '</b>'
        +   ccApprox(k.approximate)
        + '</span>';
    });

    return '<a class="cc-camp" href="/campaigns">'
      +   '<div class="cc-camp-name">' + ccEsc(c.name) + '</div>'
      +   '<div class="cc-camp-tags">' + tags + '</div>'
      + '</a>';
  }

  // ══ FOOTER: freshness, and the full dashboard one TAP away (never hover)
  function ccRenderFoot(dashData) {
    var sync = (dashData.workspace && dashData.workspace.lastSyncedAt) || null;
    var fresh = sync
      ? '<div class="cc-meta" style="flex-basis:100%;">آخر تحديث: ' + ccEsc(ccWhen(sync)) + '</div>'
      : '';
    return '<div class="cc-foot">'
      +   '<button type="button" class="cc-toggle" id="cc-toggle" aria-expanded="false">عرض لوحة التفاصيل الكاملة</button>'
      +   '<button type="button" class="cc-refresh" id="cc-refresh">تحديث البيانات</button>'
      +   fresh
      + '</div>';
  }

  function ccWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('ar-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function ccBindFoot() {
    var host = document.getElementById('dashboard-content');
    var toggle = document.getElementById('cc-toggle');
    if (toggle && host) {
      // A re-render replaces the button, so re-read the disclosure state from
      // the host rather than assuming the freshly printed "collapsed" label.
      var wasOpen = host.classList.contains('cc-expanded');
      toggle.setAttribute('aria-expanded', wasOpen ? 'true' : 'false');
      if (wasOpen) toggle.textContent = 'إخفاء التفاصيل الكاملة';
    }
    if (toggle && host && !toggle.dataset.ccBound) {
      toggle.dataset.ccBound = '1';
      toggle.addEventListener('click', function () {
        var open = host.classList.toggle('cc-expanded');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.textContent = open ? 'إخفاء التفاصيل الكاملة' : 'عرض لوحة التفاصيل الكاملة';
      });
    }
    var refresh = document.getElementById('cc-refresh');
    if (refresh && !refresh.dataset.ccBound) {
      refresh.dataset.ccBound = '1';
      refresh.addEventListener('click', function () {
        var real = document.getElementById('cmd-refresh-btn');
        if (real) real.click(); else location.reload();
      });
    }
  }

  /**
   * Section entry point.
   *
   * Pure projection of the deterministic DTO, in decision order:
   *   STATUS -> CHANGE -> PROBLEM -> WHY -> ACTION -> CAMPAIGNS
   */
  function renderCommandCenter(dashData) {
    var host = document.getElementById('command-center');
    if (!host) return;
    if (!dashData || dashData.empty) { host.className = ''; host.innerHTML = ''; return; }

    host.className = 'cc-on';
    host.innerHTML = '<div class="cc" dir="rtl">'
      + ccRenderStatus(dashData)
      + ccRenderChange(dashData)
      + ccRenderProblem(dashData)
      + ccRenderWhy(dashData)
      + ccRenderAction(dashData)
      + ccRenderCampaigns(dashData)
      + ccRenderFoot(dashData)
      + '</div>';
    ccBindFoot();
  }
`;
