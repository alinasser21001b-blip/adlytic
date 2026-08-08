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

  /**
   * INSUFFICIENT_DATA reads as STILL COLLECTING, never as "no data".
   * The analytics layer distinguishes "we have not gathered enough yet" from
   * "there is nothing here", and the merchant must read the same distinction:
   * one means wait, the other means act.
   */
  var CONFIDENCE_LABELS = {
    HIGH:              { ar: 'ثقة عالية',   cls: 'high',   hint: '' },
    MEDIUM:            { ar: 'ثقة متوسطة',  cls: 'medium', hint: '' },
    LOW:               { ar: 'ثقة منخفضة',  cls: 'low',    hint: '' },
    INSUFFICIENT_DATA: { ar: 'قيد التجميع', cls: 'insufficient',
                         hint: 'لا تزال البيانات قيد التجميع — لم نصل بعد إلى حجم يسمح بالحكم' }
  };

  /** Arabic for the health facets. Presentation only — the keys stay canonical. */
  var FACET_LABELS = {
    primaryResult: 'النتيجة الأساسية',
    funnelHealth:  'سلامة مسار العميل',
    efficiency:    'كفاءة التكلفة',
    delivery:      'الوصول والتفاعل'
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

  /**
   * Per-stage measurement confidence, in the merchant's words.
   *
   * A LABEL MAP, not a judgement: the value arrives on the stage and this only
   * translates it. "estimated" is Meta's own word for reach — it is modelled
   * from a sample, not counted — and saying so is the difference between a
   * number the merchant can act on and one they should not over-read.
   */
  var STAGE_CONF_LABELS = {
    estimated: 'تقديري',
    modeled:   'تقديري',
    partial:   'جزئي'
  };

  /**
   * Default note when the health score is withheld.
   *
   * A named constant rather than an inline fallback, because this file builds
   * markup by concatenating '+'-prefixed lines: a multi-line nullish-fallback
   * inside a call argument picks up the leading '+' of its continuation line
   * and emits escHtml(a + || b), which is a syntax error that takes the whole
   * 160KB bundle down. That is exactly what happened here, and the mobile gate
   * caught it as "JS error — Unexpected token". Keep such expressions on one
   * line, or hoist them to a constant, in this file.
   */
  var WITHHELD_SCORE_NOTE_AR =
    'لا نُصدر تقييماً قبل أن تكفي البيانات — لا يعني هذا أن حسابك سيّئ، بل أننا لم نقس بعد.';

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
    var title = c.hint ? ' title="' + escHtml(c.hint) + '"' : '';
    return '<span class="conf-chip conf-' + c.cls + '"' + title + '>' + escHtml(c.ar) + '</span>';
  }

  /**
   * A section-level state row: a badge naming the state, plus one line saying
   * what it means for the merchant. Used for 'collecting' — the render of the
   * engine's own INSUFFICIENT_DATA. It is not a stand-in for zero (a real 0 is
   * rendered as the number 0) and not a stand-in for an excluded facet (which
   * carries its own "مستثنى" flag instead).
   */
  function stateRow(cls, label, note) {
    return '<div class="dstate-row dstate-' + cls + '" dir="rtl">'
      +   '<span class="dstate-badge">' + escHtml(label) + '</span>'
      +   (note ? '<span class="dstate-note">' + escHtml(note) + '</span>' : '')
      + '</div>';
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
      // The COUNT always travels, even when the RATIO is gated. A real zero
      // renders as 0; only a genuinely absent count renders as —.
      var count = s.count;

      if (i > 0) {
        var ratioText, ratioCls, ratioHint;
        if (s.status === 'OK' && s.ratioFromPrevious != null) {
          ratioText = fmtRatio(s.ratioFromPrevious);
          ratioCls = isBreak ? 'funnel-ratio broken' : 'funnel-ratio';
          ratioHint = '';
        } else if (s.reason === 'INSUFFICIENT_DATA') {
          // Still collecting — the sample floor has not been reached yet.
          ratioText = 'قيد التجميع';
          ratioCls = 'funnel-ratio collecting';
          ratioHint = 'لا تزال البيانات قيد التجميع لهذه الخطوة — النسبة تُنشر عند اكتمال العيّنة';
        } else {
          // Reported UNKNOWN: a different state, and it must not read as a
          // sample problem we are waiting out.
          ratioText = 'غير متاحة';
          ratioCls = 'funnel-ratio gated';
          ratioHint = 'النسبة غير متاحة لهذه الخطوة';
        }
        html += '<div class="funnel-connector">'
             +    '<span class="funnel-arrow">↓</span>'
             +    '<span class="' + ratioCls + '"'
             +      (ratioHint ? ' title="' + escHtml(ratioHint) + '"' : '') + '>'
             +      escHtml(ratioText)
             +    '</span>'
             +  '</div>';
      }

      // Per-stage measurement confidence. The DTO has carried this all along
      // and the renderer dropped it: Meta REPORTS reach as an estimate, and a
      // merchant reading 4,100 next to an exactly-counted 620 link clicks had
      // no way to know one is measured and the other modelled.
      //
      // Only a non-exact stage is labelled — tagging every row "exact" is
      // noise that trains people to ignore the tag that matters.
      var confTag = '';
      if (s.confidence && s.confidence !== 'exact') {
        confTag = ' <span class="funnel-stage-conf" title="'
                + escHtml('تقدير من المنصّة وليس عدّاً مباشراً')
                + '">' + escHtml(STAGE_CONF_LABELS[s.confidence] || s.confidence) + '</span>';
      }

      html += '<div class="funnel-stage' + (isBreak ? ' is-break' : '') + '"'
           +    (isBreak ? ' aria-label="' + escHtml('أول خطوة تنكسر: ' + label) + '"' : '')
           +    '>'
           +    '<div class="funnel-stage-label">' + escHtml(label)
           +      (s.approximate ? ' <span class="approx-tag" title="قيمة تقريبية">تقريبي</span>' : '')
           +      confTag
           +    '</div>'
           +    '<div class="funnel-stage-count">' + escHtml(fmtCount(count)) + '</div>'
           +    (isBreak ? '<div class="funnel-break-flag">أول خطوة تنكسر</div>' : '')
           +  '</div>';
    }
    return html + '</div>';
  }

  /**
   * The recommendation block, on its own so a caller can place it apart from
   * the diagnosis. Still pure projection: the action, its expected impact and
   * the "no urgent action" case all arrive decided.
   */
  function renderRecommendationBlock(intel) {
    if (intel && intel.recommendation) {
      var r = intel.recommendation;
      return '<div class="diag-rec">'
        +   '<div class="diag-rec-label">الإجراء الموصى به</div>'
        +   '<div class="diag-rec-action">' + escHtml(r.action) + '</div>'
        +   '<div class="diag-rec-impact">المتوقع: ' + escHtml(r.expectedImpact) + '</div>'
        + '</div>';
    }
    if (intel && !intel.alert) {
      // A real break that is not unusual: say so rather than manufacture advice.
      return '<div class="diag-rec muted">'
        +   'الانخفاض حقيقي لكنه ضمن التقلب الطبيعي لهذا الحساب — لا إجراء عاجل.'
        + '</div>';
    }
    return '';
  }

  /**
   * The diagnosis card. Wording is a template; the verdict is deterministic.
   *
   * opts.withRecommendation === false leaves the recommendation out, for
   * callers that render it as its own step further down the page.
   */
  function renderDiagnosisCard(intel, funnel, opts) {
    var withRec = !(opts && opts.withRecommendation === false);
    var p = PROBLEM_LABELS[intel.problemClass] || PROBLEM_LABELS.NO_MATERIAL_BREAK;

    if (intel.problemClass === 'NO_MATERIAL_BREAK') {
      // Two different quiet states, and they must not read alike:
      //   INSUFFICIENT_DATA → we have not measured enough YET (wait)
      //   otherwise         → we measured, and nothing is broken (relax)
      var collecting = intel.confidence === 'INSUFFICIENT_DATA';
      var quiet = collecting
        ? 'لا تزال البيانات قيد التجميع — لم نُصدر تشخيصاً بعد. سنخبرك فور اكتمالها.'
        : 'كل نسب القمع مستقرة. لا يوجد ما يستدعي التدخل الآن.';
      return '<div class="diag-card ' + (collecting ? 'collecting' : 'healthy') + '" dir="rtl">'
           +   '<div class="diag-head"><span class="diag-title">'
           +     escHtml(collecting ? 'لا يزال التشخيص قيد التجميع' : p.ar) + '</span>'
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

    var recHtml = withRec ? renderRecommendationBlock(intel) : '';

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

  /**
   * Objective-aware health: excluded facets are shown as excluded, not zero.
   *
   * labelAr / unknownNoteAr exist only so the same renderer can title the
   * score for an account or for a single campaign. The SCORE, its band, its
   * confidence and every facet still arrive pre-computed — nothing here decides
   * what is healthy.
   */
  function renderObjectiveHealth(h, labelAr, unknownNoteAr) {
    if (!h) return '';
    var healthLabel = labelAr || 'صحة الحساب';
    // A withheld score is NOT a zero and NOT a bad score. The engine publishes
    // score:null with confidence INSUFFICIENT_DATA when it refuses to judge,
    // so that is exactly what is shown — no number, no band colour, no verdict.
    if (h.score == null) {
      // The confidence chip already carries the state word; repeating it in a
      // badge underneath just makes the same sentence twice.
      return '<div class="obj-health unknown" dir="rtl">'
        +   '<div class="obj-health-head">'
        +     '<span class="obj-health-label">' + escHtml(healthLabel) + '</span>'
        +     confidenceChip(h.confidence)
        +   '</div>'
        // The caller may know WHY the score is withheld (the campaign
        // inspector does: it passes the unresolved-objective wording). The
        // dashboard does not — score:null covers both "objective unresolved"
        // and "sample too thin", and the DTO carries no discriminator, so the
        // default must be a sentence that is true in BOTH cases. The previous
        // default asserted the objective was unresolved and was simply wrong
        // half the time.
        +   '<div class="obj-health-note">'
        +     escHtml(unknownNoteAr || WITHHELD_SCORE_NOTE_AR)
        +   '</div>'
        + '</div>';
    }
    var facets = (h.facets || []).map(function (f) {
      var name = FACET_LABELS[f.key] || f.key;
      if (!f.applicable) {
        // Excluded from the score. Rendered WITHOUT a number so it can never
        // be misread as a zero, and labelled "excluded" rather than "not
        // applicable" because applicable:false covers BOTH "this metric does
        // not apply to this objective" and "there is no baseline to compare
        // against" — the DTO carries no discriminator, so the engine's own
        // evidence line is left to say which one it is.
        return '<li class="facet excluded">'
          +    '<span class="facet-key">' + escHtml(name) + '</span>'
          +    '<span class="facet-flag">مستثنى</span>'
          +    '<span class="facet-note">' + escHtml(f.evidence) + '</span></li>';
      }
      return '<li class="facet"><span class="facet-key">' + escHtml(name) + '</span>'
        +    '<span class="facet-score">' + escHtml(String(f.score)) + '</span>'
        +    '<span class="facet-note">' + escHtml(f.evidence) + '</span></li>';
    }).join('');
    return '<div class="obj-health ' + escHtml(h.band) + '" dir="rtl">'
      +   '<div class="obj-health-head">'
      +     '<span class="obj-health-label">' + escHtml(healthLabel) + '</span>'
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
        // The funnel's OWN status is reported, not re-derived. A funnel the
        // engine refused to judge says so above the stages, and the stage
        // counts stay visible underneath — they are real, only the verdict
        // is withheld.
        var funnelState = funnel.status === 'INSUFFICIENT_DATA'
          ? stateRow('collecting', 'قيد التجميع',
              'الأرقام أدناه حقيقية، لكن العيّنة لم تكفِ بعد للحكم على المسار.')
          : '';
        parts.push('<div class="funnel-wrap">'
          + '<div class="funnel-title">مسار العميل</div>'
          + funnelState
          + renderFunnel(funnel, intel.problemClass === 'EFFICIENCY' ? null : funnel.degradedStage)
          + '</div>');
      }
      parts.push(renderObjectiveHealth(intel.health));
    }
    host.innerHTML = parts.join('');
  }
`;
