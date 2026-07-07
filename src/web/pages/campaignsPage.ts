// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/campaignsPage.ts
//
//  Campaigns view — KPI cards, spend/CTR charts, all-campaigns table.
//
//  Shell is provided by the shared `layout()` helper in src/web/layout.ts,
//  so the page inherits the global dark design tokens, sidebar, and topbar.
//  This file owns ONLY: page-specific content markup and client-side logic
//  (data fetching, chart rendering, currency-aware formatting).
//
//  Data-binding contract (verified against the Prisma schema, V1):
//    /api/workspaces/:id              → { adAccounts: [{ currency, currencyMinorFactor, status, ... }] }
//    /api/workspaces/:id/campaigns    → Campaign[]    (dailyBudget/lifetimeBudget are BigInt MINOR units)
//    /api/workspaces/:id/insights     → DailyStat[]   (ordered date DESC; spend is BigInt MINOR units)
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function campaignsPage(): string {
  const content = `
<div class="loading-overlay" id="loading-state">
  <div class="spinner"></div>
  <div class="loading-text">جارٍ تحميل الحملات…</div>
</div>

<div id="error-state" style="display:none;">
  <div class="alert alert-error" id="error-msg">حدث خطأ.</div>
</div>

<div id="main-content" style="display:none;">
  <!-- No ad account CTA -->
  <div class="alert alert-info section-gap" id="no-ad-account-cta"
       style="display:none;flex-direction:column;align-items:center;text-align:center;padding:24px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">اربط حساب Meta الإعلاني الخاص بك</div>
    <div style="margin-bottom:14px;max-width:480px;">اربط حساب Meta الإعلاني لبدء تتبّع أداء الحملات والإنفاق والعائد على الاستثمار في الوقت الفعلي.</div>
    <a href="/workspace" class="btn btn-primary">الانتقال إلى مساحة العمل</a>
  </div>

  <!-- Paused / expired token CTA -->
  <div class="alert alert-warning section-gap" id="paused-account-cta"
       style="display:none;flex-direction:column;align-items:center;text-align:center;padding:24px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">انتهت صلاحية رمز حساب الإعلانات</div>
    <div style="margin-bottom:14px;max-width:480px;">انتهت صلاحية رمز الوصول لحساب Meta الإعلاني. البيانات المعروضة أدناه مخزّنة مؤقتاً وقد تكون قديمة. أعد ربط حسابك لاستئناف المزامنة المباشرة.</div>
    <a href="/workspace?connect=manual" class="btn btn-primary">إعادة ربط Meta (لصق الرمز)</a>
  </div>

  <!-- Page header -->
  <div class="page-header flex items-center justify-between">
    <div>
      <div class="page-title">الحملات</div>
      <div class="page-subtitle" id="page-subtitle">جميع الحملات في حساب Meta الإعلاني الخاص بك</div>
    </div>
    <div class="flex items-center gap-2">
      <div style="position:relative;" id="export-wrap">
        <button type="button" class="btn btn-ghost btn-sm" id="export-btn" title="تصدير البيانات كملف CSV">⬇ تصدير</button>
        <div id="export-menu" style="display:none;position:absolute;top:calc(100% + 6px);inset-inline-end:0;z-index:50;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);padding:6px;min-width:200px;">
          <button type="button" class="export-item" data-export="campaigns" style="display:block;width:100%;text-align:start;background:none;border:none;color:var(--text);font:inherit;padding:9px 12px;border-radius:7px;cursor:pointer;">📋 قائمة الحملات (CSV)</button>
          <button type="button" class="export-item" data-export="insights" style="display:block;width:100%;text-align:start;background:none;border:none;color:var(--text);font:inherit;padding:9px 12px;border-radius:7px;cursor:pointer;">📈 الأداء اليومي (CSV)</button>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm js-sync-trigger" id="force-sync-btn" title="مزامنة أحدث البيانات من Meta">↻ تحديث البيانات</button>
      <div class="tabs" id="date-tabs">
        <button class="tab" data-days="7">7ي</button>
        <button class="tab" data-days="14">14ي</button>
        <button class="tab active" data-days="30">30ي</button>
        <button class="tab" data-days="90">90ي</button>
      </div>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="camp-kpi-row">
    <div class="camp-kpi" data-accent="gold">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">إجمالي الحملات</div>
        <div class="camp-kpi-value" id="total-campaigns">—</div>
      </div>
    </div>
    <div class="camp-kpi" data-accent="green">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">حملات نشطة</div>
        <div class="camp-kpi-value" id="active-campaigns">—</div>
      </div>
    </div>
    <div class="camp-kpi" data-accent="amber">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">متوقفة مؤقتاً</div>
        <div class="camp-kpi-value" id="paused-campaigns">—</div>
      </div>
    </div>
    <div class="camp-kpi" data-accent="blue">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">إجمالي الإنفاق <button type="button" class="info-btn" data-metric-info="spend" title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>
        <div class="camp-kpi-value" id="total-spend">—</div>
        <div class="camp-kpi-sub" id="spend-period">آخر 30 يوماً</div>
      </div>
    </div>
  </div>

  <!-- Data-quality tracker (Tremor Tracker port): one segment per day -->
  <div class="fresh-strip" id="fresh-strip" style="display:none;">
    <div class="fresh-strip-head">
      <span class="fresh-strip-title">جودة البيانات · آخر 30 يوماً</span>
      <span class="fresh-strip-legend">
        <i class="seg-ok"></i> يوم مُزامَن
        <i class="seg-miss"></i> بلا بيانات
      </span>
    </div>
    <div class="fresh-strip-track" id="fresh-strip-track"></div>
  </div>

  <!-- Charts — 2×2 grid -->
  <div class="camp-chart-grid">
    <div class="chart-card">
      <div class="chart-card-header">
        <div class="chart-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;vertical-align:middle;margin-inline-end:6px;color:var(--accent);"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          الإنفاق عبر الزمن
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-spend"></canvas></div>
    </div>
    <div class="chart-card" id="ctr-chart-card">
      <div class="chart-card-header">
        <div class="chart-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;vertical-align:middle;margin-inline-end:6px;color:#34A871;"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
          نسبة النقر (CTR)
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-ctr"></canvas></div>
    </div>
    <div class="chart-card" id="reach-chart-card">
      <div class="chart-card-header">
        <div class="chart-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;vertical-align:middle;margin-inline-end:6px;color:#5B8DEF;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          الوصول (Reach)
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-reach"></canvas></div>
    </div>
    <div class="chart-card" id="impressions-chart-card">
      <div class="chart-card-header">
        <div class="chart-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;vertical-align:middle;margin-inline-end:6px;color:#C77A1F;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          مرات الظهور
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-impressions"></canvas></div>
    </div>
  </div>

  <!-- Campaigns table -->
  <div class="table-wrap">
    <div class="table-header">
      <div class="table-title">جميع الحملات</div>
      <div class="table-filters" id="status-filters">
        <button type="button" class="filter-chip active" data-status="ALL">الكل</button>
        <button type="button" class="filter-chip" data-status="ACTIVE">نشطة</button>
        <button type="button" class="filter-chip" data-status="PAUSED">متوقفة</button>
      </div>
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="form-input search-input" id="search-input" placeholder="بحث في الحملات…" style="width:240px;">
      </div>
    </div>
    <div style="overflow-x:auto;" id="table-container">
      <table>
        <thead id="campaigns-thead">
          <tr>
            <th class="th-sort" data-sort="name">الحملة</th>
            <th class="th-sort" data-sort="status">الحالة</th>
            <th class="th-sort is-sorted desc" data-sort="spendWindowMinor">الإنفاق <span id="window-label" class="th-window">(30ي)</span></th>
            <th>الاتجاه <span class="th-window">(7ي)</span></th>
            <th class="th-sort" data-sort="messagesWindow">الرسائل</th>
            <th class="th-sort" data-sort="ctrWindow">نسبة النقر</th>
            <th class="th-sort" data-sort="dailyBudget">الميزانية اليومية</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody id="campaigns-tbody">
          <tr><td colspan="8" style="color:var(--text-3);text-align:center;padding:24px;">جارٍ التحميل…</td></tr>
        </tbody>
        <tfoot id="campaigns-tfoot"></tfoot>
      </table>
    </div>
    <!-- Phone view: the wide table becomes tappable cards (CSS swaps them
         at ≤768px). Rendered by renderTable from the same campaigns array. -->
    <div id="campaigns-cards" class="camp-cards"></div>
    <div id="empty-campaigns" style="display:none;">
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">لا توجد حملات</div>
        <div class="empty-text">لا توجد حملات مطابقة لبحثك أو لا توجد حملات في مساحة العمل هذه بعد.</div>
      </div>
    </div>
  </div>

  <!-- Inspector-local styles. Kept inline (not in layout()) so the
       tab styling lives next to the markup that uses it and we avoid
       polluting the global stylesheet for a single modal. -->
  <style>
    .export-item:hover { background: var(--surface-2, rgba(255,255,255,0.05)); }

    /* ── Data-quality tracker (Tremor Tracker port) ──────────────────── */
    .fresh-strip {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 14px 18px; margin-bottom: 20px;
    }
    .fresh-strip-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; }
    .fresh-strip-title { font-size: 12.5px; font-weight: 700; color: var(--text); }
    .fresh-strip-legend { font-size: 11px; color: var(--text-3); display: inline-flex; align-items: center; gap: 6px; }
    .fresh-strip-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
    .fresh-strip-legend .seg-ok   { background: var(--success); }
    .fresh-strip-legend .seg-miss { background: var(--surface-2, rgba(255,255,255,0.08)); border: 1px solid var(--border-2); }
    .fresh-strip-track { display: flex; gap: 3px; direction: ltr; }
    .fresh-seg {
      flex: 1; height: 22px; border-radius: 3px;
      background: var(--surface-2, rgba(255,255,255,0.06));
      transition: transform .1s;
    }
    .fresh-seg:hover { transform: scaleY(1.15); }
    .fresh-seg.ok { background: var(--success); opacity: .85; }

    /* Sparkline column */
    .spark-cell canvas { display: block; width: 96px; height: 26px; }

    /* ── Analytics table upgrades ─────────────────────────────────────── */
    .table-filters { display: flex; gap: 6px; }
    .filter-chip {
      font-size: 12px; font-weight: 600; color: var(--text-3);
      background: transparent; border: 1px solid var(--border-2);
      padding: 5px 13px; border-radius: 999px; cursor: pointer;
      font-family: inherit; transition: all .15s;
    }
    .filter-chip:hover { color: var(--text); border-color: var(--text-3); }
    .filter-chip.active { color: var(--accent-2); background: var(--accent-dim); border-color: rgba(217,167,89,0.4); }
    .th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
    .th-sort:hover { color: var(--text); }
    .th-sort::after { content: '↕'; opacity: 0.35; margin-inline-start: 5px; font-size: 10px; }
    .th-sort.is-sorted.desc::after { content: '↓'; opacity: 1; color: var(--accent); }
    .th-sort.is-sorted.asc::after  { content: '↑'; opacity: 1; color: var(--accent); }
    .th-window { font-weight: 400; color: var(--text-3); font-size: 10.5px; }
    .cell-name { font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obj-chip {
      display: inline-block; margin-top: 4px;
      font-size: 10.5px; color: var(--text-3);
      background: var(--surface-2, rgba(255,255,255,0.03));
      border: 1px solid var(--border-2);
      padding: 1px 8px; border-radius: 999px;
    }
    .cell-spend { min-width: 110px; }
    .cell-spend .num { font-weight: 700; color: var(--text); font-feature-settings: 'tnum'; direction: ltr; unicode-bidi: embed; }
    .spend-bar { height: 3px; background: var(--surface-2, rgba(255,255,255,0.05)); border-radius: 2px; margin-top: 5px; overflow: hidden; }
    .spend-bar > i { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-radius: 2px; }
    .cell-num { font-feature-settings: 'tnum'; direction: ltr; unicode-bidi: embed; color: var(--text-2); }
    #campaigns-tfoot td {
      border-top: 2px solid var(--border-2);
      font-weight: 700; color: var(--text);
      background: var(--surface-2, rgba(255,255,255,0.02));
    }
    #campaigns-tfoot .tot-label { color: var(--text-3); font-weight: 600; font-size: 12px; }

    /* ── Phone campaign cards (replace the 700px-wide table on mobile) ── */
    .camp-cards { display: none; }
    .camp-card {
      background: var(--surface-2, rgba(255,255,255,0.02));
      border: 1px solid var(--border-2);
      border-inline-start: 3px solid var(--border-2);
      border-radius: 12px;
      padding: 14px 16px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: border-color .15s, transform .1s;
    }
    .camp-card:active { transform: scale(0.985); }
    .camp-card[data-status="ACTIVE"] { border-inline-start-color: var(--success); }
    .camp-card[data-status="PAUSED"] { border-inline-start-color: var(--warning); }
    .camp-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .camp-card-name {
      font-size: 14px; font-weight: 700; color: var(--text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1;
    }
    .camp-card-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .camp-card-chip {
      font-size: 11.5px; color: var(--text-2);
      background: var(--surface); border: 1px solid var(--border-2);
      padding: 3px 9px; border-radius: 999px; white-space: nowrap;
    }
    .camp-card-chip b { color: var(--text); font-weight: 600; }
    .camp-card-cta {
      margin-top: 10px; font-size: 12px; font-weight: 600; color: var(--accent);
      display: flex; align-items: center; gap: 4px;
    }
    @media (max-width: 768px) {
      /* Inline display:block from renderTable would beat a plain rule. */
      #table-container { display: none !important; }
      .camp-cards { display: flex; flex-direction: column; gap: 10px; }
      .table-header { flex-direction: column; align-items: stretch; gap: 10px; }
      .table-header .search-input { width: 100% !important; }
      /* Header: actions wrap under the title instead of overflowing. */
      .page-header.flex { flex-direction: column; align-items: stretch; gap: 12px; }
      .page-header .flex { flex-wrap: wrap; }
      #date-tabs { width: 100%; display: flex; }
      #date-tabs .tab { flex: 1; }
    }
    .inspector-tab {
      background: transparent;
      color: var(--text-3);
      border: none;
      border-bottom: 2px solid transparent;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: color .15s, border-color .15s;
      font-family: inherit;
    }
    .inspector-tab:hover { color: var(--text-2); }
    .inspector-tab.is-active {
      color: var(--text);
      border-bottom-color: var(--accent);
    }
    .inspector-creative-card {
      background: var(--surface-2, rgba(255,255,255,0.02));
      border: 1px solid var(--border-2);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .inspector-creative-thumb {
      width: 100%;
      aspect-ratio: 1 / 1;
      position: relative;
      overflow: hidden;
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-3);
      font-size: 28px;
    }
    .inspector-creative-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .inspector-creative-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    .inspector-creative-video-badge {
      position: absolute;
      bottom: 8px;
      left: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(0,0,0,0.65);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      direction: rtl;
    }
    @media (max-width: 768px) {
      .inspector-tab { padding: 8px 12px; font-size: 13px; }
      .inspector-creative-card { border-radius: 8px; }
    }
  </style>

  <!-- Campaign Inspector Modal — populated on-demand from
       /api/workspaces/:wsId/campaigns/:cid/inspector. Hidden by default.
       Inner content is fully RTL/Arabic; rendered by renderInspector().

       Phase 5: the body is now tabbed (Overview / Creatives / Audience).
       Tab buttons live INSIDE the modal so the header stays clean. -->
  <div id="campaign-inspector-modal" class="modal-overlay" style="display:none;">
    <div class="modal" style="max-width:840px;max-height:88vh;overflow-y:auto;">
      <div class="modal-title" id="inspector-title" style="direction:rtl;text-align:right;">تفاصيل الحملة</div>
      <div class="modal-subtitle" id="inspector-subtitle" style="direction:rtl;text-align:right;">—</div>

      <!-- Tab bar (RTL). data-tab values drive switchInspectorTab(). -->
      <div id="inspector-tabs" role="tablist" style="display:flex;gap:4px;border-bottom:1px solid var(--border-2);margin:16px 0 14px;direction:rtl;">
        <button class="inspector-tab is-active" data-tab="overview"  role="tab" type="button">النظرة العامة</button>
        <button class="inspector-tab"           data-tab="creatives" role="tab" type="button">الإبداعات</button>
        <button class="inspector-tab"           data-tab="audience"  role="tab" type="button">الجمهور</button>
        <button class="inspector-tab"           data-tab="investigate" role="tab" type="button">🔎 تحقيق شامل</button>
      </div>

      <div id="inspector-body">
        <div style="text-align:center;color:var(--text-3);padding:24px;direction:rtl;">جارٍ تحميل البيانات…</div>
      </div>
      <div class="modal-footer">
        <button id="inspector-close" class="btn btn-secondary">إغلاق</button>
      </div>
    </div>
  </div>
</div>`;

  const scripts = `
<script src="/vendor/chart.umd.min.js"></script>
<script>
(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────────
  // Currency-aware formatter. The backend stores monetary amounts as BigInt
  // minor units (cents for USD/EGP/SAR/EUR…, whole-unit for IQD). The
  // account's currencyMinorFactor (100 or 1) decides the divisor and the
  // number of fractional digits to display. Hardcoding "$" would render a
  // 10.00 USD/day budget as "$1,000.00" — see state.minorFactor below.
  function fmtCurrencyMinor(amountMinor) {
    if (amountMinor == null || isNaN(amountMinor)) return '—';
    var major = Number(amountMinor) / state.minorFactor;
    var decimals = state.minorFactor === 1 ? 0 : 2;
    return major.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + ' ' + state.currency;
  }

  // /insights returns DailyStat rows ordered date DESC. Charts and the
  // "last N days" summary want the newest N rows in chronological order.
  // slice(-N) on a desc array keeps the OLDEST N rows — silently excluding
  // recent days. Take the head, then reverse for left-to-right time order.
  function recentAsc(insights, days) {
    return insights.slice(0, days).slice().reverse();
  }
  // 'ar-u-nu-latn' = Arabic month names with Latin digits, so dates read
  // Arabic while numbers stay consistent with the metric values next to them.
  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('ar-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtShortDate(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString('ar-u-nu-latn', { month: 'short', day: 'numeric' });
  }
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2);
  }
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  // escHtml + quote escaping — safe for use inside double-quoted HTML attributes
  // (e.g. an <img src="..."> built from a Meta CDN URL).
  function escAttr(s) {
    return escHtml(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  // creativeImgFailed / creativeImgLoaded — provided by SHARED_JS (layout.ts, C-2 CDN fallbacks).
  function getToken() { return localStorage.getItem('adlytic_token'); }
  function getWorkspaceId() { return localStorage.getItem('adlytic_workspace_id'); }
  function setWorkspaceId(id) { localStorage.setItem('adlytic_workspace_id', id); }
  function logout() {
    localStorage.removeItem('adlytic_token');
    localStorage.removeItem('adlytic_workspace_id');
    window.location.href = '/login';
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    var token = getToken();
    var res = await fetch(path, {
      method: opts.method || 'GET',
      body: opts.body,
      headers: Object.assign(
        { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        opts.headers || {}
      ),
      signal: opts.signal,
    });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) {
      var errBody = await res.json().catch(function() { return { error: 'API error ' + res.status }; });
      var err = new Error(errBody.error || ('API error ' + res.status + ' on ' + path));
      if (errBody.code) err.code = errBody.code;
      if (errBody.reconnectUrl) err.reconnectUrl = errBody.reconnectUrl;
      if (errBody.reconnectLabel) err.reconnectLabel = errBody.reconnectLabel;
      throw err;
    }
    return res.json().catch(function() {
      throw new Error('Server returned a non-JSON response from ' + path);
    });
  }

  // sleep() and pollSyncJob() are provided by SHARED_JS (layout.ts).

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    campaigns: [],
    insights: [],
    days: 30,
    spendChart: null,
    ctrChart: null,
    reachChart: null,
    impressionsChart: null,
    workspaceId: null,
    // Currency context — hydrated from /api/workspaces/:id once it returns.
    // Defaults are safe for the common case (USD-style 2-decimal currencies).
    currency: 'USD',
    minorFactor: 100,
    lastSyncedAt: null,
    lastIssueDates: [],
    currentInspectorCampaignId: null,
    // Table state — sorted by window spend (highest first) by default,
    // matching how a media buyer scans Ads Manager.
    sortKey: 'spendWindowMinor',
    sortDir: -1,
    statusFilter: 'ALL',
  };

  // ── Chart helpers ─────────────────────────────────────────────────────────
  function makeGradient(ctx, canvasH, r, g, b) {
    var grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0,   'rgba(' + r + ',' + g + ',' + b + ', 0.45)');
    grad.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ', 0.15)');
    grad.addColorStop(1,   'rgba(' + r + ',' + g + ',' + b + ', 0.02)');
    return grad;
  }

  // Convert each dataset's _rgb marker into a real canvas gradient. Runs on
  // BOTH the create path and the update path — updateCharts replaces the
  // spend chart's datasets wholesale on every refresh, and a dataset left
  // with only _rgb (no backgroundColor) would fill with the Chart.js default.
  function applyGradients(canvasId, datasets) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return datasets;
    var ctx = canvas.getContext('2d');
    var h = (canvas.parentElement && canvas.parentElement.clientHeight) || 220;
    datasets.forEach(function(ds) {
      if (ds._rgb) {
        ds.backgroundColor = makeGradient(ctx, h, ds._rgb[0], ds._rgb[1], ds._rgb[2]);
        delete ds._rgb;
      }
    });
    return datasets;
  }

  function makeLineChart(canvasId, labels, datasets) {
    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext('2d');
    applyGradients(canvasId, datasets);

    return new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#221D19',
            borderColor: '#3D352D',
            borderWidth: 1,
            titleColor: '#F3EFE7',
            bodyColor: '#B8AC9C',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 12 },
            displayColors: false,
            filter: function (item) { return !(item.dataset && item.dataset.isIssueMarkers); },
            callbacks: {
              label: function (item) {
                var v = item.parsed.y;
                var f = item.dataset && item.dataset._fmt;
                var txt = f === 'currency' ? fmtCurrencyMinor(v * state.minorFactor)
                  : f === 'pct' ? (Number(v).toFixed(2) + '%')
                  : Number(v).toLocaleString('en-US');
                return (item.dataset.label || '') + ': ' + txt;
              },
            },
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(50,43,37,0.5)', lineWidth: 0.5 },
            ticks: { color: '#746A5C', maxTicksLimit: 7, font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(50,43,37,0.5)', lineWidth: 0.5 },
            ticks: {
              color: '#746A5C',
              font: { size: 11 },
              callback: function(v) {
                if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
                if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
                return v;
              }
            }
          }
        },
        elements: {
          point: { radius: 1.5, hoverRadius: 6, hoverBorderWidth: 2, hitRadius: 8 },
          line: { borderWidth: 2.5 }
        },
        onClick: function (evt, elements, chart) {
          if (!elements || !elements.length) return;
          var el = elements[0];
          var ds = chart.data.datasets[el.datasetIndex];
          if (ds && ds.isIssueMarkers && ds.pointDates && ds.pointDates[el.index]) {
            openTimelineAttribution(ds.pointDates[el.index], state.currentInspectorCampaignId);
          }
        },
      }
    });
  }

  // Timeline Explorer — see PHASE3_IFA_DESIGN.md §3 / dashboardPage.ts's
  // twin implementation for chart-spend-main.
  function buildIssueMarkerDataset(labels, isoDates, issueDates) {
    if (!Array.isArray(issueDates) || !issueDates.length) return null;
    var severityColor = { CRITICAL: '#C7382A', HIGH: '#E2604F', MEDIUM: '#C77A1F', LOW: '#746A5C' };
    var isoToIndex = {};
    isoDates.forEach(function (d, i) { isoToIndex[d] = i; });
    var points = [], pointDates = [], colors = [];
    issueDates.forEach(function (iss) {
      var idx = isoToIndex[iss.date];
      if (idx == null) return;
      points.push({ x: labels[idx], y: 0 });
      pointDates.push(iss.date);
      colors.push(severityColor[iss.severity] || '#746A5C');
    });
    if (!points.length) return null;
    return {
      type: 'scatter', label: 'مشاكل مكتشفة', data: points,
      pointDates: pointDates, isIssueMarkers: true,
      backgroundColor: colors, pointRadius: 6, pointHoverRadius: 8,
      showLine: false, order: 0,
    };
  }

  function updateCharts(insights) {
    try {
    var filtered = recentAsc(insights, state.days);
    var labels = filtered.map(function(d) { return fmtShortDate(d.date); });
    var isoDates = filtered.map(function(d) { return new Date(d.date).toISOString().slice(0, 10); });
    // d.spend is BigInt minor units (e.g. cents). We pass the raw minor
    // number into the chart series here because the y-axis tick formatter
    // would otherwise need the divisor too — keep it consistent by also
    // dividing in the dataset. The chart already shows magnitude only.
    var spendData = filtered.map(function(d) { return (Number(d.spend) || 0) / state.minorFactor; });
    var ctrData = filtered.map(function(d) { return Number(d.ctr) || 0; });

    var spendDatasets = [{
      label: 'الإنفاق (' + state.currency + ')',
      data: spendData,
      borderColor: '#D9A759',
      _rgb: [217, 167, 89],
      _fmt: 'currency',
      fill: true, tension: 0.4,
      pointBackgroundColor: '#D9A759',
    }];
    // 7-day moving average — smooths daily noise so the trend reads at a
    // glance. Dashed, no fill, sits behind the daily line.
    if (spendData.length >= 7) {
      var ma = spendData.map(function(_, i) {
        var from = Math.max(0, i - 6);
        var slice = spendData.slice(from, i + 1);
        return slice.reduce(function(a, b) { return a + b; }, 0) / slice.length;
      });
      spendDatasets.push({
        label: 'المتوسط (7 أيام)',
        data: ma,
        borderColor: 'rgba(230,189,122,0.55)',
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        _fmt: 'currency',
      });
    }
    var markerDataset = buildIssueMarkerDataset(labels, isoDates, state.lastIssueDates);
    if (markerDataset) spendDatasets.push(markerDataset);

    if (state.spendChart) {
      state.spendChart.data.labels = labels;
      state.spendChart.data.datasets = applyGradients('chart-spend', spendDatasets);
      state.spendChart.update();
    } else {
      state.spendChart = makeLineChart('chart-spend', labels, spendDatasets);
    }

    var hasCtrData = ctrData.some(function(v){ return v > 0; });
    var ctrCard = document.getElementById('ctr-chart-card');
    if (!hasCtrData) {
      ctrCard.style.display = 'none';
    } else {
      ctrCard.style.display = '';
      if (state.ctrChart) {
        state.ctrChart.data.labels = labels;
        state.ctrChart.data.datasets[0].data = ctrData;
        state.ctrChart.update();
      } else {
        state.ctrChart = makeLineChart('chart-ctr', labels, [{
          label: 'نسبة النقر (%)',
          data: ctrData,
          borderColor: '#34A871',
          _rgb: [52, 168, 113],
          _fmt: 'pct',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#34A871',
        }]);
      }
    }

    var reachData = filtered.map(function(d) { return Number(d.reach) || 0; });
    var hasReachData = reachData.some(function(v){ return v > 0; });
    var reachCard = document.getElementById('reach-chart-card');
    if (!hasReachData) {
      reachCard.style.display = 'none';
    } else {
      reachCard.style.display = '';
      if (state.reachChart) {
        state.reachChart.data.labels = labels;
        state.reachChart.data.datasets[0].data = reachData;
        state.reachChart.update();
      } else {
        state.reachChart = makeLineChart('chart-reach', labels, [{
          label: 'الوصول',
          data: reachData,
          borderColor: '#5B8DEF',
          _rgb: [91, 141, 239],
          _fmt: 'int',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#5B8DEF',
        }]);
      }
    }

    var impressionsData = filtered.map(function(d) { return Number(d.impressions) || 0; });
    var hasImpressionsData = impressionsData.some(function(v){ return v > 0; });
    var impressionsCard = document.getElementById('impressions-chart-card');
    if (!hasImpressionsData) {
      impressionsCard.style.display = 'none';
    } else {
      impressionsCard.style.display = '';
      if (state.impressionsChart) {
        state.impressionsChart.data.labels = labels;
        state.impressionsChart.data.datasets[0].data = impressionsData;
        state.impressionsChart.update();
      } else {
        state.impressionsChart = makeLineChart('chart-impressions', labels, [{
          label: 'مرات الظهور',
          data: impressionsData,
          borderColor: '#C77A1F',
          _rgb: [199, 122, 31],
          _fmt: 'int',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#C77A1F',
        }]);
      }
    }
    } catch (chartErr) {
      console.error('[campaigns] chart render failed:', chartErr);
    }
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  function updateSummary(campaigns, insights) {
    var total = campaigns.length;
    // Match dashboard "Active Ads · Now Spending" — DB status alone can stay
    // stale ACTIVE when sync is blocked (e.g. TOKEN_ENCRYPTION_KEY rotation).
    var active = campaigns.filter(function(c){ return c.status === 'ACTIVE'; }).length;
    var paused = campaigns.filter(function(c){ return c.status === 'PAUSED'; }).length;
    var filtered = recentAsc(insights, state.days);
    // d.spend is BigInt minor units (cents for USD, EGP, SAR; whole-unit
    // for IQD). Sum in minor units, format once with the account's
    // currencyMinorFactor — never assume "$" or 100.
    var totalSpendMinor = filtered.reduce(function(acc, d){ return acc + (Number(d.spend) || 0); }, 0);

    tickText(document.getElementById('total-campaigns'), String(total));
    tickText(document.getElementById('active-campaigns'), String(active));
    tickText(document.getElementById('paused-campaigns'), String(paused));
    tickText(document.getElementById('total-spend'), fmtCurrencyMinor(totalSpendMinor));
    document.getElementById('spend-period').textContent = 'آخر ' + state.days + ' يوماً';
  }

  // ── Objective translation ──────────────────────────────────────────────────
  var OBJECTIVE_AR = {
    OUTCOME_SALES:        'مبيعات',
    OUTCOME_ENGAGEMENT:   'تفاعل',
    OUTCOME_LEADS:        'عملاء محتملون',
    OUTCOME_AWARENESS:    'وعي بالعلامة',
    OUTCOME_TRAFFIC:      'زيارات',
    OUTCOME_APP_PROMOTION:'ترويج تطبيق',
    MESSAGES:             'رسائل',
    CONVERSIONS:          'تحويلات',
    LINK_CLICKS:          'نقرات الرابط',
    REACH:                'وصول',
    BRAND_AWARENESS:      'وعي بالعلامة',
    POST_ENGAGEMENT:      'تفاعل المنشور',
    PAGE_LIKES:           'إعجابات الصفحة',
    VIDEO_VIEWS:          'مشاهدات فيديو',
    LEAD_GENERATION:      'توليد عملاء',
    PRODUCT_CATALOG_SALES:'مبيعات الكتالوج',
    STORE_VISITS:         'زيارات المتجر',
  };
  function translateObjective(obj) {
    if (!obj) return '—';
    return OBJECTIVE_AR[obj] || obj.replace(/^OUTCOME_/, '').replace(/_/g, ' ');
  }

  // Draw every .spark-cell canvas from its data-spark JSON (7 daily values).
  function drawSparklines() {
    document.querySelectorAll('.spark-cell canvas').forEach(function (cv) {
      var vals;
      try { vals = JSON.parse(cv.getAttribute('data-spark') || '[]'); } catch (e) { vals = []; }
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!vals.length || !vals.some(function (v) { return v > 0; })) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(4, cv.height / 2); ctx.lineTo(cv.width - 4, cv.height / 2); ctx.stroke();
        return;
      }
      var max = Math.max.apply(null, vals), pad = 6;
      var stepX = (cv.width - pad * 2) / (vals.length - 1);
      var y = function (v) { return cv.height - pad - (v / max) * (cv.height - pad * 2); };
      // area fill
      ctx.beginPath();
      vals.forEach(function (v, i) { var px = pad + i * stepX; i ? ctx.lineTo(px, y(v)) : ctx.moveTo(px, y(v)); });
      ctx.lineTo(pad + (vals.length - 1) * stepX, cv.height - 2); ctx.lineTo(pad, cv.height - 2); ctx.closePath();
      ctx.fillStyle = 'rgba(217,167,89,0.16)'; ctx.fill();
      // line
      ctx.beginPath();
      vals.forEach(function (v, i) { var px = pad + i * stepX; i ? ctx.lineTo(px, y(v)) : ctx.moveTo(px, y(v)); });
      ctx.strokeStyle = '#D9A759'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      // latest-day dot
      ctx.beginPath(); ctx.arc(pad + (vals.length - 1) * stepX, y(vals[vals.length - 1]), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#E6BD7A'; ctx.fill();
    });
  }

  // 30-day data-quality strip: a green segment for every day that has a
  // synced daily_stat row in /insights, gray for gaps (Tremor Tracker port).
  function renderFreshnessStrip(insights) {
    var wrap = document.getElementById('fresh-strip');
    var track = document.getElementById('fresh-strip-track');
    if (!wrap || !track) return;
    if (!Array.isArray(insights) || insights.length === 0) { wrap.style.display = 'none'; return; }
    var have = {};
    insights.forEach(function (d) { have[new Date(d.date).toISOString().slice(0, 10)] = true; });
    var segs = '';
    for (var i = 29; i >= 0; i--) {
      var dt = new Date(Date.now() - i * 864e5);
      var iso = dt.toISOString().slice(0, 10);
      var label = dt.toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'short' });
      segs += '<div class="fresh-seg' + (have[iso] ? ' ok' : '') + '" title="' + escAttr(label + (have[iso] ? ' — مُزامَن' : ' — لا بيانات')) + '"></div>';
    }
    track.innerHTML = segs;
    wrap.style.display = '';
  }

  // ── Table rendering ───────────────────────────────────────────────────────
  // statusBadge is provided as a global by SHARED_JS in layout.ts — uses the
  // unified .badge palette (badge-green/yellow/gray/red).
  function renderTable(campaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var emptyEl = document.getElementById('empty-campaigns');
    var tableContainer = document.getElementById('table-container');
    var cardsEl = document.getElementById('campaigns-cards');
    try {
    if (!campaigns || !Array.isArray(campaigns)) campaigns = [];

    if (campaigns.length === 0) {
      tableContainer.style.display = 'none';
      if (cardsEl) cardsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyEl.style.display = 'none';

    // Spend bar scale: relative to the biggest spender in the visible list.
    var maxSpend = 0;
    campaigns.forEach(function(c) {
      var s = Number(c.spendWindowMinor) || 0;
      if (s > maxSpend) maxSpend = s;
    });

    // Phone cards — same data, tap anywhere on the card to open the inspector.
    if (cardsEl) {
      cardsEl.innerHTML = campaigns.map(function(c) {
        var spendTxt = fmtCurrencyMinor(Number(c.spendWindowMinor) || 0);
        var budget = c.dailyBudget != null
          ? fmtCurrencyMinor(c.dailyBudget) + ' / يوم'
          : (c.lifetimeBudget != null ? fmtCurrencyMinor(c.lifetimeBudget) + ' إجمالي' : 'بدون ميزانية');
        return '<div class="camp-card" data-campaign-id="' + escAttr(c.id) + '" data-status="' + escAttr(c.status || '') + '">'
          + '<div class="camp-card-top">'
          +   '<div class="camp-card-name">' + escHtml(c.name || '—') + '</div>'
          +   statusBadge(c.status)
          + '</div>'
          + '<div class="camp-card-meta">'
          +   '<span class="camp-card-chip">📊 <b>' + escHtml(spendTxt) + '</b> · ' + state.days + 'ي</span>'
          +   '<span class="camp-card-chip">💬 ' + escHtml(fmtNum(c.messagesWindow, 0)) + ' رسالة</span>'
          +   '<span class="camp-card-chip">🎯 ' + escHtml(translateObjective(c.objective)) + '</span>'
          +   '<span class="camp-card-chip">💰 ' + escHtml(budget) + '</span>'
          + '</div>'
          + '<div class="camp-card-cta">عرض التفاصيل ←</div>'
          + '</div>';
      }).join('');
    }

    var totSpend = 0, totMsgs = 0;
    tbody.innerHTML = campaigns.map(function(c) {
      // Campaign.dailyBudget / lifetimeBudget are BigInt minor units in the
      // schema. They came through bigintReplacer as plain Numbers but still
      // in MINOR units — format via the account-aware helper.
      var budget = c.dailyBudget != null
        ? fmtCurrencyMinor(c.dailyBudget)
        : (c.lifetimeBudget != null ? fmtCurrencyMinor(c.lifetimeBudget) + ' (إجمالي)' : '—');
      var spendMinor = Number(c.spendWindowMinor) || 0;
      totSpend += spendMinor;
      totMsgs += Number(c.messagesWindow) || 0;
      var barPct = maxSpend > 0 ? Math.max(2, Math.round((spendMinor / maxSpend) * 100)) : 0;
      return '<tr>'
        + '<td><div class="cell-name" title="' + escAttr(c.name || '') + '">' + escHtml(c.name || '—') + '</div>'
        +   '<span class="obj-chip">' + escHtml(translateObjective(c.objective)) + '</span></td>'
        + '<td>' + statusBadge(c.status) + '</td>'
        + '<td class="cell-spend"><span class="num">' + escHtml(fmtCurrencyMinor(spendMinor)) + '</span>'
        +   (maxSpend > 0 ? '<div class="spend-bar"><i style="width:' + barPct + '%"></i></div>' : '') + '</td>'
        + '<td class="spark-cell"><canvas width="192" height="52" data-spark="' + escAttr(JSON.stringify(c.spark || [])) + '"></canvas></td>'
        + '<td class="cell-num">' + escHtml(fmtNum(c.messagesWindow, 0)) + '</td>'
        + '<td class="cell-num">' + (c.ctrWindow != null ? escHtml(fmtNum(c.ctrWindow, 2)) + '%' : '—') + '</td>'
        + '<td class="cell-num">' + escHtml(budget) + '</td>'
        + '<td><button class="btn btn-secondary btn-sm js-inspect-btn" data-campaign-id="' + escHtml(c.id) + '">عرض</button></td>'
        + '</tr>';
    }).join('');

    // Tiny raw-2D sparklines (Tremor SparkChart port) — one per row, no
    // Chart.js instances so 100 rows stay cheap. devicePixelRatio-2 canvas.
    drawSparklines();

    // Totals row — window spend and messages across the visible (filtered) set.
    var tfoot = document.getElementById('campaigns-tfoot');
    if (tfoot) {
      tfoot.innerHTML = '<tr>'
        + '<td colspan="2" class="tot-label">الإجمالي · ' + campaigns.length + ' حملة · آخر ' + state.days + ' يوماً</td>'
        + '<td class="cell-spend"><span class="num">' + escHtml(fmtCurrencyMinor(totSpend)) + '</span></td>'
        + '<td class="cell-num">' + escHtml(fmtNum(totMsgs, 0)) + '</td>'
        + '<td colspan="4"></td>'
        + '</tr>';
    }
    } catch (tableErr) {
      console.error('[campaigns] table render failed:', tableErr);
      tbody.innerHTML = '<tr><td colspan="8" class="section-fallback">تعذّر عرض الحملات — حاول التحديث.</td></tr>';
    }
  }

  // ── Filter + sort pipeline ─────────────────────────────────────────────────
  // One function owns the search box, the status chips, and the sort state so
  // every path (typing, chip click, header click, data refresh) re-renders the
  // same way.
  function applyFilters() {
    var searchEl = document.getElementById('search-input');
    var q = (searchEl && searchEl.value || '').toLowerCase().trim();
    var list = state.campaigns.filter(function(c) {
      if (state.statusFilter !== 'ALL' && c.status !== state.statusFilter) return false;
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q)
        || (c.objective || '').toLowerCase().includes(q)
        || (c.status || '').toLowerCase().includes(q)
        || (c.id || '').toLowerCase().includes(q);
    });
    var key = state.sortKey, dir = state.sortDir;
    list = list.slice().sort(function(a, b) {
      var av = a[key], bv = b[key];
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av || '').localeCompare(String(bv || ''), 'ar') * dir;
      }
      var an = av == null ? -Infinity : Number(av);
      var bn = bv == null ? -Infinity : Number(bv);
      return (an - bn) * dir;
    });
    renderTable(list);
  }

  // ── Date tab switch ───────────────────────────────────────────────────────
  // Charts/summary re-slice locally; the per-campaign window columns need the
  // server (aggregated in daily_stats), so re-fetch the list with ?days=.
  function setDays(days) {
    state.days = days;
    document.querySelectorAll('.tab').forEach(function(btn) {
      if (btn.dataset.days != null) btn.classList.toggle('active', Number(btn.dataset.days) === days);
    });
    var winLabel = document.getElementById('window-label');
    if (winLabel) winLabel.textContent = '(' + days + 'ي)';
    updateSummary(state.campaigns, state.insights);
    updateCharts(state.insights);
    applyFilters();
    if (!state.workspaceId) return;
    apiFetchWithTimeout('/api/workspaces/' + state.workspaceId + '/campaigns?days=' + days, {}, 12000)
      .then(function(camps) {
        if (Array.isArray(camps)) {
          state.campaigns = camps;
          updateSummary(state.campaigns, state.insights);
          applyFilters();
        }
      })
      .catch(function() { /* keep showing the previous window's numbers */ });
  }

  // ── Campaign Inspector (drawer-style modal) ───────────────────────────────
  // Opens when the user clicks the "View" button on a campaign row. Fetches
  // /api/workspaces/:wsId/campaigns/:cid/inspector and renders three blocks:
  // Financial Summary, AI Timeline (CampaignBrainSnapshot rows), and
  // Positive/Negative Signals (7d-vs-prior-7d deltas).
  function fmtPct(v) {
    if (v == null || !isFinite(v)) return '—';
    return (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';
  }
  function fmtNum(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    });
  }
  // Same shape as fmtCurrencyMinor but parameterized by an arbitrary minor factor
  // so the inspector can use the value returned in the inspector payload — which
  // is the source of truth even if the page-level state hasn't hydrated yet.
  function fmtMinor(amountMinor, factor, currency) {
    if (amountMinor == null || isNaN(amountMinor)) return '—';
    var f = factor != null && factor > 0
      ? factor
      : (state.minorFactor != null && state.minorFactor > 0
        ? state.minorFactor
        : (currency === 'IQD' || state.currency === 'IQD' ? 1 : 100));
    var ccy = currency || state.currency || '';
    var major = Number(amountMinor) / f;
    var decimals = f === 1 ? 0 : 2;
    return major.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + (ccy ? ' ' + ccy : '');
  }

  // Arabic labels for the four metrics we surface as 7d-vs-prior-7d deltas.
  // The API returns raw keys; i18n stays on the client so the API doesn't
  // have to decide a locale.
  var SIGNAL_LABELS_AR = {
    ctr:            'تفاعل الإعلان',
    frequency:      'تكرار ظهور الإعلان',
    cpm:            'تكلفة الوصول لألف شخص',
    costPerMessage: 'تكلفة الرسالة',
  };

  // Map EntityStatus enum → Arabic so we never expose ACTIVE/PAUSED/etc.
  function statusArabic(status) {
    switch (status) {
      case 'ACTIVE':   return 'نشطة';
      case 'PAUSED':   return 'متوقفة';
      case 'ARCHIVED': return 'مؤرشفة';
      case 'DELETED':  return 'محذوفة';
      default:         return '—';
    }
  }
  function statusBadgeClass(status) {
    if (status === 'ACTIVE') return 'badge-green';
    if (status === 'PAUSED') return 'badge-yellow';
    return 'badge-gray';
  }

  function signalLine(s, isPositive) {
    var label   = SIGNAL_LABELS_AR[s.key] || s.key;
    var arrow   = (s.deltaPct >= 0 ? '▲' : '▼');
    var color   = isPositive ? 'var(--success)' : 'var(--error)';
    var current = s.key === 'ctr' ? fmtNum(s.current, 2) + '%' : fmtNum(s.current, 2);
    var prior   = s.key === 'ctr' ? fmtNum(s.prior,   2) + '%' : fmtNum(s.prior,   2);
    return '<li style="margin:6px 0;color:var(--text-2);direction:rtl;text-align:right;">'
      +    '<span style="color:' + color + ';font-weight:700;">' + arrow + ' ' + fmtPct(s.deltaPct) + '</span>'
      +    ' <span style="color:var(--text);">' + escHtml(label) + '</span>'
      +    ' <span style="color:var(--text-3);font-size:12px;">(الآن ' + escHtml(current) + ' · سابقاً ' + escHtml(prior) + ')</span>'
      +    '</li>';
  }

  function renderInspector(data) {
    var c = data.campaign || {};
    var a = data.account  || {};
    var s = data.summary  || {};
    var sig = data.signals || { positive: [], negative: [] };
    var timeline = Array.isArray(data.timeline) ? data.timeline : [];

    // ── Title + subtitle ──────────────────────────────────────────────────
    // Clean, client-facing: campaign name as the title, status badge + window
    // hint as the subtitle. We deliberately drop the raw Meta objective
    // enum (OUTCOME_ENGAGEMENT, OUTCOME_TRAFFIC, …) — an internal label
    // that means nothing to a non-technical client.
    document.getElementById('inspector-title').textContent = c.name || 'الحملة';
    var statusBadge =
      '<span class="badge ' + statusBadgeClass(c.status) + '" style="margin-inline-start:8px;">'
    +   escHtml(statusArabic(c.status))
    + '</span>';
    var subtitleEl = document.getElementById('inspector-subtitle');
    subtitleEl.style.direction = 'rtl';
    subtitleEl.style.textAlign = 'right';
    subtitleEl.innerHTML = 'آخر ' + (s.windowDays || 30) + ' يوم' + statusBadge;

    // ── Financial summary block ───────────────────────────────────────────
    var budgetLine =
      c.dailyBudgetMinor    != null ? fmtMinor(c.dailyBudgetMinor,    a.currencyMinorFactor, a.currency) + ' / يومياً'
    : c.lifetimeBudgetMinor != null ? fmtMinor(c.lifetimeBudgetMinor, a.currencyMinorFactor, a.currency) + ' (إجمالي)'
    : '—';

    // STANDARDIZED FINANCIAL SUMMARY — exactly 4 KPI cards, in this order:
    //   1. الإنفاق         (window spend)
    //   2. الميزانية       (daily or lifetime budget, whichever Meta returned)
    //   3. إجمالي الرسائل   (window total — INTEGER, no decimals)
    //   4. تكلفة الرسالة   (spend ÷ messages, in account currency)
    // We deliberately dropped Avg CTR, Frequency, and the combined
    // "Messages · Purchases" card: the client found them noisy and they
    // weren't tied to the Phase 1 messaging KPI.
    var freshnessAttr = state.lastSyncedAt ? ' data-freshness="' + escHtml(state.lastSyncedAt) + '"' : '';
    var kpiHtml =
      '<div class="kpi-grid" style="grid-template-columns:repeat(2, 1fr);gap:12px;margin-bottom:20px;direction:rtl;text-align:right;">'
    +   '<div class="kpi-card"><div class="kpi-label">الإنفاق <button type="button" class="info-btn" data-metric-info="spend"' + freshnessAttr + ' title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>'
    +     '<div class="kpi-value" style="font-size:18px;">' + escHtml(fmtMinor(s.spendMinor, a.currencyMinorFactor, a.currency)) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">الميزانية</div>'
    +     '<div class="kpi-value" style="font-size:14px;">' + escHtml(budgetLine) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">إجمالي الرسائل <button type="button" class="info-btn" data-metric-info="messages"' + freshnessAttr + ' title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>'
    +     '<div class="kpi-value" style="font-size:18px;">' + escHtml(fmtNum(s.messages, 0)) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">تكلفة الرسالة <button type="button" class="info-btn" data-metric-info="cost_per_messaging_conversation"' + freshnessAttr + ' title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>'
    +     '<div class="kpi-value" style="font-size:18px;">' + escHtml(s.avgCostPerMessage != null ? fmtMinor(s.avgCostPerMessage * a.currencyMinorFactor, a.currencyMinorFactor, a.currency) : '—') + '</div></div>'
    + '</div>';

    // ── Signals block ──────────────────────────────────────────────────────
    var stableMsg = '<div style="color:var(--text-3);font-size:13px;direction:rtl;text-align:right;">الأداء مستقر ولا توجد تغييرات حادة</div>';
    var posHtml = sig.positive.length === 0
      ? stableMsg
      : '<ul style="list-style:none;padding:0;margin:0;">' + sig.positive.map(function(x){ return signalLine(x, true); }).join('') + '</ul>';
    var negHtml = sig.negative.length === 0
      ? stableMsg
      : '<ul style="list-style:none;padding:0;margin:0;">' + sig.negative.map(function(x){ return signalLine(x, false); }).join('') + '</ul>';

    var signalsHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;direction:rtl;">'
    +   '<div><div style="font-weight:700;color:var(--success);margin-bottom:8px;text-align:right;">إيجابيات 🟢</div>' + posHtml + '</div>'
    +   '<div><div style="font-weight:700;color:var(--error);margin-bottom:8px;text-align:right;">سلبيات 🔴</div>' + negHtml + '</div>'
    + '</div>';

    // ── AI timeline ────────────────────────────────────────────────────────
    // The brain's raw rule outputs (action codes like KEEP_COLLECTING and
    // pattern signatures like UNDER_OBSERVATION) are *internal* — they are
    // the upstream signal that Claude CMO turns into a customer-facing
    // Arabic narration. The client should only ever see the narration.
    var narrationPendingMsg = '⏳ الذكاء الاصطناعي يحلل بيانات هذه الحملة لتقديم التوصيات...';
    var timelineEmptyMsg    = '⏳ لا توجد توصيات بعد — سيبدأ الذكاء الاصطناعي بالتحليل قريباً.';

    var timelineHtml;
    if (timeline.length === 0) {
      timelineHtml =
        '<div style="color:var(--text-3);font-size:13px;padding:12px;direction:rtl;text-align:right;border:1px dashed var(--border-2);border-radius:8px;">'
      +   escHtml(timelineEmptyMsg)
      + '</div>';
    } else {
      timelineHtml = timeline.map(function(t) {
        var narration  = t.narration || {};
        var hasArabic  = !!(narration.arabicTitle || narration.arabicNarration);

        var bodyHtml;
        if (hasArabic) {
          var titleHtml = narration.arabicTitle
            ? '<div style="font-weight:700;color:var(--text);margin-bottom:6px;">' + escHtml(narration.arabicTitle) + '</div>'
            : '';
          var narrHtml  = narration.arabicNarration
            ? '<div style="color:var(--text-2);font-size:13px;line-height:1.7;">' + escHtml(narration.arabicNarration) + '</div>'
            : '';
          bodyHtml = titleHtml + narrHtml;
        } else {
          // Narration not generated yet — friendly waiting state.
          bodyHtml = '<div style="color:var(--text-3);font-size:13px;line-height:1.7;">' + escHtml(narrationPendingMsg) + '</div>';
        }

        return '<div style="border-inline-end:2px solid var(--border-2);padding:12px 14px;margin-bottom:10px;border-radius:6px;background:var(--surface-2, rgba(255,255,255,0.02));direction:rtl;text-align:right;">'
          +    '<div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">' + escHtml(fmtDate(t.tickDate)) + '</div>'
          +    bodyHtml
          +  '</div>';
      }).join('');
    }

    var sectionHeader = function(text) {
      return '<div style="font-weight:700;color:var(--text);margin-bottom:10px;font-size:13px;direction:rtl;text-align:right;">' + escHtml(text) + '</div>';
    };

    // ── Tab payloads ─────────────────────────────────────────────────────
    // Each tab is a self-contained HTML string. We render them all up-front
    // and use CSS display toggles to switch — no re-render on tab change,
    // so the user can flip between Overview/Creatives/Audience instantly.
    var overviewHtml =
      sectionHeader('الملخص المالي') + kpiHtml
    + sectionHeader('كيف تغيّر الأداء · مقارنة بآخر 7 أيام') + signalsHtml
    + sectionHeader('سجل نصائح الذكاء الاصطناعي 🧠') + timelineHtml;

    var creativesHtml = renderCreativesTab(Array.isArray(data.creatives) ? data.creatives : []);

    // Audience tab (Pass C) — accepts the breakdowns block emitted by the
    // /inspector endpoint and renders four sections (age, gender, platform,
    // position). The renderer owns all Arabic translation of Meta vocabulary.
    var audienceHtml = renderAudienceTab(data.breakdowns || {}, a);

    document.getElementById('inspector-body').innerHTML =
        '<div data-tab-panel="overview">'  + overviewHtml  + '</div>'
      + '<div data-tab-panel="creatives" style="display:none;">' + creativesHtml + '</div>'
      + '<div data-tab-panel="audience"  style="display:none;">' + audienceHtml  + '</div>'
      + '<div data-tab-panel="investigate" style="display:none;" id="investigate-panel">'
      +   '<div class="v2-action-empty">اضغط على هذا التبويب لبدء التحقيق الشامل بالذكاء الاصطناعي.</div>'
      + '</div>';

    // Reset the active tab to Overview every time we render new data.
    switchInspectorTab('overview');
  }

  // ── AI Investigation tab (Phase 3 IFA §1) ───────────────────────────────
  // Lazy: only fetched when the tab is first opened for this campaign (an
  // LLM call, unlike the other three tabs which are plain DB reads) and
  // cached client-side per campaignId so re-clicking the tab doesn't re-fetch.
  var investigationCache = {};
  var SECTION_STATUS_LABEL = { unavailable: 'غير متاح بعد', no_data: 'لا توجد بيانات كافية' };

  function renderInvestigation(report) {
    var panel = document.getElementById('investigate-panel');
    if (!panel) return;
    panel.innerHTML = '<div style="font-size:11px;color:var(--text-3);margin-bottom:12px;direction:rtl;text-align:right;">'
      + 'تم إجراء هذا التحقيق ' + new Date(report.generatedAt).toLocaleString('ar') + '</div>'
      + report.sections.map(function (s) {
          var badge = s.status !== 'ok'
            ? '<span class="badge badge-gray" style="margin-inline-start:8px;">' + (SECTION_STATUS_LABEL[s.status] || s.status) + '</span>'
            : '';
          return '<div class="strategy-card ' + (s.status === 'ok' ? 'medium' : 'low') + '" style="margin-bottom:10px;direction:rtl;text-align:right;">'
            + '<div class="strategy-head"><div class="strategy-title">' + escHtml(s.title) + badge + '</div></div>'
            + '<div class="strategy-body">' + escHtml(s.narrative) + '</div>'
          + '</div>';
        }).join('');
  }

  async function loadInvestigation(campaignId) {
    var panel = document.getElementById('investigate-panel');
    if (!panel) return;
    if (investigationCache[campaignId]) { renderInvestigation(investigationCache[campaignId]); return; }
    panel.innerHTML = '<div class="v2-action-empty">جارٍ إجراء التحقيق الشامل… قد يستغرق ذلك حتى 30 ثانية.</div>';
    try {
      var report = await apiFetch(
        '/api/workspaces/' + state.workspaceId + '/campaigns/' + encodeURIComponent(campaignId) + '/investigate',
        { method: 'POST' },
      );
      investigationCache[campaignId] = report;
      renderInvestigation(report);
    } catch (err) {
      panel.innerHTML = '<div class="alert alert-error" style="direction:rtl;text-align:right;">تعذّر إجراء التحقيق: '
        + escHtml(friendlyApiError(err)) + '</div>';
    }
  }

  /**
   * Render the Creatives tab — a responsive grid of Ad cards. Each card
   * shows the thumbnail (or a 🎨 fallback), the Ad name + status badge,
   * and the first non-empty copy field (headline → primaryText → description).
   * Cards are tied to the AD, not the creative, so when many ads share one
   * creative the user sees each ad individually (which is what they read
   * on Meta Ads Manager too).
   */
  function renderCreativesTab(creatives) {
    if (!creatives.length) {
      return ''
        + '<div style="border:1px dashed var(--border-2);border-radius:10px;padding:32px;text-align:center;direction:rtl;color:var(--text-3);">'
        +   '<div style="font-size:32px;margin-bottom:8px;">🎨</div>'
        +   '<div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:6px;">لا توجد إبداعات بعد</div>'
        +   '<div style="font-size:13px;line-height:1.7;">ستظهر هنا صور وفيديوهات الإعلانات بمجرد اكتمال مزامنة بيانات الحملة من Meta.</div>'
        + '</div>';
    }

    var cardsHtml = creatives.map(function(item) {
      var creative = item.creative || {};
      var copy = creative.headline || creative.primaryText || creative.description || '';
      var fallbackEmoji = creative.videoId ? '🎬' : '🖼️';

      // Real <img> (lazy + no-referrer) so we can fall back gracefully when the
      // (expiring) Meta CDN link 404s; CSS background-image had no error hook.
      var thumbInner = creative.thumbnailUrl
        ? '<div class="meta-img-placeholder"></div>'
          + '<img class="inspector-creative-img meta-img-loading" src="' + escAttr(creative.thumbnailUrl) + '"'
          + ' alt="' + escAttr(item.adName || '') + '" loading="lazy" referrerpolicy="no-referrer"'
          + ' onload="creativeImgLoaded(this)" onerror="creativeImgFailed(this)">'
          + '<div class="inspector-creative-fallback meta-img-fallback" style="display:none;">' + fallbackEmoji + '</div>'
        : '<div class="inspector-creative-fallback meta-img-fallback">' + fallbackEmoji + '</div>';
      var videoBadge = creative.videoId
        ? '<span class="inspector-creative-video-badge">▶ فيديو</span>'
        : '';

      var statusBadge =
          '<span class="badge ' + statusBadgeClass(item.status) + '" style="font-size:11px;">'
        +   escHtml(statusArabic(item.status))
        + '</span>';

      var copyHtml = copy
        ? '<div style="color:var(--text-3);font-size:12px;line-height:1.6;direction:rtl;text-align:right;'
          + 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">'
          +   escHtml(copy)
          + '</div>'
        : '<div style="color:var(--text-3);font-size:12px;direction:rtl;text-align:right;font-style:italic;">—</div>';

      return ''
        + '<div class="inspector-creative-card">'
        +   '<div class="inspector-creative-thumb">' + thumbInner + videoBadge + '</div>'
        +   '<div style="padding:12px;display:flex;flex-direction:column;gap:8px;">'
        +     '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;direction:rtl;">'
        +       '<div style="font-weight:700;color:var(--text);font-size:13px;direction:rtl;text-align:right;'
        +         'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">'
        +         escHtml(item.adName || '(بدون اسم)')
        +       '</div>'
        +       statusBadge
        +     '</div>'
        +     copyHtml
        +   '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;direction:rtl;">'
      +   cardsHtml
      + '</div>';
  }

  // ── Arabic translation maps for Meta breakdown vocabulary ────────────────
  //
  // The API returns raw Meta values ("male", "facebook", "feed", …) verbatim
  // — that is the cordon discipline: translation is a presentation concern,
  // not a data concern. These maps run only at render time. Unknown values
  // fall through to the raw string so a new Meta enum value never produces
  // a blank UI label — the operator sees the raw enum and can extend the
  // map in a follow-up.
  var BREAKDOWN_LABEL_AR = {
    age:                'حسب العمر',
    gender:             'حسب الجنس',
    publisher_platform: 'حسب المنصة',
    platform_position:  'حسب الموضع',
  };
  // age values like "18-24" / "25-34" are already universal — pass through.
  var GENDER_AR = {
    male:    'ذكر',
    female:  'أنثى',
    unknown: 'غير محدد',
  };
  var PLATFORM_AR = {
    facebook:         'فيسبوك',
    instagram:        'إنستغرام',
    messenger:        'ماسنجر',
    audience_network: 'شبكة الجمهور',
    threads:          'ثريدز',
    whatsapp:         'واتساب',
  };
  var POSITION_AR = {
    feed:                  'آخر الأخبار',
    facebook_stories:      'ستوريز فيسبوك',
    instagram_stories:     'ستوريز إنستغرام',
    instagram_explore:     'استكشاف إنستغرام',
    instagram_reels:       'ريلز إنستغرام',
    facebook_reels:        'ريلز فيسبوك',
    reels:                 'ريلز',
    instream_video:        'فيديو ضمن المحتوى',
    marketplace:           'ماركت بليس',
    right_hand_column:     'العمود الأيمن',
    video_feeds:           'موجز الفيديو',
    search:                'البحث',
    messenger_inbox:       'صندوق ماسنجر',
    messenger_stories:     'ستوريز ماسنجر',
    biz_disco_feed:        'موجز الاستكشاف التجاري',
    rewarded_video:        'الفيديو المُكافأ',
  };
  function translateBreakdownValue(key, value) {
    if (value == null) return '—';
    var raw = String(value);
    if (key === 'gender')             return GENDER_AR[raw]   || raw;
    if (key === 'publisher_platform') return PLATFORM_AR[raw] || raw;
    if (key === 'platform_position')  return POSITION_AR[raw] || raw;
    return raw;                       // age, and unknown dimensions
  }

  /**
   * Render the Audience tab — four stacked sections, one per breakdown
   * dimension. Each section is a list of segments sorted by spend-desc (the
   * heaviest first), with a horizontal proportional bar and three numbers:
   * spend, messages, and cost-per-message. Cost-per-message comes from
   * window totals (Σspend / Σmessages), not from a mean of daily rates —
   * the API already enforces that contract.
   *
   * Empty-state handling: each dimension can be empty independently (Meta
   * sometimes refuses certain breakdowns on certain objectives). We render
   * only the dimensions that returned data; if none did, a single friendly
   * placeholder explains that the breakdown sync is still warming up.
   */
  function renderAudienceTab(breakdowns, account) {
    var ORDER = ['age', 'gender', 'publisher_platform', 'platform_position'];
    var sections = [];

    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      var rows = Array.isArray(breakdowns[key]) ? breakdowns[key] : [];
      if (!rows.length) continue;

      // Bar widths are proportional to spend within THIS dimension only —
      // cross-dimension comparison would be misleading because Meta returns
      // the same totals sliced different ways.
      var maxSpend = 0;
      for (var k = 0; k < rows.length; k++) {
        var sN = Number(rows[k].spendMinor || 0);
        if (sN > maxSpend) maxSpend = sN;
      }

      var rowsHtml = rows.map(function(r) {
        var labelAr   = translateBreakdownValue(key, r.value);
        var spendText = fmtMinor(r.spendMinor, account.currencyMinorFactor, account.currency);
        var msgText   = fmtNum(Number(r.messages || 0), 0);
        // costPerMessage is in MAJOR units (see /inspector contract); multiply
        // back into minor units so fmtMinor can do its division consistently.
        var cpm       = r.costPerMessage != null
          ? fmtMinor(Number(r.costPerMessage) * account.currencyMinorFactor, account.currencyMinorFactor, account.currency)
          : '—';
        var ctrText   = r.ctrPct != null ? fmtNum(r.ctrPct, 2) + '%' : '—';
        var widthPct  = maxSpend > 0 ? Math.max(2, Math.round((Number(r.spendMinor) / maxSpend) * 100)) : 2;

        // Winning segment styling: emerald gradient + small Arabic badge.
        // The bar fill swaps; the row container also gets a subtle green
        // tint so the highlight reads even on very short bars. We keep the
        // text colors unchanged so contrast stays accessible.
        var isWinner   = !!r.isWinner;
        var barFill    = isWinner
          ? 'linear-gradient(90deg, #34A871, #5CC08F)'
          : 'linear-gradient(90deg, var(--accent), var(--accent-2))';
        var rowBg      = isWinner
          ? 'background:rgba(52,168,113,0.06);border:1px solid rgba(52,168,113,0.25);border-radius:8px;padding:8px 10px;'
          : '';
        var winnerBadge = isWinner
          ? '<span style="display:inline-block;background:#34A871;color:#fff;font-size:10px;font-weight:700;'
            + 'padding:1px 6px;border-radius:10px;margin-inline-start:6px;">الأفضل</span>'
          : '';

        return ''
          + '<div style="margin:10px 0;direction:rtl;text-align:right;' + rowBg + '">'
          +   '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text);margin-bottom:4px;gap:8px;flex-wrap:wrap;">'
          +     '<span style="font-weight:600;">' + escHtml(labelAr) + winnerBadge + '</span>'
          +     '<span style="color:var(--text-3);font-size:12px;">'
          +       'الرسائل: <span style="color:var(--text-2);">' + escHtml(msgText) + '</span>'
          +       ' · تكلفة الرسالة: <span style="color:var(--text-2);">' + escHtml(cpm) + '</span>'
          +       ' · تفاعل الإعلان: <span style="color:var(--text-2);">' + escHtml(ctrText) + '</span>'
          +     '</span>'
          +   '</div>'
          +   '<div style="background:var(--surface-2, rgba(255,255,255,0.04));border-radius:6px;height:18px;overflow:hidden;position:relative;">'
          +     '<div style="background:' + barFill + ';height:100%;width:' + widthPct + '%;border-radius:6px;"></div>'
          +     '<div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 8px;font-size:11px;color:var(--text);font-weight:600;">'
          +       escHtml(spendText)
          +     '</div>'
          +   '</div>'
          + '</div>';
      }).join('');

      sections.push(''
        + '<div style="margin-bottom:18px;">'
        +   '<div style="font-weight:700;color:var(--text);margin-bottom:8px;font-size:13px;direction:rtl;text-align:right;">'
        +     escHtml(BREAKDOWN_LABEL_AR[key] || key)
        +   '</div>'
        +   rowsHtml
        + '</div>');
    }

    if (!sections.length) {
      return ''
        + '<div style="border:1px dashed var(--border-2);border-radius:10px;padding:32px;text-align:center;direction:rtl;color:var(--text-3);">'
        +   '<div style="font-size:32px;margin-bottom:8px;">👥</div>'
        +   '<div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:6px;">لا تتوفر بيانات الجمهور بعد</div>'
        +   '<div style="font-size:13px;line-height:1.7;">تكتمل بيانات الفئات بعد أول مزامنة كاملة. حاول العودة بعد قليل.</div>'
        + '</div>';
    }

    return '<div style="direction:rtl;text-align:right;">' + sections.join('') + '</div>';
  }

  /**
   * Show one tab panel, hide the rest, and update the active styling on
   * the tab buttons. Cheap: queries inside the modal only, no API calls.
   */
  function switchInspectorTab(name) {
    var tabs = document.querySelectorAll('#inspector-tabs .inspector-tab');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t.dataset.tab === name) t.classList.add('is-active');
      else t.classList.remove('is-active');
    }
    var panels = document.querySelectorAll('#inspector-body [data-tab-panel]');
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      p.style.display = (p.getAttribute('data-tab-panel') === name) ? '' : 'none';
    }
  }

  function showInspectorModal() { document.getElementById('campaign-inspector-modal').style.display = 'flex'; }
  function hideInspectorModal() { document.getElementById('campaign-inspector-modal').style.display = 'none'; }

  async function openInspector(campaignId) {
    if (!state.workspaceId || !campaignId) return;
    state.currentInspectorCampaignId = campaignId;
    document.getElementById('inspector-title').textContent = 'تفاصيل الحملة';
    var subtitleEl = document.getElementById('inspector-subtitle');
    subtitleEl.style.direction = 'rtl';
    subtitleEl.style.textAlign = 'right';
    subtitleEl.textContent = 'جارٍ التحميل…';
    document.getElementById('inspector-body').innerHTML =
      '<div style="text-align:center;color:var(--text-3);padding:24px;direction:rtl;">جارٍ تحميل البيانات…</div>';
    // Always start a fresh open on the Overview tab so the user lands on
    // the financial summary they expect, not whatever tab they left open.
    switchInspectorTab('overview');
    showInspectorModal();
    try {
      var data = await apiFetch('/api/workspaces/' + state.workspaceId + '/campaigns/' + encodeURIComponent(campaignId) + '/inspector?days=30');
      try {
        renderInspector(data);
      } catch (renderErr) {
        console.error('[campaigns] inspector render failed:', renderErr);
        document.getElementById('inspector-body').innerHTML =
          '<div class="section-fallback" style="direction:rtl;">تعذّر عرض تفاصيل الحملة — حاول مرة أخرى.</div>';
      }
    } catch (err) {
      document.getElementById('inspector-body').innerHTML =
        '<div class="alert alert-error" style="direction:rtl;text-align:right;">تعذّر تحميل البيانات: ' + escHtml(friendlyApiError(err)) + '</div>';
    }
  }

  // ── Data refresh (after sync or manual reload) ────────────────────────────
  async function loadCampaignData() {
    var workspaceId = state.workspaceId;
    if (!workspaceId) return;

    var results = await Promise.all([
      apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/campaigns?days=' + state.days, {}, 12000),
      apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/insights?days=90', {}, 12000),
      apiFetchWithTimeout('/api/workspaces/' + workspaceId, {}, 8000).catch(function() { return null; }),
      apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/issue-dates?days=30', {}, 8000).catch(function() { return []; }),
    ]);
    var campaigns = results[0];
    var insights = results[1];
    var wsData = results[2];
    state.lastIssueDates = Array.isArray(results[3]) ? results[3] : [];

    var primary = wsData && Array.isArray(wsData.adAccounts) && wsData.adAccounts[0];
    if (primary) {
      if (primary.currency) state.currency = primary.currency;
      if (primary.currency === 'IQD') {
        state.minorFactor = 1;
      } else if (primary.currencyMinorFactor != null && Number(primary.currencyMinorFactor) > 0) {
        state.minorFactor = Number(primary.currencyMinorFactor);
      }
    }

    state.campaigns = Array.isArray(campaigns) ? campaigns : [];
    state.insights = Array.isArray(insights) ? insights : [];

    applyFilters();
    updateSummary(state.campaigns, state.insights);
    updateCharts(state.insights);
    renderFreshnessStrip(state.insights);
  }

  function toastWithReconnect(err) {
    var container = document.getElementById('toast-container');
    var msg = friendlyApiError(err);
    if (!container) {
      toast(msg, 'error');
      return;
    }
    var el = document.createElement('div');
    el.className = 'toast error';
    var link = err.reconnectUrl || '/workspace?connect=manual';
    var label = err.reconnectLabel || 'إعادة ربط Meta';
    el.innerHTML = escHtml(msg)
      + ' <a href="' + escHtml(link) + '" style="color:var(--accent);font-weight:600;margin-left:8px;white-space:nowrap;">'
      + escHtml(label) + ' →</a>';
    container.appendChild(el);
    setTimeout(function() { el.remove(); }, 8000);
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  // Downloads must carry the bearer token, so a plain <a href> won't work —
  // fetch with the auth header, then trigger a blob download.
  async function downloadExport(kind) {
    if (!state.workspaceId) return;
    var token = getToken();
    var path = kind === 'insights'
      ? '/api/workspaces/' + state.workspaceId + '/export/insights.csv?days=90'
      : '/api/workspaces/' + state.workspaceId + '/export/campaigns.csv';
    var stamp = new Date().toISOString().slice(0, 10);
    try {
      var res = await fetch(path, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) { toast('تعذّر تصدير الملف — حاول بعد المزامنة', 'error'); return; }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (kind === 'insights' ? 'insights-' : 'campaigns-') + stamp + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('تم تنزيل الملف', 'success');
    } catch (e) {
      toast('تعذّر تصدير الملف', 'error');
    }
  }

  async function forceSync() {
    if (!state.workspaceId) return;
    try {
      var job = await runWorkspaceSync(state.workspaceId, {
        statusContainerId: 'main-content',
        buttonSelector: '#force-sync-btn',
        body: { windowDays: 3 },
      });
      if (job) {
        toast('اكتملت المزامنة — تم تحديث ' + (job.rowsUpserted || 0) + ' صفاً', 'success');
        await loadCampaignData();
      }
    } catch (err) {
      if (err && err.code === 'TOKEN_DECRYPT_FAILED') {
        toastWithReconnect(err);
      } else if (err && err.message && err.message.indexOf('finish in the background') >= 0) {
        toast(friendlyApiError(err), 'warning');
      } else {
        toast(friendlyApiError(err), 'error');
      }
    }
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }

    // logout-btn is wired automatically by SHARED_JS on DOMContentLoaded.

    document.getElementById('date-tabs').addEventListener('click', function(e) {
      var btn = e.target.closest('.tab');
      if (btn && btn.dataset.days) setDays(Number(btn.dataset.days));
    });

    document.getElementById('search-input').addEventListener('input', function(e) {
      applyFilters();
    });

    // Sortable headers — click toggles direction on the same column,
    // switches column otherwise. Numeric columns start descending
    // (biggest spender first), text columns ascending.
    document.getElementById('campaigns-thead').addEventListener('click', function(e) {
      var th = e.target && e.target.closest && e.target.closest('.th-sort');
      if (!th) return;
      var key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = (key === 'name' || key === 'status') ? 1 : -1;
      }
      document.querySelectorAll('#campaigns-thead .th-sort').forEach(function(el) {
        el.classList.remove('is-sorted', 'asc', 'desc');
      });
      th.classList.add('is-sorted', state.sortDir === 1 ? 'asc' : 'desc');
      applyFilters();
    });

    // Status filter chips (الكل / نشطة / متوقفة).
    document.getElementById('status-filters').addEventListener('click', function(e) {
      var chip = e.target && e.target.closest && e.target.closest('.filter-chip');
      if (!chip) return;
      state.statusFilter = chip.getAttribute('data-status') || 'ALL';
      document.querySelectorAll('#status-filters .filter-chip').forEach(function(el) {
        el.classList.toggle('active', el === chip);
      });
      applyFilters();
    });

    document.getElementById('force-sync-btn').addEventListener('click', function() {
      forceSync();
    });

    // Export menu — toggle open/closed, download on item click, close on outside click.
    var exportBtn = document.getElementById('export-btn');
    var exportMenu = document.getElementById('export-menu');
    exportBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
    });
    exportMenu.addEventListener('click', function(e) {
      var item = e.target && e.target.closest && e.target.closest('.export-item');
      if (!item) return;
      exportMenu.style.display = 'none';
      downloadExport(item.getAttribute('data-export'));
    });
    document.addEventListener('click', function(e) {
      if (exportMenu.style.display !== 'none' && !document.getElementById('export-wrap').contains(e.target)) {
        exportMenu.style.display = 'none';
      }
    });

    // Delegated click for inspector — tbody is re-rendered on every search,
    // so listen on the stable container instead of the row buttons.
    document.getElementById('campaigns-tbody').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.js-inspect-btn');
      if (!btn) return;
      e.preventDefault();
      openInspector(btn.getAttribute('data-campaign-id'));
    });

    // Phone cards: the whole card is the tap target.
    document.getElementById('campaigns-cards').addEventListener('click', function(e) {
      var card = e.target && e.target.closest && e.target.closest('.camp-card');
      if (!card) return;
      openInspector(card.getAttribute('data-campaign-id'));
    });

    // Tab switching — delegated so the listener survives renderInspector()
    // overwriting #inspector-body. Idempotent: a re-render replaces panels,
    // not buttons, so the original handler stays bound.
    document.getElementById('inspector-tabs').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.inspector-tab');
      if (!btn) return;
      var name = btn.getAttribute('data-tab');
      if (!name) return;
      switchInspectorTab(name);
      if (name === 'investigate' && state.currentInspectorCampaignId) {
        loadInvestigation(state.currentInspectorCampaignId);
      }
    });

    // Close handlers: explicit button, backdrop click, and Escape key.
    document.getElementById('inspector-close').addEventListener('click', hideInspectorModal);
    document.getElementById('campaign-inspector-modal').addEventListener('click', function(e) {
      if (e.target === this) hideInspectorModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var m = document.getElementById('campaign-inspector-modal');
        if (m && m.style.display !== 'none') hideInspectorModal();
      }
    });

    try {
      var me = await apiFetch('/api/auth/me');
      var userName = me.name || me.email || 'User';
      // Shared-layout sidebar identity elements.
      document.getElementById('user-avatar').textContent = initials(userName);
      document.getElementById('user-name').textContent = userName;
      if (me.email) document.getElementById('user-email').textContent = me.email;

      var workspaceId = getWorkspaceId();
      if (!workspaceId && me.memberships && me.memberships.length > 0) {
        workspaceId = me.memberships[0].workspaceId || (me.memberships[0].workspace && me.memberships[0].workspace.id);
        if (workspaceId) setWorkspaceId(workspaceId);
      }

      if (!workspaceId) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('no-ad-account-cta').style.display = 'flex';
        renderTable([]);
        return;
      }

      state.workspaceId = workspaceId;

      await resumeActiveSyncIfAny(workspaceId, {
        statusContainerId: 'main-content',
        buttonSelector: '#force-sync-btn',
        onComplete: function() { loadCampaignData(); },
      });

      var [campaigns, insights, wsData, issueDates] = await Promise.all([
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/campaigns?days=' + state.days, {}, 12000),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/insights?days=90', {}, 12000),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId, {}, 8000).catch(function() { return null; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/issue-dates?days=30', {}, 8000).catch(function() { return []; }),
      ]);
      state.lastIssueDates = Array.isArray(issueDates) ? issueDates : [];

      // Hydrate currency context BEFORE rendering so the first paint of
      // budgets / total spend uses the correct factor. /api/workspaces/:id
      // returns adAccounts[*].{currency, currencyMinorFactor}.
      var primary = wsData && Array.isArray(wsData.adAccounts) && wsData.adAccounts[0];
      if (primary) {
        if (primary.currency) state.currency = primary.currency;
        if (primary.currency === 'IQD') {
          state.minorFactor = 1;
        } else if (primary.currencyMinorFactor != null && Number(primary.currencyMinorFactor) > 0) {
          state.minorFactor = Number(primary.currencyMinorFactor);
        }
        state.lastSyncedAt = primary.lastSyncedAt || null;
        if (state.lastSyncedAt) {
          document.querySelectorAll('.info-btn[data-metric-info]').forEach(function (btn) {
            btn.setAttribute('data-freshness', state.lastSyncedAt);
          });
        }
      }

      // Detect paused / expired token
      var allPaused = wsData && Array.isArray(wsData.adAccounts)
        && wsData.adAccounts.length > 0
        && wsData.adAccounts.every(function(a) { return a.status !== 'ACTIVE'; });

      if (allPaused) {
        document.getElementById('paused-account-cta').style.display = 'flex';
      }

      // Detect no ad account connected at all
      var hasData = (Array.isArray(campaigns) && campaigns.length > 0)
        || (Array.isArray(insights) && insights.length > 0);
      if (!hasData && !allPaused) {
        document.getElementById('no-ad-account-cta').style.display = 'flex';
      }

      state.campaigns = Array.isArray(campaigns) ? campaigns : [];
      state.insights = Array.isArray(insights) ? insights : [];

      var wsName = (wsData && wsData.name) || workspaceId;

      document.getElementById('ws-name').textContent = wsName;
      document.getElementById('page-subtitle').textContent =
        'جميع الحملات · ' + wsName;

      updateSummary(state.campaigns, state.insights);
      updateCharts(state.insights);
      renderFreshnessStrip(state.insights);
      applyFilters();

      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
      staggerReveal(['.camp-kpi-row', '#fresh-strip', '.camp-chart-grid', '.table-wrap']);

    } catch (err) {
      showError(friendlyApiError(err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'الحملات', active: 'campaigns', content, scripts });
}
