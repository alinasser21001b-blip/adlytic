// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts  —  PHASE 8 (mobile)
//
//  Every recommendation on this page communicates five things, in this order:
//
//      problem · evidence · confidence · impact · action
//
//  ── WHAT CHANGED AND WHY ────────────────────────────────────────────────
//  The previous version shipped a client-side dictionary of "Meta benchmarks"
//  (CTR 0.9-2.0%, frequency 1.5-3.0, "response drops 30-50%") and printed it
//  under a heading that read "معيار Meta". None of those numbers came from the
//  account. A merchant reading "المعيار المتوقع: 0.9% – 2.0%" next to their own
//  campaign has no way to know that figure was hard-coded in a browser bundle
//  rather than measured. That is invented evidence, and it is now gone.
//
//  What replaces it: the deterministic analytics DTO. intelligence.recommendation
//  already carries problem / evidence[] / severity / confidence / action /
//  expectedImpact, computed server-side by the funnel diagnosis. It was being
//  ignored by this page entirely. It is now the primary source.
//
//  When a recommendation arrives WITHOUT evidence (the flat
//  /recommendations list and dashData.priorityAction both do), it is rendered
//  honestly as "no measured evidence attached" — not decorated with a
//  plausible-sounding number. See dtoGaps in the phase report.
//
//  ── THE RULE THIS FILE OBEYS ────────────────────────────────────────────
//  No analytics logic. Nothing here computes a ratio, a delta, a cost-per-result
//  or a threshold. Counting how many recommendations carry a given severity is
//  bookkeeping, not analytics. Result counts are rendered per unit and never
//  added together: 84 conversations plus 12 orders is not 96 of anything.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="rec-page">
  <header class="rec-hero">
    <div class="rec-hero-content">
      <h1 class="page-title rec-title">ما الذي يحتاج تدخلك</h1>
      <p class="page-subtitle rec-subtitle">كل توصية مرتبطة بالدليل المقاس من حسابك — المشكلة، الدليل، الثقة، الأثر، ثم الإجراء.</p>
    </div>
    <button class="btn btn-secondary btn-sm rec-refresh-btn" id="refresh-btn" type="button">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg>
      <span>تحديث</span>
    </button>
  </header>

  <!-- Measured context. Per-unit rows only — results of different kinds are
       never added together. -->
  <section class="rec-context" id="rec-context" style="display:none;" aria-label="نتائج حسابك">
    <div class="rec-context-label">نتائج حسابك في الفترة</div>
    <div class="rec-context-units" id="rec-context-units"></div>
    <div class="rec-context-note" id="rec-context-note" style="display:none;"></div>
  </section>

  <section class="rec-summary" id="rec-summary" aria-label="ملخص التوصيات">
    <div class="rec-sum-item rec-sum-critical">
      <span class="rec-sum-num" id="stat-critical">—</span>
      <span class="rec-sum-desc">مستعجل</span>
    </div>
    <div class="rec-sum-item rec-sum-high">
      <span class="rec-sum-num" id="stat-high">—</span>
      <span class="rec-sum-desc">مهم</span>
    </div>
    <div class="rec-sum-item rec-sum-medium">
      <span class="rec-sum-num" id="stat-medium">—</span>
      <span class="rec-sum-desc">للمتابعة</span>
    </div>
    <div class="rec-sum-item rec-sum-total">
      <span class="rec-sum-num" id="stat-total">—</span>
      <span class="rec-sum-desc">الإجمالي</span>
    </div>
  </section>

  <div class="rec-controls">
    <div class="tabs rec-tabs" id="severity-tabs" role="tablist">
      <button class="tab active" data-filter="all" type="button">الكل</button>
      <button class="tab" data-filter="CRITICAL" type="button">مستعجل</button>
      <button class="tab" data-filter="HIGH" type="button">مهم</button>
      <button class="tab" data-filter="MEDIUM" type="button">للمتابعة</button>
      <button class="tab" data-filter="LOW" type="button">معلومة</button>
    </div>
    <div class="search-wrap rec-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <label class="sr-only" for="search-input">ابحث في التوصيات</label>
      <input type="search" class="form-input search-input" id="search-input" placeholder="ابحث في التوصيات…" enterkeyhint="search" autocomplete="off">
    </div>
  </div>

  <div id="issues-container">
    <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ قراءة تحليل حسابك…</div></div>
  </div>
</div>

<div id="rec-task-modal" class="modal-overlay rec-modal-overlay" style="display:none;" onclick="if(event.target===this) closeRecTaskModal()">
  <div class="modal rec-modal-enhanced" role="dialog" aria-modal="true" aria-labelledby="rec-task-modal-title">
    <div class="rec-modal-scroll">
      <div class="rec-modal-header">
        <div class="rec-modal-icon" aria-hidden="true">✓</div>
        <div>
          <div class="modal-title" id="rec-task-modal-title">تأكيد التنفيذ</div>
          <div class="modal-subtitle" id="rec-task-modal-sub">اتبع الخطوة في مدير إعلانات Meta ثم أكّد.</div>
        </div>
      </div>
      <div id="rec-task-modal-body" class="rec-modal-steps"></div>
      <div class="rec-modal-tip">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span>سنراقب النتيجة ونعرض الفرق عند توفر بيانات كافية.</span>
      </div>
    </div>
    <div class="modal-footer rec-modal-footer">
      <button type="button" class="btn btn-secondary btn-sm" id="rec-task-modal-cancel">إلغاء</button>
      <button type="button" class="btn btn-primary btn-sm" id="rec-task-modal-confirm">نفّذت الإجراء</button>
    </div>
  </div>
</div>

<style>
  .rec-page { direction: rtl; max-width: 960px; margin: 0 auto; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  .rec-hero {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 14px; flex-wrap: wrap; margin-bottom: 16px;
  }
  .rec-title { font-family: var(--font-display); letter-spacing: -0.02em; margin: 0; }
  .rec-subtitle { max-width: 46ch; margin: 6px 0 0; }
  .rec-refresh-btn { display: inline-flex; align-items: center; gap: 6px; }

  /* ── Measured context strip ── */
  .rec-context {
    padding: 12px 14px; margin-bottom: 16px; border-radius: 14px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .rec-context-label {
    font-size: 12px; font-weight: 800; color: var(--text-3);
    letter-spacing: 0.02em; margin-bottom: 8px;
  }
  .rec-context-units { display: flex; flex-wrap: wrap; gap: 8px; }
  .rec-unit-chip {
    display: inline-flex; align-items: baseline; gap: 6px;
    padding: 7px 11px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .rec-unit-count {
    font-size: 16px; font-weight: 800; color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .rec-unit-label { font-size: 12px; color: var(--text-2); font-weight: 600; }
  .rec-approx-tag {
    font-size: 12px; font-weight: 700; color: var(--warning);
    background: var(--warning-dim); border-radius: 6px; padding: 2px 6px;
  }
  .rec-context-note { font-size: 12px; color: var(--text-3); margin-top: 8px; line-height: 1.6; }

  /* ── Severity summary ── */
  .rec-summary {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    margin-bottom: 16px;
  }
  .rec-sum-item {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 12px 6px; border-radius: 14px; min-height: 62px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .rec-sum-num {
    font-size: 22px; font-weight: 800; color: var(--text);
    font-variant-numeric: tabular-nums; font-family: var(--font-display); line-height: 1.1;
  }
  .rec-sum-desc { font-size: 12px; color: var(--text-3); font-weight: 600; }
  .rec-sum-critical .rec-sum-num { color: var(--critical, #d32f2f); }
  .rec-sum-high .rec-sum-num { color: var(--error, #e65100); }
  .rec-sum-medium .rec-sum-num { color: var(--warning, #f9a825); }

  .rec-controls {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; flex-wrap: wrap; margin-bottom: 16px;
  }
  /* .tabs is width:fit-content globally; on a 320px phone five tabs at the
     44px touch floor are wider than the viewport, so this row must be allowed
     to shrink and scroll inside itself rather than widen the page. */
  .rec-tabs {
    flex: 1 1 auto; min-width: 0; width: auto; max-width: 100%;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  /* MEASURED: the gate reported "tab 41x44" — the 44px height floor applied
     but the narrowest label ("الكل") left the tab 41px WIDE. A target must
     clear 44 on both axes. */
  .rec-tabs .tab { flex: 0 0 auto; min-width: 44px; justify-content: center; }
  .rec-search { flex: 1 1 200px; min-width: 0; }
  .rec-search .search-input { width: 100%; }

  /* ── Cards ── */
  .rec-group { margin-bottom: 22px; }
  .rec-group-title {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    font-size: 12.5px; font-weight: 800; color: var(--text-2);
  }
  .rec-group-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

  .rec-card {
    background: var(--surface); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px; padding: 16px 16px 14px; margin-bottom: 12px;
    border-inline-start: 4px solid var(--border);
    position: relative;
  }
  .rec-card.is-done { opacity: 0.5; }

  .rec-card-top {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .rec-sev-badge {
    font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 999px;
    white-space: nowrap; letter-spacing: 0.02em;
  }
  .rec-conf {
    font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  }
  .rec-conf.conf-high { color: var(--success); border-color: var(--success-dim); }
  .rec-conf.conf-medium { color: var(--warning); border-color: var(--warning-dim); }
  .rec-conf.conf-low { color: var(--text-2); }
  .rec-conf.conf-collecting { color: var(--accent-2); border-color: var(--accent-glow); }

  .rec-problem {
    font-size: 16px; font-weight: 800; color: var(--text);
    line-height: 1.45; margin-bottom: 10px;
  }

  .rec-block { margin-bottom: 10px; }
  .rec-block-label {
    font-size: 12px; font-weight: 800; color: var(--accent-2);
    letter-spacing: 0.02em; margin-bottom: 4px;
  }
  .rec-evidence { margin: 0; padding: 0; list-style: none; }
  .rec-evidence li {
    font-size: 13.5px; color: var(--text); line-height: 1.65;
    padding: 8px 11px; border-radius: 10px; margin-bottom: 6px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
    border-inline-start: 3px solid var(--accent);
    overflow-wrap: anywhere;
  }
  .rec-evidence li:last-child { margin-bottom: 0; }
  .rec-no-evidence {
    font-size: 13px; color: var(--text-3); line-height: 1.6;
    padding: 8px 11px; border-radius: 10px;
    background: rgba(255,255,255,0.02); border: 1px dashed var(--border);
  }

  .rec-impact, .rec-action {
    font-size: 13.5px; color: var(--text-2); line-height: 1.65;
    overflow-wrap: anywhere;
  }
  .rec-action { color: var(--text); font-weight: 600; }
  .rec-approx-note {
    font-size: 12px; color: var(--warning); line-height: 1.6;
    margin-bottom: 10px;
  }

  .rec-card-footer {
    display: flex; gap: 8px; flex-wrap: wrap;
    border-top: 1px solid rgba(255,255,255,0.05); margin-top: 12px; padding-top: 12px;
  }
  .rec-card-footer .btn { flex: 1 1 auto; }

  /* ── Modal: usable with a keyboard open ── */
  .rec-modal-enhanced { max-width: 500px; display: flex; flex-direction: column; }
  .rec-modal-scroll { overflow-y: auto; min-height: 0; }
  .rec-modal-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .rec-modal-icon {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: #1A1613; font-weight: 800; flex-shrink: 0;
  }
  .rec-modal-steps { display: flex; flex-direction: column; gap: 10px; margin: 6px 0 14px; }
  .rec-modal-line {
    padding: 11px 13px; border-radius: 12px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    font-size: 13px; color: var(--text-2); line-height: 1.6;
  }
  .rec-modal-line b { color: var(--accent-2); display: block; font-size: 12px; margin-bottom: 3px; }
  .rec-modal-tip {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 13px; border-radius: 10px;
    background: var(--success-dim); border: 1px solid var(--success-dim);
    font-size: 12px; color: var(--text-2);
  }
  .rec-modal-tip svg { flex-shrink: 0; color: var(--success); }
  .rec-modal-footer { flex-shrink: 0; }
  .rec-modal-footer .btn { flex: 1 1 auto; }

  @media (max-width: 768px) {
    .rec-hero { gap: 10px; }
    .rec-summary { grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .rec-sum-item { padding: 10px 4px; }
    .rec-sum-num { font-size: 19px; }
    .rec-card { padding: 14px 13px 12px; border-radius: 16px; }
    .rec-problem { font-size: 15.5px; }
    .rec-controls { gap: 8px; }

    /* A centred dialog loses its footer behind the software keyboard. Dock it
       to the bottom, cap it against the visual viewport, and keep the confirm
       button pinned inside the sheet instead of below the fold. */
    .rec-modal-overlay { align-items: flex-end; }
    .rec-modal-enhanced {
      max-width: 100%;
      max-height: 88dvh;
      border-radius: 20px 20px 0 0;
      padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  var nameEl = document.getElementById('user-name');
  var emailEl = document.getElementById('user-email');
  var avEl = document.getElementById('user-avatar-initials') || document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = me.name || me.email;
  if (emailEl) emailEl.textContent = me.email;
  if (avEl) avEl.textContent = (me.name || me.email || '?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  var wsNameEl = document.getElementById('ws-name');
  if (wsNameEl) wsNameEl.textContent = wsM?.workspace?.name || 'مساحة العمل';

  let dashData = null;
  let flatRecs = [];
  let activeFilter = 'all';
  let pendingTask = null;

  // ── Presentation vocabulary. Labels only: nothing here decides anything. ──

  var SEVERITY = {
    CRITICAL: { text: 'مستعجل',  color: 'var(--critical)', rank: 0 },
    HIGH:     { text: 'مهم',      color: 'var(--error)',    rank: 1 },
    MEDIUM:   { text: 'للمتابعة', color: 'var(--warning)',  rank: 2 },
    LOW:      { text: 'معلومة',   color: 'var(--text-3)',   rank: 3 }
  };
  function severityOf(raw) {
    var key = String(raw == null ? 'LOW' : raw).toUpperCase();
    if (!SEVERITY[key]) key = 'LOW';
    var s = SEVERITY[key];
    return { key: key, text: s.text, color: s.color, rank: s.rank };
  }

  // INSUFFICIENT_DATA is NOT low confidence and NOT an error. It means the
  // window has not produced enough signal yet, and it must read that way.
  var CONFIDENCE = {
    HIGH:              { text: 'الثقة: مرتفعة',  cls: 'conf-high' },
    MEDIUM:            { text: 'الثقة: متوسطة',  cls: 'conf-medium' },
    LOW:               { text: 'الثقة: منخفضة',  cls: 'conf-low' },
    INSUFFICIENT_DATA: { text: 'لا تزال البيانات قيد التجميع', cls: 'conf-collecting' }
  };
  function confidenceOf(raw) {
    var key = String(raw == null ? '' : raw).toUpperCase();
    return CONFIDENCE[key] || null;
  }

  // The deterministic problem classes, as the merchant reads them.
  var PROBLEM_HEADLINE = {
    DELIVERY:          'مشكلة في الوصول',
    CLICK:             'مشكلة في التصميم',
    POST_CLICK:        'مشكلة بعد النقر',
    CONVERSION:        'مشكلة في إتمام النتيجة',
    EFFICIENCY:        'ارتفاع التكلفة',
    NO_MATERIAL_BREAK: 'لا توجد مشكلة جوهرية'
  };

  /**
   * Accepts only display-ready text: a string, or an array of strings.
   *
   * It deliberately REFUSES objects. dashData.issues[].evidence is typed
   * Record<string, unknown> — an untyped bag with no display contract — and
   * an earlier draft of this function turned it into the literal text
   * "[object Object]" underneath a heading that said "الدليل". A card that
   * shows nothing is honest; a card that shows garbage labelled as evidence
   * is not.
   */
  function confidenceRatio(value) {
    // AdviceTask.confidence is a 0-1 number, not the enum. Showing it as a
    // percentage is formatting the DTO's own figure — no threshold, no
    // bucketing, no judgement added in the browser.
    if (value == null || !isFinite(Number(value))) return null;
    return { text: 'الثقة: ' + Math.round(Number(value) * 100) + '٪', cls: '' };
  }

  function toEvidenceList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .filter(function (e) { return typeof e === 'string'; })
        .map(function (e) { return e.trim(); })
        .filter(Boolean);
    }
    if (typeof value !== 'string') return [];
    var one = value.trim();
    return one ? [one] : [];
  }

  /**
   * Build the display tasks. STRICTLY a projection of the DTO.
   *
   * Order of trust:
   *   1. intelligence.recommendation — carries problem, evidence, confidence,
   *      impact and action. This is the only fully-formed recommendation the
   *      backend produces today.
   *   2. dashData.merchantTasks[] — the AdviceTask contract
   *      (lib/plainArabicAdvice.ts). Server-localized, and its "why" field is
   *      the evidence narrative WITH the numbers in it when the task came
   *      from diagnose(). Its confidence is a 0-1 number, shown as a
   *      percentage: formatting, not a threshold.
   *   3. dashData.issues[] — title / severity / causes[] / recommendations[],
   *      all localized server-side. Its "evidence" field is an untyped
   *      Record and has no display form, so it is NOT rendered (see dtoGaps);
   *      "causes" is the localized evidence the merchant can read.
   *   4. dashData.priorityAction — carries evidence[] and expectation when
   *      the engine has them.
   *   5. the flat /recommendations list — an action string and a priority,
   *      and nothing else. Rendered WITHOUT evidence rather than with a
   *      manufactured one.
   */
  function buildTasks() {
    var out = [];
    var seenActionCodes = {};
    var seenIssueCodes = {};
    var d = dashData || {};

    var intel = d.intelligence;
    var rec = intel && intel.recommendation;
    if (rec) {
      var headline = PROBLEM_HEADLINE[intel.problemClass] || null;
      var evidence = toEvidenceList(rec.evidence);
      if (!evidence.length) evidence = toEvidenceList(intel.evidence);
      if (!evidence.length && d.funnel) evidence = toEvidenceList(d.funnel.evidence);
      if (rec.actionCode) seenActionCodes[String(rec.actionCode)] = true;
      out.push({
        itemKey: 'intelligence:' + (rec.actionCode || intel.problemClass || 'REC'),
        itemKind: 'issue',
        actionCode: rec.actionCode || null,
        severity: severityOf(rec.severity),
        confidence: confidenceOf(rec.confidence),
        headline: headline,
        problem: rec.problem || headline || 'ملاحظة على الحساب',
        evidence: evidence,
        impact: rec.expectedImpact || '',
        action: rec.action || '',
        steps: [],
        approximate: !!(d.funnel && d.funnel.approximateInvolved)
      });
    }

    // 2. merchantTasks — the AdviceTask contract, already localized.
    (Array.isArray(d.merchantTasks) ? d.merchantTasks : []).forEach(function (t) {
      if (!t) return;
      var key = String(t.actionCode || '');
      if (key && seenActionCodes[key]) return;
      if (key) seenActionCodes[key] = true;
      if (t.issueCode) seenIssueCodes[String(t.issueCode)] = true;
      out.push({
        itemKey: t.itemKey || ('task:' + (t.actionCode || t.issueCode || 'TASK')),
        itemKind: 'issue',
        actionCode: t.actionCode || null,
        severity: severityOf(t.severity),
        confidence: confidenceRatio(t.confidence),
        headline: null,
        problem: t.title || 'ملاحظة على الحساب',
        evidence: toEvidenceList(t.why),
        impact: t.expect || '',
        action: t.action || '',
        steps: toEvidenceList(t.steps),
        approximate: false
      });
    });

    // 3. issues[] — causes[] is the localized evidence. The issue.evidence
    //    field is an untyped Record with no display form: not shown.
    (Array.isArray(d.issues) ? d.issues : []).forEach(function (issue, i) {
      var code = String(issue.code || issue.issueCode || ('ISSUE_' + i));
      if (seenIssueCodes[code]) return;
      seenIssueCodes[code] = true;
      var recs = toEvidenceList(issue.recommendations);
      out.push({
        itemKey: 'issue:' + code,
        itemKind: 'issue',
        actionCode: issue.actionCode || null,
        severity: severityOf(issue.severity),
        confidence: confidenceOf(issue.confidence),
        headline: null,
        problem: issue.title || 'ملاحظة على الحساب',
        evidence: toEvidenceList(issue.causes),
        impact: '',
        action: recs[0] || '',
        steps: recs.slice(1),
        approximate: false
      });
    });

    // 4. priorityAction — carries evidence[] and expectation when available.
    var pa = d.priorityAction;
    if (pa && pa.text && !seenActionCodes[String(pa.actionCode)]) {
      seenActionCodes[String(pa.actionCode)] = true;
      out.push({
        itemKey: 'priority:' + (pa.actionCode || 'ACTION'),
        itemKind: 'recommendation',
        actionCode: pa.actionCode || null,
        severity: severityOf(pa.priority),
        confidence: null,
        headline: null,
        problem: pa.text,
        evidence: toEvidenceList(pa.evidence),
        impact: pa.expectation || pa.costDisplay || '',
        action: pa.text,
        steps: [],
        approximate: false
      });
    }

    flatRecs.forEach(function (r) {
      var codeKey = String(r.actionCode || r.id || '');
      if (seenActionCodes[codeKey]) return;
      seenActionCodes[codeKey] = true;
      out.push({
        itemKey: 'rec:' + (r.id || r.actionCode || 'REC'),
        itemKind: 'recommendation',
        actionCode: r.actionCode || null,
        severity: severityOf(r.priority || r.severity),
        confidence: confidenceOf(r.confidence),
        headline: null,
        problem: r.text || r.title || 'توصية',
        evidence: toEvidenceList(r.evidence),
        impact: r.expectedImpact || '',
        action: r.action || r.text || '',
        steps: [],
        approximate: false
      });
    });

    return out;
  }

  function askAiQuestion(task) {
    return 'اشرح لي: ' + (task.problem || '') + '. ما السبب، وما الخطوة العملية، ومتى أراجع النتيجة؟';
  }

  function renderCard(task) {
    var sev = task.severity;
    var head = task.headline
      ? '<span class="rec-sev-badge" style="background:' + sev.color + '1a;color:' + sev.color + ';">' + escHtml(task.headline) + '</span>'
      : '<span class="rec-sev-badge" style="background:' + sev.color + '1a;color:' + sev.color + ';">' + escHtml(sev.text) + '</span>';
    var sevChip = task.headline
      ? '<span class="rec-conf">' + escHtml(sev.text) + '</span>'
      : '';
    var confChip = task.confidence
      ? '<span class="rec-conf ' + task.confidence.cls + '">' + escHtml(task.confidence.text) + '</span>'
      : '';

    var evidenceHtml;
    if (task.evidence.length) {
      evidenceHtml = '<ul class="rec-evidence">' + task.evidence.map(function (e) {
        return '<li>' + escHtml(e) + '</li>';
      }).join('') + '</ul>';
    } else {
      evidenceHtml = '<div class="rec-no-evidence">لم يُرفق دليل مقاس بهذه التوصية بعد — عاملها كاقتراح للمراجعة، لا كنتيجة تحليل.</div>';
    }

    var approxHtml = task.approximate
      ? '<div class="rec-approx-note">يعتمد جزء من هذا التحليل على مؤشر تقريبي — تعامل معه كإشارة.</div>'
      : '';

    var impactHtml = task.impact
      ? '<div class="rec-block"><div class="rec-block-label">الأثر المتوقع</div><div class="rec-impact">' + escHtml(task.impact) + '</div></div>'
      : '';

    var actionHtml = task.action
      ? '<div class="rec-block"><div class="rec-block-label">الإجراء المقترح</div><div class="rec-action">' + escHtml(task.action) + '</div></div>'
      : '';

    return '<article class="rec-card" style="border-inline-start-color:' + sev.color + ';" data-severity="' + escHtml(sev.key) + '" data-item-key="' + escHtml(task.itemKey) + '">'
      + '<div class="rec-card-top">' + head + sevChip + confChip + '</div>'
      + '<h2 class="rec-problem">' + escHtml(task.problem) + '</h2>'
      + '<div class="rec-block"><div class="rec-block-label">الدليل</div>' + evidenceHtml + '</div>'
      + approxHtml
      + impactHtml
      + actionHtml
      + '<div class="rec-card-footer">'
      +   '<button type="button" class="btn btn-primary btn-sm rec-do-btn" data-item-key="' + escHtml(task.itemKey) + '">تحقّق</button>'
      +   '<button type="button" class="btn btn-secondary btn-sm rec-ignore-btn" data-item-key="' + escHtml(task.itemKey) + '">تجاهل</button>'
      +   '<a class="btn btn-ghost btn-sm" href="/ai?q=' + encodeURIComponent(askAiQuestion(task)) + '">اسأل المساعد</a>'
      + '</div>'
      + '</article>';
  }

  /**
   * Result context. One row per unit, exactly as the server broke them down.
   * The server also ships a joined displayAr string; the per-unit chips here
   * exist so a narrow phone can wrap them without a unit losing its count.
   * Nothing is added across units.
   */
  function renderContext(d) {
    var rb = d && d.resultBreakdown;
    var host = document.getElementById('rec-context');
    var unitsEl = document.getElementById('rec-context-units');
    var noteEl = document.getElementById('rec-context-note');
    if (!rb || !Array.isArray(rb.byUnit) || !rb.byUnit.length) {
      host.style.display = 'none';
      return;
    }
    unitsEl.innerHTML = rb.byUnit.map(function (u) {
      var count = (u.count == null) ? '—' : Number(u.count).toLocaleString('en-US');
      return '<span class="rec-unit-chip">'
        + '<span class="rec-unit-count">' + escHtml(count) + '</span>'
        + '<span class="rec-unit-label">' + escHtml(u.labelAr || u.unit || '') + '</span>'
        + (u.approximate ? '<span class="rec-approx-tag">تقريبي</span>' : '')
        + '</span>';
    }).join('');
    if (rb.mixed) {
      noteEl.textContent = 'حسابك يشغّل أهدافاً مختلفة. النتائج معروضة كل نوع على حدة لأن جمعها لا يعطي رقماً له معنى.';
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }
    host.style.display = 'block';
  }

  function render() {
    var q = (document.getElementById('search-input').value || '').toLowerCase();
    var tasks = buildTasks();

    document.getElementById('stat-total').textContent = tasks.length;
    function countOf(key) {
      return tasks.filter(function (t) { return t.severity.key === key; }).length;
    }
    document.getElementById('stat-critical').textContent = countOf('CRITICAL');
    document.getElementById('stat-high').textContent = countOf('HIGH');
    document.getElementById('stat-medium').textContent = countOf('MEDIUM');

    if (activeFilter !== 'all') {
      tasks = tasks.filter(function (t) { return t.severity.key === activeFilter; });
    }
    if (q) {
      tasks = tasks.filter(function (t) {
        return (t.problem || '').toLowerCase().includes(q)
          || (t.action || '').toLowerCase().includes(q)
          || (t.evidence.join(' ') || '').toLowerCase().includes(q);
      });
    }
    tasks.sort(function (a, b) { return a.severity.rank - b.severity.rank; });

    var container = document.getElementById('issues-container');
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">'
        + (activeFilter === 'all' ? 'لا يوجد ما يحتاج تدخلك الآن' : 'لا توجد توصيات في هذه الفئة')
        + '</div><div class="empty-text">نراقب حملاتك باستمرار، وننبّهك فور ظهور دليل يستدعي إجراءً.</div></div>';
      return;
    }

    var urgent = tasks.filter(function (t) { return t.severity.rank <= 1; });
    var later = tasks.filter(function (t) { return t.severity.rank > 1; });

    var html = '';
    if (urgent.length) {
      html += '<section class="rec-group"><div class="rec-group-title">يحتاج تنفيذ الآن · ' + urgent.length + '</div>'
        + urgent.map(renderCard).join('') + '</section>';
    }
    if (later.length) {
      html += '<section class="rec-group"><div class="rec-group-title">للمتابعة والتحسين · ' + later.length + '</div>'
        + later.map(renderCard).join('') + '</section>';
    }
    container.innerHTML = html;
  }

  function findTaskByKey(itemKey) {
    return buildTasks().find(function (t) { return t.itemKey === itemKey; }) || null;
  }

  window.closeRecTaskModal = function () {
    document.getElementById('rec-task-modal').style.display = 'none';
    pendingTask = null;
  };

  function openDoModal(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    pendingTask = task;
    document.getElementById('rec-task-modal-title').textContent = task.action || task.problem;
    document.getElementById('rec-task-modal-sub').textContent = task.problem;
    var lines = [];
    if (task.evidence.length) {
      lines.push('<div class="rec-modal-line"><b>الدليل</b>' + task.evidence.map(escHtml).join('<br>') + '</div>');
    }
    if (task.confidence) {
      lines.push('<div class="rec-modal-line"><b>الثقة</b>' + escHtml(task.confidence.text) + '</div>');
    }
    if (task.impact) {
      lines.push('<div class="rec-modal-line"><b>الأثر المتوقع</b>' + escHtml(task.impact) + '</div>');
    }
    if (task.action) {
      lines.push('<div class="rec-modal-line"><b>الإجراء</b>' + escHtml(task.action) + '</div>');
    }
    // Steps arrive on the DTO (AdviceTask.steps / issue.recommendations). None
    // are invented here: a task without steps simply shows none.
    if (task.steps && task.steps.length) {
      lines.push('<div class="rec-modal-line"><b>الخطوات</b>'
        + task.steps.map(function (s, i) { return (i + 1) + '. ' + escHtml(s); }).join('<br>')
        + '</div>');
    }
    document.getElementById('rec-task-modal-body').innerHTML = lines.join('');
    document.getElementById('rec-task-modal').style.display = 'flex';
  }

  async function postAction(action, task) {
    await apiFetch('/api/workspaces/' + encodeURIComponent(wsId) + '/recommendations/action', {
      method: 'POST',
      body: JSON.stringify({
        action: action,
        itemKey: task.itemKey,
        itemKind: task.itemKind || 'issue',
        actionCode: task.actionCode || null,
        title: task.problem,
      }),
    });
  }

  async function confirmDo() {
    if (!pendingTask) return;
    var btn = document.getElementById('rec-task-modal-confirm');
    if (btn) btn.disabled = true;
    try {
      await postAction('EXECUTED', pendingTask);
      toast('تم تسجيل الإجراء — سنعرض الفرق عند توفر بيانات كافية', 'success');
      closeRecTaskModal();
      await loadData();
    } catch (e) {
      toast(e.message || 'تعذّر تسجيل الإجراء', 'error');
    } finally { if (btn) btn.disabled = false; }
  }

  async function ignoreTask(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    try {
      await postAction('IGNORED', task);
      toast('تم تجاهل التوصية', 'info');
      await loadData();
    } catch (e) { toast(e.message || 'تعذّر التجاهل', 'error'); }
  }

  document.getElementById('issues-container').addEventListener('click', function (e) {
    var doBtn = e.target.closest('.rec-do-btn');
    if (doBtn) { openDoModal(doBtn.getAttribute('data-item-key')); return; }
    var igBtn = e.target.closest('.rec-ignore-btn');
    if (igBtn) { ignoreTask(igBtn.getAttribute('data-item-key')); }
  });
  document.getElementById('rec-task-modal-cancel').addEventListener('click', closeRecTaskModal);
  document.getElementById('rec-task-modal-confirm').addEventListener('click', confirmDo);

  async function loadData() {
    document.getElementById('issues-container').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ قراءة تحليل حسابك…</div></div>';
    try {
      var results = await Promise.all([
        apiFetch('/api/dashboard/' + wsId),
        apiFetch('/api/workspaces/' + wsId + '/recommendations'),
      ]);
      dashData = results[0] || {};
      flatRecs = Array.isArray(results[1]) ? results[1] : [];
      renderContext(dashData);
      render();
    } catch (e) {
      document.getElementById('issues-container').innerHTML =
        '<div class="alert alert-error">' + escHtml(e.message || 'تعذّر التحميل') + '</div>';
    }
  }

  document.getElementById('severity-tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#severity-tabs .tab').forEach(function (t) { t.classList.toggle('active', t === btn); });
    render();
  });
  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  await loadData();
})();
</script>`;

  return layout({ title: 'التوصيات', active: 'recommendations', content, scripts });
}
