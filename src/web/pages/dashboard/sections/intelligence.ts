// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/intelligence.ts — P4 RENDER LAYER
//
//  Renders the deterministic analytics DTOs: the objective-aware funnel, the
//  reconciled diagnosis, its confidence, and the guarded recommendation.
//
//  ── THE RULE THIS FILE EXISTS TO OBEY ─────────────────────────────────
//  There is NO analytics logic here. Not one threshold, not one ratio
//  computed from raw counts, not one decision about what is healthy. Every
//  number and every verdict arrives pre-computed on `dashData.funnel` and
//  `dashData.intelligence`; this file turns them into HTML.
//
//  Ratios ARE re-multiplied by 100 for display (0.059 → "5.9%") — that is
//  formatting, not calculation. The moment a conditional in here starts
//  deciding whether something is a problem, the boundary has been crossed
//  and the architecture test in test_analytics_architecture.ts fails.
//
//  Consumes: #intelligence-section.  Uses: escHtml (from lib/format).
// ════════════════════════════════════════════════════════════════════════

export const renderIntelligenceJs = `
  /** Arabic label per deterministic problem class. Presentation only. */
  var PROBLEM_LABELS = {
    DELIVERY:          { ar: 'مشكلة في الوصول',        cls: 'delivery' },
    CLICK:             { ar: 'مشكلة في التصميم',        cls: 'click' },
    POST_CLICK:        { ar: 'مشكلة بعد الضغط',         cls: 'postclick' },
    CONVERSION:        { ar: 'مشكلة في إتمام النتيجة',  cls: 'conversion' },
    EFFICIENCY:        { ar: 'ارتفاع التكلفة',          cls: 'efficiency' },
    NO_MATERIAL_BREAK: { ar: 'لا توجد مشكلة جوهرية',    cls: 'healthy' }
  };

  var CONFIDENCE_LABELS = {
    HIGH:              { ar: 'ثقة عالية',       cls: 'high' },
    MEDIUM:            { ar: 'ثقة متوسطة',      cls: 'medium' },
    LOW:               { ar: 'ثقة منخفضة',      cls: 'low' },
    INSUFFICIENT_DATA: { ar: 'بيانات غير كافية', cls: 'insufficient' }
  };

  var STAGE_LABELS = {
    impressions:        'مرات الظهور',
    reach:              'الوصول',
    link_clicks:        'النقرات على الرابط',
    conversations:      'المحادثات',
    landing_page_views: 'مشاهدات صفحة الهبوط',
    leads:              'العملاء المحتملون',
    purchases:          'المشتريات',
    interactions:       'التفاعلات',
    installs:           'التثبيتات'
  };

  function fmtCount(n) {
    return (n == null || !isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US');
  }
  /** Ratio → percentage string. FORMATTING, not calculation. */
  function fmtRatio(r) {
    return (r == null || !isFinite(Number(r))) ? '—' : (Number(r) * 100).toFixed(1) + '%';
  }

  /** Confidence chip — uncertainty is never hidden. */
  function confidenceChip(confidence) {
    var c = CONFIDENCE_LABELS[confidence] || CONFIDENCE_LABELS.INSUFFICIENT_DATA;
    return '<span class="conf-chip conf-' + c.cls + '">' + escHtml(c.ar) + '</span>';
  }

  /**
   * The funnel: one row per stage, with the ratio INTO it on the connector.
   * A gated stage renders its count but NOT a ratio — the engine withheld it.
   */
  function renderFunnel(funnel, degradedStage) {
    if (!funnel || !funnel.stages || !funnel.stages.current) return '';
    var stages = funnel.stages.current;
    var html = '<div class="funnel-viz" dir="rtl">';

    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var label = STAGE_LABELS[s.stageKey] || s.stageKey;
      var isBreak = degradedStage && s.stageKey === degradedStage;
      var count = (s.status === 'OK') ? s.count : (s.count != null ? s.count : null);

      if (i > 0) {
        var ratioText, ratioCls;
        if (s.status === 'OK' && s.ratioFromPrevious != null) {
          ratioText = fmtRatio(s.ratioFromPrevious);
          ratioCls = isBreak ? 'funnel-ratio broken' : 'funnel-ratio';
        } else {
          ratioText = 'بيانات غير كافية';
          ratioCls = 'funnel-ratio gated';
        }
        html += '<div class="funnel-connector">'
             +    '<span class="funnel-arrow">↓</span>'
             +    '<span class="' + ratioCls + '">' + escHtml(ratioText) + '</span>'
             +  '</div>';
      }

      html += '<div class="funnel-stage' + (isBreak ? ' is-break' : '') + '">'
           +    '<div class="funnel-stage-label">' + escHtml(label)
           +      (s.approximate ? ' <span class="approx-tag" title="قيمة تقريبية">تقريبي</span>' : '')
           +    '</div>'
           +    '<div class="funnel-stage-count">' + escHtml(fmtCount(count)) + '</div>'
           +  '</div>';
    }
    return html + '</div>';
  }

  /** The diagnosis card. Wording is a template; the verdict is deterministic. */
  function renderDiagnosisCard(intel, funnel) {
    var p = PROBLEM_LABELS[intel.problemClass] || PROBLEM_LABELS.NO_MATERIAL_BREAK;

    if (intel.problemClass === 'NO_MATERIAL_BREAK') {
      var quiet = intel.confidence === 'INSUFFICIENT_DATA'
        ? 'لا توجد بيانات كافية بعد لإصدار تشخيص. سنخبرك فور توفرها.'
        : 'كل نسب القمع مستقرة. لا يوجد ما يستدعي التدخل الآن.';
      return '<div class="diag-card healthy" dir="rtl">'
           +   '<div class="diag-head"><span class="diag-title">' + escHtml(p.ar) + '</span>'
           +     confidenceChip(intel.confidence) + '</div>'
           +   '<div class="diag-body">' + escHtml(quiet) + '</div>'
           + '</div>';
    }

    var evidenceHtml = '';
    if (intel.evidence && intel.evidence.length) {
      evidenceHtml = '<ul class="diag-evidence">'
        + intel.evidence.map(function (e) { return '<li>' + escHtml(e) + '</li>'; }).join('')
        + '</ul>';
    }

    var recHtml = '';
    if (intel.recommendation) {
      var r = intel.recommendation;
      recHtml = '<div class="diag-rec">'
        +   '<div class="diag-rec-label">الإجراء الموصى به</div>'
        +   '<div class="diag-rec-action">' + escHtml(r.action) + '</div>'
        +   '<div class="diag-rec-impact">المتوقع: ' + escHtml(r.expectedImpact) + '</div>'
        + '</div>';
    } else if (!intel.alert) {
      // A real break that is not unusual: say so rather than manufacture advice.
      recHtml = '<div class="diag-rec muted">'
        +   'الانخفاض حقيقي لكنه ضمن التقلب الطبيعي لهذا الحساب — لا إجراء عاجل.'
        + '</div>';
    }

    var approxWarn = (funnel && funnel.approximateInvolved)
      ? '<div class="diag-approx">هذا التشخيص يعتمد على مؤشر تقريبي — تعامل معه كإشارة لا كحقيقة.</div>'
      : '';

    return '<div class="diag-card ' + p.cls + (intel.alert ? ' is-alert' : '') + '" dir="rtl">'
      +   '<div class="diag-head">'
      +     '<span class="diag-title">' + escHtml(p.ar) + '</span>'
      +     confidenceChip(intel.confidence)
      +   '</div>'
      +   (intel.recommendation ? '<div class="diag-problem">' + escHtml(intel.recommendation.problem) + '</div>' : '')
      +   evidenceHtml
      +   approxWarn
      +   recHtml
      + '</div>';
  }

  /** Per-unit results — never a fabricated single total (P4.3). */
  function renderResultBreakdown(rb) {
    if (!rb || !rb.byUnit || !rb.byUnit.length) return '';
    var chips = rb.byUnit.map(function (u) {
      return '<span class="result-chip">'
        +   '<b>' + escHtml(fmtCount(u.count)) + '</b> ' + escHtml(u.labelAr)
        +   (u.approximate ? ' <span class="approx-tag">تقريبي</span>' : '')
        + '</span>';
    }).join('');
    var note = rb.mixed
      ? '<div class="result-mixed-note">هذا الحساب يشغّل أهدافاً مختلفة — النتائج معروضة منفصلة لأن جمعها لا معنى له.</div>'
      : '';
    return '<div class="result-breakdown" dir="rtl">'
      +   '<div class="result-breakdown-label">النتائج</div>'
      +   '<div class="result-chips">' + chips + '</div>'
      +   note
      + '</div>';
  }

  /** Objective-aware health: excluded facets are shown as excluded, not zero. */
  function renderObjectiveHealth(h) {
    if (!h) return '';
    if (h.score == null) {
      return '<div class="obj-health unknown" dir="rtl">'
        +   '<div class="obj-health-label">صحة الحساب</div>'
        +   '<div class="obj-health-value">غير متاح</div>'
        +   '<div class="obj-health-note">لم نتمكن من تحديد هدف الحساب — لا نُصدر تقييماً مُخمّناً.</div>'
        + '</div>';
    }
    var facets = (h.facets || []).map(function (f) {
      if (!f.applicable) {
        return '<li class="facet excluded"><span class="facet-key">' + escHtml(f.key) + '</span>'
          +    '<span class="facet-note">' + escHtml(f.evidence) + '</span></li>';
      }
      return '<li class="facet"><span class="facet-key">' + escHtml(f.key) + '</span>'
        +    '<span class="facet-score">' + escHtml(String(f.score)) + '</span>'
        +    '<span class="facet-note">' + escHtml(f.evidence) + '</span></li>';
    }).join('');
    return '<div class="obj-health ' + escHtml(h.band) + '" dir="rtl">'
      +   '<div class="obj-health-head">'
      +     '<span class="obj-health-label">صحة الحساب</span>'
      +     '<span class="obj-health-value">' + escHtml(String(h.score)) + '/100</span>'
      +     confidenceChip(h.confidence)
      +   '</div>'
      +   '<ul class="facet-list">' + facets + '</ul>'
      + '</div>';
  }

  /**
   * Section entry point. Pure projection of the DTO — when the intelligence
   * payload is absent (mixed-purpose or unresolved account) the section hides
   * itself rather than inventing a funnel.
   */
  function renderIntelligenceSection(dashData) {
    var host = document.getElementById('intelligence-section');
    if (!host) return;
    var intel = dashData && dashData.intelligence;
    var funnel = dashData && dashData.funnel;
    var rb = dashData && dashData.resultBreakdown;

    if (!intel && !rb) { host.style.display = 'none'; return; }
    host.style.display = 'block';

    var parts = [];
    if (rb) parts.push(renderResultBreakdown(rb));
    if (intel) {
      parts.push(renderDiagnosisCard(intel, funnel));
      if (funnel) {
        parts.push('<div class="funnel-wrap">'
          + '<div class="funnel-title">مسار العميل</div>'
          + renderFunnel(funnel, intel.problemClass === 'EFFICIENCY' ? null : funnel.degradedStage)
          + '</div>');
      }
      parts.push(renderObjectiveHealth(intel.health));
    }
    host.innerHTML = parts.join('');
  }
`;
