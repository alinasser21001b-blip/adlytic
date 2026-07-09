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

  <!-- Page header — brand + period only; actions live in the Ads Manager toolbar -->
  <div class="page-header flex items-center justify-between">
    <div>
      <div class="page-title">الحملات</div>
      <div class="page-subtitle" id="page-subtitle">إدارة أداء الحملات ومراجعتها</div>
    </div>
    <div class="tabs" id="date-tabs" aria-label="فترة العرض">
      <button class="tab" data-days="7">7 أيام</button>
      <button class="tab" data-days="14">14 يوماً</button>
      <button class="tab active" data-days="30">30 يوماً</button>
      <button class="tab" data-days="90">90 يوماً</button>
    </div>
  </div>

  <!-- Hero KPIs — three merchant signals only (Ads Manager clarity) -->
  <div class="camp-kpi-row camp-kpi-row--hero">
    <div class="camp-kpi" data-accent="blue">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">إنفاق الفترة <button type="button" class="info-btn" data-metric-info="spend" title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>
        <div class="camp-kpi-value" id="total-spend">—</div>
        <div class="camp-kpi-sub" id="spend-period">آخر 30 يوماً</div>
      </div>
    </div>
    <div class="camp-kpi" data-accent="green">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">حملات تعمل</div>
        <div class="camp-kpi-value" id="active-campaigns">—</div>
        <div class="camp-kpi-sub" id="active-sub"></div>
      </div>
    </div>
    <div class="camp-kpi" data-accent="amber">
      <div class="camp-kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
      </div>
      <div class="camp-kpi-body">
        <div class="camp-kpi-label">تحتاج مراجعة</div>
        <div class="camp-kpi-value" id="review-campaigns">—</div>
        <div class="camp-kpi-sub" id="review-sub"></div>
      </div>
    </div>
  </div>

  <!-- Data observer banner — shown when account-level and campaign-level totals diverge -->
  <div class="data-observer-banner" id="data-observer-banner" style="display:none;">
    <div class="observer-icon">🔍</div>
    <div class="observer-body">
      <div class="observer-title">مراقب البيانات</div>
      <div class="observer-msg" id="observer-msg"></div>
    </div>
    <button type="button" class="btn btn-sm observer-fix-btn" id="observer-fix-btn" style="display:none;">تنظيف البيانات</button>
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

  <!-- Account trends — collapsed by default so the campaigns table stays primary -->
  <details class="camp-trends" id="camp-trends">
    <summary class="camp-trends-summary">
      <span class="camp-trends-lead">
        <span class="camp-trends-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h7v7"/></svg>
        </span>
        <span class="camp-trends-copy">
          <span class="camp-trends-title">اتجاهات الحساب</span>
          <span class="camp-trends-hint">إنفاق · نتائج · كفاءة · تفاعل</span>
        </span>
      </span>
      <span class="camp-trends-action">عرض الرسوم</span>
    </summary>
    <p class="camp-trends-note">بيانات الحساب بالكامل — ليست لحملة واحدة. الأيام بلا مزامنة تظهر كفجوة وليست صفراً.</p>
    <div class="camp-chart-grid camp-chart-grid--perf">
      <div class="chart-card" id="spend-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">الإنفاق اليومي</div>
          <div class="chart-card-sub">كم أنفقت كل يوم</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-spend"></canvas>
          <div class="chart-empty" id="chart-spend-empty" style="display:none;">لا توجد بيانات إنفاق في هذه الفترة</div>
        </div>
      </div>
      <div class="chart-card" id="results-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">النتائج اليومية</div>
          <div class="chart-card-sub">رسائل + مشتريات + عملاء محتملون</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-results"></canvas>
          <div class="chart-empty" id="chart-results-empty" style="display:none;">لا توجد نتائج في هذه الفترة</div>
        </div>
      </div>
      <div class="chart-card" id="cpr-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">تكلفة النتيجة</div>
          <div class="chart-card-sub">الإنفاق ÷ النتائج · فارغ إن لم تُسجَّل نتيجة</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-cpr"></canvas>
          <div class="chart-empty" id="chart-cpr-empty" style="display:none;">لا توجد تكلفة نتيجة في هذه الفترة</div>
        </div>
      </div>
      <div class="chart-card" id="cpm-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">تكلفة الألف ظهور (CPM)</div>
          <div class="chart-card-sub">كفاءة التوصيل · هل يرتفع سعر الظهور؟</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-cpm"></canvas>
          <div class="chart-empty" id="chart-cpm-empty" style="display:none;">لا توجد بيانات CPM في هذه الفترة</div>
        </div>
      </div>
      <div class="chart-card" id="ctr-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">نسبة النقر (CTR)</div>
          <div class="chart-card-sub">جودة التفاعل مع الإعلان</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-ctr"></canvas>
          <div class="chart-empty" id="chart-ctr-empty" style="display:none;">لا توجد بيانات تفاعل في هذه الفترة</div>
        </div>
      </div>
      <div class="chart-card" id="freq-chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">التكرار اليومي</div>
          <div class="chart-card-sub">متوسط مرات الظهور لنفس الشخص · مؤشر إرهاق</div>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-frequency"></canvas>
          <div class="chart-empty" id="chart-frequency-empty" style="display:none;">لا توجد بيانات تكرار في هذه الفترة</div>
        </div>
      </div>
    </div>
  </details>

  <!-- Campaigns table — Ads Manager style: toolbar first, then rows -->
  <div class="table-wrap camp-manager">
    <div class="camp-toolbar">
      <div class="camp-toolbar-start">
        <div class="table-title">قائمة الحملات</div>
        <span class="camp-result-count" id="camp-result-count"></span>
      </div>
      <div class="camp-toolbar-controls">
        <label class="camp-field">
          <span class="camp-field-label">حالة التسليم</span>
          <select id="status-filter-select" class="camp-select" aria-label="تصفية حسب حالة التسليم">
            <option value="DELIVERING">تعمل</option>
            <option value="TODAY">تنفق اليوم</option>
            <option value="REVIEW">تحتاج مراجعة</option>
            <option value="PAUSED">متوقفة</option>
            <option value="ARCHIVED">أرشيف</option>
            <option value="ALL">الكل</option>
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">الترتيب</span>
          <select id="sort-preset-select" class="camp-select" aria-label="ترتيب القائمة">
            <option value="attention">الأهم أولاً</option>
            <option value="spend">الأعلى إنفاقاً</option>
            <option value="results">الأكثر نتائج</option>
            <option value="cost">الأقل تكلفة نتيجة</option>
            <option value="engagement">الأفضل تفاعلاً</option>
          </select>
        </label>
        <div class="search-wrap camp-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث باسم الحملة…" style="width:220px;">
        </div>
        <div class="display-mode-toggle" id="display-mode-toggle">
          <button type="button" class="view-btn active" data-view="table" title="عرض جدول" aria-label="عرض جدول">☰</button>
          <button type="button" class="view-btn" data-view="cards" title="عرض بطاقات" aria-label="عرض بطاقات">▦</button>
        </div>
        <div style="position:relative;" id="export-wrap">
          <button type="button" class="btn btn-ghost btn-sm" id="export-btn" title="تصدير البيانات كملف CSV">تصدير</button>
          <div id="export-menu" style="display:none;position:absolute;top:calc(100% + 6px);inset-inline-end:0;z-index:50;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);padding:6px;min-width:200px;">
            <button type="button" class="export-item" data-export="campaigns" style="display:block;width:100%;text-align:start;background:none;border:none;color:var(--text);font:inherit;padding:9px 12px;border-radius:7px;cursor:pointer;">قائمة الحملات (CSV)</button>
            <button type="button" class="export-item" data-export="insights" style="display:block;width:100%;text-align:start;background:none;border:none;color:var(--text);font:inherit;padding:9px 12px;border-radius:7px;cursor:pointer;">الأداء اليومي (CSV)</button>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm js-sync-trigger" id="force-sync-btn" title="مزامنة أحدث البيانات من Meta">تحديث</button>
      </div>
    </div>
    <div class="sort-hint" id="sort-hint">الترتيب: الأهم أولاً — تنفق الآن، ثم تحتاج مراجعة، ثم الأعلى إنفاقاً</div>
    <div style="overflow-x:auto;" id="table-container">
      <table class="camp-table">
        <thead id="campaigns-thead">
          <tr>
            <th class="th-sort" data-sort="name">الحملة</th>
            <th class="th-sort" data-sort="deliveryRank">حالة التسليم</th>
            <th class="th-sort" data-sort="spendWindowMinor">الإنفاق <span id="window-label" class="th-window">(30ي)</span></th>
            <th>الاتجاه <span class="th-window">(7ي)</span></th>
            <th class="th-sort" data-sort="resultsWindow">النتائج</th>
            <th class="th-sort" data-sort="costPerResult">تكلفة النتيجة</th>
            <th class="th-sort" data-sort="ctrWindow">تفاعل الإعلان</th>
            <th class="th-sort" data-sort="dailyBudget">الميزانية</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="campaigns-tbody">
          <tr><td colspan="9" style="color:var(--text-3);text-align:center;padding:24px;">جارٍ التحميل…</td></tr>
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

    /* ── Ads Manager hero KPIs ─────────────────────────────────────────── */
    .camp-kpi-row--hero { grid-template-columns: repeat(3, 1fr); }

    /* ── Collapsible account trends (high-contrast control) ───────────── */
    .camp-trends {
      background: linear-gradient(180deg, rgba(217,167,89,0.08), transparent 70%), var(--surface);
      border: 1px solid rgba(217,167,89,0.38);
      border-radius: var(--radius-lg); margin-bottom: 20px; overflow: hidden;
      box-shadow: 0 0 0 1px rgba(217,167,89,0.08);
    }
    .camp-trends-summary {
      list-style: none; cursor: pointer; display: flex; align-items: center;
      justify-content: space-between; gap: 14px; padding: 15px 18px;
      font-size: 14px; font-weight: 700; color: var(--text); direction: rtl;
      user-select: none; transition: background .15s, border-color .15s;
    }
    .camp-trends-summary::-webkit-details-marker { display: none; }
    .camp-trends-summary:hover {
      background: rgba(217,167,89,0.10);
    }
    .camp-trends-summary:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .camp-trends-lead {
      display: flex; align-items: center; gap: 12px; min-width: 0;
    }
    .camp-trends-icon {
      flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      background: rgba(217,167,89,0.16); color: var(--accent-2);
      border: 1px solid rgba(217,167,89,0.35);
    }
    .camp-trends-icon svg { width: 18px; height: 18px; }
    .camp-trends-copy {
      display: flex; flex-direction: column; gap: 3px; min-width: 0;
    }
    .camp-trends-title {
      font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em;
    }
    .camp-trends-hint {
      font-size: 12px; font-weight: 600; color: var(--text-2); line-height: 1.35;
    }
    .camp-trends-action {
      flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px;
      font-size: 12.5px; font-weight: 800; color: var(--accent-2);
      background: rgba(217,167,89,0.14); border: 1px solid rgba(217,167,89,0.42);
      padding: 8px 12px; border-radius: 999px; white-space: nowrap;
    }
    .camp-trends-action::after {
      content: ''; width: 7px; height: 7px;
      border-inline-end: 2px solid currentColor; border-bottom: 2px solid currentColor;
      transform: rotate(45deg); margin-top: -3px; transition: transform .15s;
    }
    .camp-trends[open] {
      border-color: rgba(217,167,89,0.55);
      box-shadow: 0 0 0 1px rgba(217,167,89,0.12);
    }
    .camp-trends[open] .camp-trends-summary {
      border-bottom: 1px solid rgba(217,167,89,0.22);
      background: rgba(217,167,89,0.07);
    }
    .camp-trends[open] .camp-trends-action {
      color: var(--text);
      background: rgba(255,255,255,0.06);
      border-color: var(--border-2);
    }
    .camp-trends[open] .camp-trends-action::after {
      transform: rotate(225deg); margin-top: 3px;
    }
    .camp-trends .camp-chart-grid { padding: 0 16px 16px; margin-bottom: 0; }
    .camp-chart-grid--perf { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .camp-trends-note {
      margin: 0 16px 12px; padding: 0;
      font-size: 11.5px; color: var(--text-3); line-height: 1.45; direction: rtl;
    }
    .chart-card-sub {
      font-size: 11px; color: var(--text-3); margin-top: 2px; font-weight: 500; line-height: 1.35;
    }
    .insp-chart-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .insp-chart-grid .chart-canvas-wrap {
      height: 160px; max-height: 160px; min-height: 160px;
    }
    @media (max-width: 900px) {
      .camp-chart-grid--perf, .insp-chart-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .camp-trends-hint { display: none; }
      .camp-trends-action { padding: 7px 10px; font-size: 12px; }
    }

    /* ── Data observer banner ─────────────────────────────────────────── */
    .data-observer-banner {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 14px 18px; margin-bottom: 16px;
      direction: rtl;
    }
    .data-observer-banner.warn { border-color: rgba(245,166,35,0.4); background: rgba(245,166,35,0.06); }
    .data-observer-banner.ok { border-color: rgba(52,168,113,0.4); background: rgba(52,168,113,0.06); }
    .observer-icon { font-size: 20px; flex-shrink: 0; }
    .observer-body { flex: 1; min-width: 0; }
    .observer-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
    .observer-msg { font-size: 12px; color: var(--text-3); line-height: 1.5; }
    .observer-fix-btn { font-size: 11px; white-space: nowrap; background: rgba(245,166,35,0.15); color: var(--accent); border: 1px solid rgba(245,166,35,0.3); border-radius: 6px; padding: 5px 12px; cursor: pointer; }
    .observer-fix-btn:hover { background: rgba(245,166,35,0.25); }

    /* ── Chart empty state ────────────────────────────────────────────── */
    .chart-empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: var(--text-3); font-size: 13px; text-align: center; direction: rtl;
      background: var(--surface); border-radius: 8px;
    }
    .camp-kpi-sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }

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

    /* ── Ads Manager toolbar ──────────────────────────────────────────── */
    .camp-manager .camp-toolbar {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; padding: 16px 18px 12px; border-bottom: 1px solid var(--border);
      direction: rtl;
    }
    .camp-toolbar-start { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
    .camp-result-count { font-size: 12px; color: var(--text-3); font-weight: 600; }
    .camp-toolbar-controls {
      display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; justify-content: flex-start;
    }
    .camp-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .camp-field-label {
      font-size: 10.5px; font-weight: 700; color: var(--text-3);
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .camp-select {
      appearance: none; -webkit-appearance: none;
      background: var(--surface-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23746A5C' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat left 10px center;
      color: var(--text); border: 1px solid var(--border-2); border-radius: 8px;
      padding: 8px 12px 8px 28px; font: inherit; font-size: 12.5px; font-weight: 600;
      min-width: 148px; cursor: pointer; direction: rtl;
    }
    .camp-select:focus { outline: none; border-color: rgba(217,167,89,0.55); }
    .camp-search { align-self: flex-end; }
    .sort-hint {
      font-size: 11.5px; color: var(--text-3); padding: 0 18px 10px;
      direction: rtl; line-height: 1.4;
    }
    .delivery-status {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
      white-space: nowrap; direction: rtl;
    }
    .delivery-status .dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: currentColor;
    }
    .delivery-status.today { background: rgba(217,167,89,0.16); color: var(--accent-2); }
    .delivery-status.delivering { background: rgba(52,168,113,0.14); color: var(--success); }
    .delivery-status.dormant { background: rgba(199,122,31,0.14); color: #C77A1F; }
    .delivery-status.paused { background: rgba(116,106,92,0.16); color: var(--text-3); }
    .delivery-status.archived { background: rgba(116,106,92,0.12); color: var(--text-3); }
    .display-mode-toggle { display: flex; gap: 4px; align-self: flex-end; }
    .view-btn {
      width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text-3); cursor: pointer; font-size: 14px;
    }
    .view-btn.active { color: var(--accent-2); border-color: rgba(217,167,89,0.45); background: var(--accent-dim); }
    .action-group { display: flex; gap: 6px; flex-wrap: wrap; }
    .camp-cards-only .table-wrap table,
    .camp-cards-only #table-container { display: none !important; }
    .camp-table-only #campaigns-cards { display: none !important; }
    .th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
    .th-sort:hover { color: var(--text); }
    .th-sort::after { content: '↕'; opacity: 0.35; margin-inline-start: 5px; font-size: 10px; }
    .th-sort.is-sorted.desc::after { content: '↓'; opacity: 1; color: var(--accent); }
    .th-sort.is-sorted.asc::after  { content: '↑'; opacity: 1; color: var(--accent); }
    .th-window { font-weight: 400; color: var(--text-3); font-size: 10.5px; }
    .cell-name { font-weight: 600; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    .camp-table td, .camp-table th { vertical-align: middle; }
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
    .camp-card[data-delivery="DELIVERING_TODAY"] { border-inline-start-color: var(--accent); }
    .camp-card[data-delivery="DELIVERING_WINDOW"] { border-inline-start-color: var(--success); }
    .camp-card[data-delivery="DORMANT_ACTIVE"] { border-inline-start-color: #C77A1F; }
    .camp-card[data-delivery="PAUSED"],
    .camp-card[data-delivery="ARCHIVED"] { border-inline-start-color: var(--text-3); }
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
    @media (max-width: 900px) {
      .camp-kpi-row--hero { grid-template-columns: 1fr; }
      .camp-toolbar-controls { width: 100%; }
      .camp-select, .camp-search .search-input { width: 100%; min-width: 0; }
      .camp-search { width: 100%; }
      .camp-search .search-input { width: 100% !important; }
    }
    @media (max-width: 768px) {
      /* Inline display:block from renderTable would beat a plain rule. */
      #table-container { display: none !important; }
      .camp-cards { display: flex; flex-direction: column; gap: 10px; }
      .camp-manager .camp-toolbar { flex-direction: column; align-items: stretch; }
      /* Header: actions wrap under the title instead of overflowing. */
      .page-header.flex { flex-direction: column; align-items: stretch; gap: 12px; }
      #date-tabs { width: 100%; display: flex; }
      #date-tabs .tab { flex: 1; }
      .camp-chart-grid { grid-template-columns: 1fr; }
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

    /* ── Inspector overview — Meta-style purpose-first layout ─────────── */
    .insp-meta {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      direction: rtl; margin-bottom: 4px;
    }
    .insp-meta-window {
      font-size: 12.5px; color: var(--text-3); font-weight: 500;
    }
    .insp-purpose {
      display: flex; align-items: flex-start; gap: 12px;
      direction: rtl; text-align: right;
      padding: 12px 14px; margin: 14px 0 18px;
      border-radius: 12px;
      border: 1px solid rgba(212, 175, 55, 0.22);
      background: linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.02));
    }
    .insp-purpose-mark {
      width: 4px; align-self: stretch; border-radius: 4px;
      background: var(--grad-accent, linear-gradient(180deg, var(--accent), var(--accent-2)));
      flex-shrink: 0;
    }
    .insp-purpose-title {
      font-size: 12px; font-weight: 700; color: var(--accent);
      letter-spacing: 0.02em; margin-bottom: 4px;
    }
    .insp-purpose-text {
      font-size: 13px; color: var(--text-2); line-height: 1.65;
    }
    .insp-section {
      margin-bottom: 22px; direction: rtl; text-align: right;
    }
    .insp-section-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 10px; margin-bottom: 12px;
    }
    .insp-section-title {
      font-size: 13px; font-weight: 700; color: var(--text);
    }
    .insp-section-hint {
      font-size: 11.5px; color: var(--text-3); font-weight: 500;
    }
    .insp-primary {
      display: grid; grid-template-columns: 1.15fr 1fr; gap: 12px;
      margin-bottom: 12px;
    }
    .insp-metric {
      position: relative; overflow: hidden;
      background: var(--surface);
      background-image: var(--grad-surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
      transition: border-color .15s, box-shadow .15s;
    }
    .insp-metric:hover { border-color: var(--border-2); box-shadow: var(--shadow-lg); }
    .insp-metric.is-hero {
      border-color: rgba(212, 175, 55, 0.28);
      background-image: linear-gradient(160deg, rgba(212,175,55,0.07), transparent 55%), var(--grad-surface);
    }
    .insp-metric-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11.5px; font-weight: 600; color: var(--text-3);
      letter-spacing: 0.04em; margin-bottom: 10px;
    }
    .insp-metric-value {
      font-size: 26px; font-weight: 700; color: var(--text);
      letter-spacing: -0.4px; line-height: 1.15;
      font-feature-settings: 'tnum'; direction: ltr; unicode-bidi: embed;
    }
    .insp-metric.is-hero .insp-metric-value { font-size: 30px; }
    .insp-metric-sub {
      margin-top: 8px; font-size: 12px; color: var(--text-3); line-height: 1.45;
    }
    .insp-secondary {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    }
    .insp-metric.is-secondary {
      padding: 14px 16px; border-radius: 12px;
    }
    .insp-metric.is-secondary .insp-metric-value { font-size: 18px; }
    .insp-signals {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    }
    .insp-signal-card {
      border: 1px solid var(--border-2);
      border-radius: 12px;
      padding: 14px 14px 12px;
      background: var(--surface-2, rgba(255,255,255,0.02));
      min-height: 88px;
    }
    .insp-signal-card.is-pos { border-color: rgba(52,168,113,0.28); }
    .insp-signal-card.is-neg { border-color: rgba(220,80,80,0.28); }
    .insp-signal-head {
      display: flex; align-items: center; gap: 8px;
      font-size: 12.5px; font-weight: 700; margin-bottom: 10px;
    }
    .insp-signal-head.is-pos { color: var(--success); }
    .insp-signal-head.is-neg { color: var(--error); }
    .insp-signal-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .insp-signal-dot.is-pos { background: var(--success); }
    .insp-signal-dot.is-neg { background: var(--error); }
    .insp-signal-empty {
      font-size: 13px; color: var(--text-3); line-height: 1.6;
    }
    .insp-signal-list { list-style: none; padding: 0; margin: 0; }
    .insp-signal-list li {
      margin: 0 0 8px; color: var(--text-2); font-size: 13px; line-height: 1.5;
    }
    .insp-signal-list li:last-child { margin-bottom: 0; }
    .insp-stable {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-radius: 12px;
      border: 1px solid var(--border-2);
      background: var(--surface-2, rgba(255,255,255,0.02));
      color: var(--text-2); font-size: 13.5px; line-height: 1.55;
    }
    .insp-stable-icon {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(52,168,113,0.12); color: var(--success);
      font-size: 14px; font-weight: 700; flex-shrink: 0;
    }
    .insp-timeline-item {
      border-inline-end: 2px solid rgba(212,175,55,0.35);
      padding: 14px 16px; margin-bottom: 10px; border-radius: 10px;
      background: var(--surface-2, rgba(255,255,255,0.02));
      direction: rtl; text-align: right;
    }
    .insp-timeline-date {
      font-size: 11.5px; color: var(--text-3); margin-bottom: 8px; font-weight: 600;
    }
    .insp-timeline-title {
      font-weight: 700; color: var(--text); margin-bottom: 6px; font-size: 14px;
    }
    .insp-timeline-body {
      color: var(--text-2); font-size: 13px; line-height: 1.7;
    }
    .insp-empty-panel {
      color: var(--text-3); font-size: 13px; padding: 16px;
      direction: rtl; text-align: right;
      border: 1px dashed var(--border-2); border-radius: 10px;
      line-height: 1.65;
    }
    @media (max-width: 640px) {
      .insp-primary, .insp-secondary, .insp-signals { grid-template-columns: 1fr; }
      .insp-metric.is-hero .insp-metric-value { font-size: 26px; }
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
        <button class="inspector-tab"           data-tab="investigate" role="tab" type="button">تحقيق شامل</button>
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
    resultsChart: null,
    frequencyChart: null,
    cpmChart: null,
    cprChart: null,
    inspSpendChart: null,
    inspResultsChart: null,
    inspEffChart: null,
    workspaceId: null,
    // Currency context — hydrated from /api/workspaces/:id once it returns.
    // Defaults are safe for the common case (USD-style 2-decimal currencies).
    currency: 'USD',
    minorFactor: 100,
    lastSyncedAt: null,
    lastIssueDates: [],
    currentInspectorCampaignId: null,
    // SaaS default: attention-first (live spend → needs review → spend),
    // with simple presets for spend / results / engagement.
    sortPreset: 'attention',
    sortKey: 'attentionScore',
    sortDir: -1,
    statusFilter: 'DELIVERING',
    displayMode: 'table',
  };

  // ── Chart helpers ─────────────────────────────────────────────────────────
  function makeGradient(ctx, canvasH, r, g, b) {
    var grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0,   'rgba(' + r + ',' + g + ',' + b + ', 0.45)');
    grad.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ', 0.15)');
    grad.addColorStop(1,   'rgba(' + r + ',' + g + ',' + b + ', 0.02)');
    return grad;
  }

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

  var chartResizeBound = false;
  var CHART_CARD_H = 220;
  var INSP_CHART_H = 160;

  function lockChartBox(canvasId, heightPx) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    var box = canvas.parentElement;
    box.style.height = heightPx + 'px';
    box.style.maxHeight = heightPx + 'px';
    box.style.minHeight = heightPx + 'px';
    box.style.overflow = 'hidden';
  }

  function destroyChartInstance(chart) {
    if (chart) {
      try { chart.destroy(); } catch (e) {}
    }
  }

  function bindChartResize() {
    if (chartResizeBound) return;
    chartResizeBound = true;
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        [state.spendChart, state.ctrChart, state.resultsChart, state.frequencyChart, state.cpmChart, state.cprChart, state.inspSpendChart, state.inspResultsChart, state.inspEffChart].forEach(function (c) {
          if (c) try { c.resize(); } catch (e) {}
        });
      }, 150);
    });
  }

  function makeLineChart(canvasId, labels, datasets) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    lockChartBox(canvasId, canvasId.indexOf('insp-') === 0 ? INSP_CHART_H : CHART_CARD_H);
    var ctx = canvas.getContext('2d');
    applyGradients(canvasId, datasets);
    datasets.forEach(function (ds) {
      if (ds.spanGaps === undefined) ds.spanGaps = false;
      if (ds.pointRadius === undefined && !ds.isIssueMarkers) ds.pointRadius = 0;
      if (ds.pointHoverRadius === undefined && !ds.isIssueMarkers) ds.pointHoverRadius = 4;
    });
    var chart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12,12,14,0.96)',
            borderColor: 'rgba(201,168,76,0.25)',
            borderWidth: 1,
            titleColor: '#e8e6e0',
            bodyColor: '#C9A84C',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 12 },
            displayColors: false,
            filter: function (item) { return !(item.dataset && item.dataset.isIssueMarkers); },
            callbacks: {
              label: function (item) {
                var v = item.parsed.y;
                if (v == null || Number.isNaN(v)) return 'لا بيانات لهذا اليوم';
                var f = item.dataset && item.dataset._fmt;
                var txt = f === 'currency' ? fmtCurrencyMinor(v * state.minorFactor)
                  : f === 'pct' ? (Number(v).toFixed(2) + '%')
                  : f === 'freq' ? Number(v).toFixed(2)
                  : Number(v).toLocaleString('en-US');
                return (item.dataset.label || '') + ': ' + txt;
              },
            },
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: 'rgba(148,163,184,0.55)', maxTicksLimit: 7, font: { size: 10 }, maxRotation: 0 }
          },
          y: {
            beginAtZero: true,
            grace: '8%',
            grid: { color: 'rgba(255,255,255,0.04)', lineWidth: 1 },
            border: { display: false },
            ticks: {
              color: 'rgba(148,163,184,0.55)',
              font: { size: 10 },
              maxTicksLimit: 4,
              callback: function(v) {
                if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
                if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
                return v;
              }
            }
          }
        },
        elements: {
          point: { radius: 0, hoverRadius: 4, hoverBorderWidth: 2, hitRadius: 8 },
          line: { borderWidth: 2 }
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
    bindChartResize();
    return chart;
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

  function showChartEmpty(chartId, show) {
    var el = document.getElementById(chartId + '-empty');
    var canvas = document.getElementById(chartId);
    if (el) el.style.display = show ? 'flex' : 'none';
    if (canvas) canvas.style.display = show ? 'none' : '';
  }

  /** Calendar continuum with nulls for unsynced days — never invent continuity. */
  function toChartCalendar(insights, days) {
    var byDate = {};
    (insights || []).forEach(function (d) {
      byDate[new Date(d.date).toISOString().slice(0, 10)] = d;
    });
    var end = new Date();
    end.setHours(12, 0, 0, 0);
    var start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    var labels = [];
    var isoDates = [];
    var rows = [];
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var key = d.toISOString().slice(0, 10);
      isoDates.push(key);
      labels.push(fmtShortDate(key));
      rows.push(byDate[key] || null);
    }
    return { labels: labels, isoDates: isoDates, rows: rows };
  }

  function dayResults(d) {
    if (!d) return null;
    return (Number(d.messages) || 0) + (Number(d.purchases) || 0) + (Number(d.leads) || 0);
  }

  function updateCharts(insights) {
    try {
    var cal = toChartCalendar(insights, state.days);
    var labels = cal.labels;
    var isoDates = cal.isoDates;
    var rows = cal.rows;

    if (!rows.some(function (r) { return r; })) {
      showChartEmpty('chart-spend', true);
      showChartEmpty('chart-results', true);
      showChartEmpty('chart-cpr', true);
      showChartEmpty('chart-cpm', true);
      showChartEmpty('chart-ctr', true);
      showChartEmpty('chart-frequency', true);
      return;
    }

    var spendData = rows.map(function (d) {
      return d ? (Number(d.spend) || 0) / state.minorFactor : null;
    });
    var resultsData = rows.map(function (d) { return dayResults(d); });
    var cprData = rows.map(function (d) {
      if (!d) return null;
      var results = dayResults(d);
      if (results == null || results <= 0) return null;
      return (Number(d.spend) || 0) / state.minorFactor / results;
    });
    var cpmData = rows.map(function (d) {
      if (!d || d.cpm == null) return null;
      var v = Number(d.cpm);
      return Number.isFinite(v) ? v : null;
    });
    var ctrData = rows.map(function (d) {
      if (!d) return null;
      var v = Number(d.ctr);
      return Number.isFinite(v) ? v : null;
    });
    var freqData = rows.map(function (d) {
      if (!d || d.frequency == null) return null;
      var v = Number(d.frequency);
      return Number.isFinite(v) ? v : null;
    });

    function upsertLine(stateKey, canvasId, datasets) {
      if (state[stateKey]) {
        state[stateKey].data.labels = labels;
        state[stateKey].data.datasets = applyGradients(canvasId, datasets);
        state[stateKey].update();
      } else {
        destroyChartInstance(state[stateKey]);
        state[stateKey] = makeLineChart(canvasId, labels, datasets);
      }
    }

    var hasSpendData = spendData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-spend', !hasSpendData);
    if (hasSpendData) {
      var spendDatasets = [{
        label: 'الإنفاق (' + state.currency + ')',
        data: spendData,
        borderColor: '#D9A759',
        _rgb: [217, 167, 89],
        _fmt: 'currency',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#D9A759',
      }];
      var numericSpend = spendData.filter(function (v) { return v != null; });
      if (numericSpend.length >= 7) {
        var ma = spendData.map(function (_, i) {
          var window = [];
          for (var j = Math.max(0, i - 6); j <= i; j++) {
            if (spendData[j] != null) window.push(spendData[j]);
          }
          if (!window.length) return null;
          return window.reduce(function (a, b) { return a + b; }, 0) / window.length;
        });
        spendDatasets.push({
          label: 'المتوسط (أيام متاحة)',
          data: ma,
          borderColor: 'rgba(230,189,122,0.55)',
          borderDash: [6, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          spanGaps: false,
          _fmt: 'currency',
        });
      }
      var markerDataset = buildIssueMarkerDataset(labels, isoDates, state.lastIssueDates);
      if (markerDataset) spendDatasets.push(markerDataset);
      upsertLine('spendChart', 'chart-spend', spendDatasets);
    }

    var hasResultsData = resultsData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-results', !hasResultsData);
    if (hasResultsData) {
      upsertLine('resultsChart', 'chart-results', [{
        label: 'النتائج',
        data: resultsData,
        borderColor: '#2DD4BF',
        _rgb: [45, 212, 191],
        _fmt: 'int',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#2DD4BF',
      }]);
    }

    var hasCprData = cprData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-cpr', !hasCprData);
    if (hasCprData) {
      upsertLine('cprChart', 'chart-cpr', [{
        label: 'تكلفة النتيجة (' + state.currency + ')',
        data: cprData,
        borderColor: '#60A5FA',
        _rgb: [96, 165, 250],
        _fmt: 'currency',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#60A5FA',
      }]);
    }

    var hasCpmData = cpmData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-cpm', !hasCpmData);
    if (hasCpmData) {
      upsertLine('cpmChart', 'chart-cpm', [{
        label: 'CPM (' + state.currency + ')',
        data: cpmData,
        borderColor: '#C77A1F',
        _rgb: [199, 122, 31],
        _fmt: 'currency',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#C77A1F',
      }]);
    }

    var hasCtrData = ctrData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-ctr', !hasCtrData);
    if (hasCtrData) {
      upsertLine('ctrChart', 'chart-ctr', [{
        label: 'نسبة النقر (%)',
        data: ctrData,
        borderColor: '#34A871',
        _rgb: [52, 168, 113],
        _fmt: 'pct',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#34A871',
      }]);
    }

    var hasFreqData = freqData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('chart-frequency', !hasFreqData);
    if (hasFreqData) {
      upsertLine('frequencyChart', 'chart-frequency', [{
        label: 'التكرار',
        data: freqData,
        borderColor: '#FB7185',
        _rgb: [251, 113, 133],
        _fmt: 'freq',
        fill: true, tension: 0.35,
        spanGaps: false,
        pointBackgroundColor: '#FB7185',
      }]);
    }
    } catch (chartErr) {
      console.error('[campaigns] chart render failed:', chartErr);
    }
  }

  function deliveryStatus(c) {
    var tier = c.deliveryTier || '';
    if (c.isCurrentlySpending || tier === 'DELIVERING_TODAY') {
      return { cls: 'today', text: 'تنفق الآن', rank: 1 };
    }
    if (tier === 'DELIVERING_WINDOW') {
      return { cls: 'delivering', text: 'تعمل', rank: 2 };
    }
    if (tier === 'DORMANT_ACTIVE' || c.isDormantActive) {
      return { cls: 'dormant', text: 'تحتاج مراجعة', rank: 3 };
    }
    if (tier === 'PAUSED' || (c.status || '').toUpperCase() === 'PAUSED') {
      return { cls: 'paused', text: 'متوقفة', rank: 4 };
    }
    if (tier === 'ARCHIVED' || (c.status || '').toUpperCase() === 'ARCHIVED') {
      return { cls: 'archived', text: 'مؤرشفة', rank: 5 };
    }
    return { cls: 'paused', text: 'غير معروفة', rank: 9 };
  }

  function deliveryStatusHtml(c) {
    var st = deliveryStatus(c);
    return '<span class="delivery-status ' + st.cls + '"><span class="dot" aria-hidden="true"></span>' + escHtml(st.text) + '</span>';
  }

  function costPerResultMinor(c) {
    // Prefer server-computed objective-aware efficiency (MAJOR units).
    if (c.costPerResult != null && Number.isFinite(Number(c.costPerResult))) {
      var factor = state.minorFactor || 100;
      return Number(c.costPerResult) * factor;
    }
    // Legacy fallback: spend ÷ messages (Phase-1 messaging-only accounts).
    var spend = Number(c.spendWindowMinor) || 0;
    var msgs = Number(c.messagesWindow) || 0;
    if (msgs <= 0 || spend <= 0) return null;
    return spend / msgs;
  }

  function resultsCount(c) {
    if (c.resultsWindow != null && Number.isFinite(Number(c.resultsWindow))) {
      return Number(c.resultsWindow);
    }
    return Number(c.messagesWindow) || 0;
  }

  function matchesStatusFilter(c, filter) {
    var tier = c.deliveryTier || '';
    if (filter === 'ALL') return true;
    if (filter === 'DELIVERING') return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW';
    if (filter === 'TODAY') return tier === 'DELIVERING_TODAY' || !!c.isCurrentlySpending;
    if (filter === 'REVIEW' || filter === 'DORMANT') return tier === 'DORMANT_ACTIVE' || !!c.isDormantActive;
    if (filter === 'ACTIVE') return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW' || tier === 'DORMANT_ACTIVE';
    if (filter === 'PAUSED') return tier === 'PAUSED';
    if (filter === 'ARCHIVED') return tier === 'ARCHIVED';
    return c.status === filter;
  }

  function setDisplayMode(mode) {
    state.displayMode = mode === 'cards' ? 'cards' : 'table';
    document.body.classList.toggle('camp-cards-only', state.displayMode === 'cards');
    document.body.classList.toggle('camp-table-only', state.displayMode === 'table');
    document.querySelectorAll('#display-mode-toggle .view-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === state.displayMode);
    });
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  // Three merchant-facing signals: spend, delivering, needs review.
  function updateSummary(campaigns, insights) {
    var delivering = campaigns.filter(function(c) {
      return c.deliveryTier === 'DELIVERING_TODAY' || c.deliveryTier === 'DELIVERING_WINDOW';
    }).length;
    var spendingToday = campaigns.filter(function(c) {
      return c.deliveryTier === 'DELIVERING_TODAY' || c.isCurrentlySpending;
    }).length;
    var needsReview = campaigns.filter(function(c) {
      return c.deliveryTier === 'DORMANT_ACTIVE' || c.isDormantActive;
    }).length;
    var paused = campaigns.filter(function(c) { return c.status === 'PAUSED' || c.deliveryTier === 'PAUSED'; }).length;
    var insightsSlice = recentAsc(insights, state.days);
    var totalSpendMinor = insightsSlice.reduce(function(acc, d){ return acc + (Number(d.spend) || 0); }, 0);

    tickText(document.getElementById('active-campaigns'), String(delivering));
    var activeSub = document.getElementById('active-sub');
    if (activeSub) {
      activeSub.textContent = spendingToday + ' تنفق اليوم · من أصل ' + campaigns.length + ' حملة';
    }
    tickText(document.getElementById('review-campaigns'), String(needsReview));
    var reviewSub = document.getElementById('review-sub');
    if (reviewSub) {
      reviewSub.textContent = paused + ' متوقفة · بدون إنفاق رغم أنها نشطة';
    }
    tickText(document.getElementById('total-spend'), fmtCurrencyMinor(totalSpendMinor));
    var spendPeriod = document.getElementById('spend-period');
    if (spendPeriod) spendPeriod.textContent = 'آخر ' + state.days + ' يوماً';
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

  /** Prefer purpose-resolved Arabic label (رسائل for ENGAGEMENT+CONVERSATIONS). */
  function purposeLabel(c) {
    if (c && c.purposeLabelAr) return c.purposeLabelAr;
    return translateObjective(c && c.objective);
  }

  // Draw every .spark-cell canvas from its data-spark JSON (7 daily values).
  // Null = unsynced day: break the line instead of inventing a zero dip.
  function drawSparklines() {
    document.querySelectorAll('.spark-cell canvas').forEach(function (cv) {
      var vals;
      try { vals = JSON.parse(cv.getAttribute('data-spark') || '[]'); } catch (e) { vals = []; }
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      var hasReal = vals.some(function (v) { return v != null && Number(v) > 0; });
      if (!vals.length || !hasReal) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(4, cv.height / 2); ctx.lineTo(cv.width - 4, cv.height / 2); ctx.stroke();
        return;
      }
      var numeric = vals.map(function (v) { return v == null ? null : Number(v); });
      var max = Math.max.apply(null, numeric.filter(function (v) { return v != null; }).concat([0.0001]));
      var pad = 6;
      var stepX = (cv.width - pad * 2) / Math.max(1, vals.length - 1);
      var y = function (v) { return cv.height - pad - (v / max) * (cv.height - pad * 2); };

      // area fill across contiguous segments only
      var segStart = -1;
      function flushArea(endIdx) {
        if (segStart < 0 || endIdx <= segStart) return;
        ctx.beginPath();
        for (var i = segStart; i <= endIdx; i++) {
          var px = pad + i * stepX;
          if (i === segStart) ctx.moveTo(px, y(numeric[i]));
          else ctx.lineTo(px, y(numeric[i]));
        }
        ctx.lineTo(pad + endIdx * stepX, cv.height - 2);
        ctx.lineTo(pad + segStart * stepX, cv.height - 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(217,167,89,0.16)';
        ctx.fill();
      }
      for (var i = 0; i < numeric.length; i++) {
        if (numeric[i] == null) {
          flushArea(i - 1);
          segStart = -1;
        } else if (segStart < 0) {
          segStart = i;
        }
      }
      flushArea(numeric.length - 1);

      // stroke segments
      ctx.strokeStyle = '#D9A759';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      var drawing = false;
      for (var j = 0; j < numeric.length; j++) {
        if (numeric[j] == null) { drawing = false; continue; }
        var x = pad + j * stepX;
        if (!drawing) { ctx.moveTo(x, y(numeric[j])); drawing = true; }
        else ctx.lineTo(x, y(numeric[j]));
      }
      ctx.stroke();

      // latest real-day dot
      for (var k = numeric.length - 1; k >= 0; k--) {
        if (numeric[k] == null) continue;
        ctx.beginPath();
        ctx.arc(pad + k * stepX, y(numeric[k]), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#E6BD7A';
        ctx.fill();
        break;
      }
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
  function renderTable(campaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var emptyEl = document.getElementById('empty-campaigns');
    var tableContainer = document.getElementById('table-container');
    var cardsEl = document.getElementById('campaigns-cards');
    var countEl = document.getElementById('camp-result-count');
    try {
    if (!campaigns || !Array.isArray(campaigns)) campaigns = [];
    if (countEl) {
      countEl.textContent = campaigns.length
        ? (campaigns.length + ' حملة ظاهرة')
        : '';
    }

    if (campaigns.length === 0) {
      tableContainer.style.display = 'none';
      if (cardsEl) cardsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      var emptyFoot = document.getElementById('campaigns-tfoot');
      if (emptyFoot) emptyFoot.innerHTML = '';
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
        var cost = costPerResultMinor(c);
        var costTxt = cost != null ? fmtCurrencyMinor(cost) : '—';
        var budget = c.dailyBudget != null
          ? fmtCurrencyMinor(c.dailyBudget) + ' / يوم'
          : (c.lifetimeBudget != null ? fmtCurrencyMinor(c.lifetimeBudget) + ' إجمالي' : 'بدون ميزانية');
        var st = deliveryStatus(c);
        return '<div class="camp-card" data-campaign-id="' + escAttr(c.id) + '" data-delivery="' + escAttr(c.deliveryTier || '') + '">'
          + '<div class="camp-card-top">'
          +   '<div class="camp-card-name">' + escHtml(c.name || '—') + '</div>'
          +   deliveryStatusHtml(c)
          + '</div>'
          + '<div class="camp-card-meta">'
          +   '<span class="camp-card-chip"><b>' + escHtml(spendTxt) + '</b> · ' + state.days + ' يوم</span>'
          +   '<span class="camp-card-chip">' + escHtml(fmtNum(resultsCount(c), 0)) + ' ' + escHtml(c.resultLabelAr || 'نتيجة') + '</span>'
          +   '<span class="camp-card-chip">تكلفة: <b>' + escHtml(costTxt) + '</b></span>'
          +   '<span class="camp-card-chip">' + escHtml(purposeLabel(c)) + '</span>'
          +   '<span class="camp-card-chip">' + escHtml(budget) + '</span>'
          + '</div>'
          + '<div class="camp-card-cta">عرض التفاصيل ←</div>'
          + '</div>';
      }).join('');
    }

    var totSpend = 0, totResults = 0;
    tbody.innerHTML = campaigns.map(function(c) {
      // Campaign.dailyBudget / lifetimeBudget are BigInt minor units in the
      // schema. They came through bigintReplacer as plain Numbers but still
      // in MINOR units — format via the account-aware helper.
      var budget = c.dailyBudget != null
        ? fmtCurrencyMinor(c.dailyBudget)
        : (c.lifetimeBudget != null ? fmtCurrencyMinor(c.lifetimeBudget) + ' (إجمالي)' : '—');
      var spendMinor = Number(c.spendWindowMinor) || 0;
      totSpend += spendMinor;
      totResults += resultsCount(c);
      var barPct = maxSpend > 0 ? Math.max(2, Math.round((spendMinor / maxSpend) * 100)) : 0;
      var cost = costPerResultMinor(c);
      return '<tr>'
        + '<td><div class="cell-name" title="' + escAttr(c.name || '') + '">' + escHtml(c.name || '—') + '</div>'
        +   '<span class="obj-chip">' + escHtml(purposeLabel(c)) + '</span>'
        + '</td>'
        + '<td>' + deliveryStatusHtml(c) + '</td>'
        + '<td class="cell-spend"><span class="num">' + escHtml(fmtCurrencyMinor(spendMinor)) + '</span>'
        +   (maxSpend > 0 ? '<div class="spend-bar"><i style="width:' + barPct + '%"></i></div>' : '') + '</td>'
        + '<td class="spark-cell"><canvas width="192" height="52" data-spark="' + escAttr(JSON.stringify(c.spark || [])) + '"></canvas></td>'
        + '<td class="cell-num">' + escHtml(fmtNum(resultsCount(c), 0)) + '</td>'
        + '<td class="cell-num">' + (cost != null ? escHtml(fmtCurrencyMinor(cost)) : '—') + '</td>'
        + '<td class="cell-num">' + (c.ctrWindow != null ? escHtml(fmtNum(c.ctrWindow, 2)) + '%' : '—') + '</td>'
        + '<td class="cell-num">' + escHtml(budget) + '</td>'
        + '<td><div class="action-group">'
        +   '<button class="btn btn-secondary btn-sm js-inspect-btn" data-campaign-id="' + escHtml(c.id) + '" data-tab="overview">عرض</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');

    // Tiny raw-2D sparklines (Tremor SparkChart port) — one per row, no
    // Chart.js instances so 100 rows stay cheap. devicePixelRatio-2 canvas.
    drawSparklines();

    // Totals row — window spend and objective-aware results across the visible set.
    // Columns: name | delivery | spend | spark | results | cost | ctr | budget | action
    var tfoot = document.getElementById('campaigns-tfoot');
    if (tfoot) {
      tfoot.innerHTML = '<tr>'
        + '<td colspan="2" class="tot-label">الإجمالي · ' + campaigns.length + ' حملة · آخر ' + state.days + ' يوماً</td>'
        + '<td class="cell-spend"><span class="num">' + escHtml(fmtCurrencyMinor(totSpend)) + '</span></td>'
        + '<td></td>'
        + '<td class="cell-num">' + escHtml(fmtNum(totResults, 0)) + '</td>'
        + '<td colspan="4"></td>'
        + '</tr>';
    }
    } catch (tableErr) {
      console.error('[campaigns] table render failed:', tableErr);
      tbody.innerHTML = '<tr><td colspan="9" class="section-fallback">تعذّر عرض الحملات — حاول التحديث.</td></tr>';
    }
  }

  // ── Filter + sort pipeline ─────────────────────────────────────────────────
  // SaaS ordering: filter first, then one transparent sort preset.
  // Default "الأهم أولاً" = live spend → dormant/active risk → spend volume.
  var SORT_PRESET_HINTS = {
    attention: 'الترتيب: الأهم أولاً — تنفق الآن، ثم تحتاج مراجعة، ثم الأعلى إنفاقاً',
    spend: 'الترتيب: الأعلى إنفاقاً في النافذة الحالية',
    results: 'الترتيب: الأكثر نتائج في النافذة الحالية',
    cost: 'الترتيب: الأقل تكلفة لكل نتيجة',
    engagement: 'الترتيب: الأفضل تفاعلاً (تفاعل الإعلان)',
  };

  function sparkTrend(c) {
    var spark = Array.isArray(c.spark) ? c.spark : [];
    if (spark.length < 4) return 0;
    var mid = Math.floor(spark.length / 2);
    var older = 0, newer = 0, i;
    for (i = 0; i < mid; i++) older += Number(spark[i]) || 0;
    for (i = mid; i < spark.length; i++) newer += Number(spark[i]) || 0;
    if (older <= 0 && newer <= 0) return 0;
    if (older <= 0) return 1;
    return (newer - older) / older;
  }

  function attentionScore(c) {
    var spend = Number(c.spendWindowMinor) || 0;
    var score = Math.log10(spend + 1) * 10;
    if (c.isCurrentlySpending) score += 1000;
    else if (c.deliveryTier === 'DELIVERING_TODAY' || c.deliveryTier === 'DELIVERING_WINDOW') score += 700;
    else if (c.deliveryTier === 'DORMANT_ACTIVE' || c.isDormantActive) score += 450;
    else if ((c.status || '').toUpperCase() === 'ACTIVE') score += 200;
    else if ((c.status || '').toUpperCase() === 'PAUSED') score += 50;
    var trend = sparkTrend(c);
    if (c.isCurrentlySpending && trend > 0.35) score += 40;
    if ((c.deliveryTier === 'DORMANT_ACTIVE' || c.isDormantActive) && spend > 0) score += 30;
    var ctr = c.ctrWindow != null ? Number(c.ctrWindow) : null;
    if (ctr != null && ctr < 1 && spend > 0) score += 25;
    return score;
  }

  function applySortPreset(preset) {
    state.sortPreset = preset || 'attention';
    if (state.sortPreset === 'spend') {
      state.sortKey = 'spendWindowMinor';
      state.sortDir = -1;
    } else if (state.sortPreset === 'results') {
      state.sortKey = 'resultsWindow';
      state.sortDir = -1;
    } else if (state.sortPreset === 'cost') {
      state.sortKey = 'costPerResult';
      state.sortDir = 1;
    } else if (state.sortPreset === 'engagement') {
      state.sortKey = 'ctrWindow';
      state.sortDir = -1;
    } else {
      state.sortKey = 'attentionScore';
      state.sortDir = -1;
    }
    var sortSelect = document.getElementById('sort-preset-select');
    if (sortSelect && state.sortPreset !== 'custom') sortSelect.value = state.sortPreset;
    var hint = document.getElementById('sort-hint');
    if (hint) hint.textContent = SORT_PRESET_HINTS[state.sortPreset] || SORT_PRESET_HINTS.attention;
    document.querySelectorAll('#campaigns-thead .th-sort').forEach(function(el) {
      el.classList.remove('is-sorted', 'asc', 'desc');
      if (el.getAttribute('data-sort') === state.sortKey && state.sortKey !== 'attentionScore') {
        el.classList.add('is-sorted', state.sortDir === 1 ? 'asc' : 'desc');
      }
    });
  }

  function applyFilters() {
    var searchEl = document.getElementById('search-input');
    var q = (searchEl && searchEl.value || '').toLowerCase().trim();
    var list = state.campaigns.filter(function(c) {
      if (!matchesStatusFilter(c, state.statusFilter)) return false;
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q)
        || (c.objective || '').toLowerCase().includes(q)
        || (c.purposeLabelAr || '').toLowerCase().includes(q)
        || (c.status || '').toLowerCase().includes(q)
        || (c.id || '').toLowerCase().includes(q)
        || purposeLabel(c).toLowerCase().includes(q)
        || translateObjective(c.objective).toLowerCase().includes(q);
    });
    var key = state.sortKey, dir = state.sortDir;
    list = list.slice().sort(function(a, b) {
      if (key === 'attentionScore') {
        return (attentionScore(a) - attentionScore(b)) * dir;
      }
      if (key === 'costPerResult') {
        var ac = costPerResultMinor(a);
        var bc = costPerResultMinor(b);
        if (ac == null && bc == null) return 0;
        if (ac == null) return 1;
        if (bc == null) return -1;
        return (ac - bc) * dir;
      }
      if (key === 'resultsWindow' || key === 'messagesWindow') {
        return (resultsCount(a) - resultsCount(b)) * dir;
      }
      if (key === 'deliveryRank') {
        return (deliveryStatus(a).rank - deliveryStatus(b).rank) * dir;
      }
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
    cpc:            'تكلفة النقرة',
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
    return '<li>'
      +    '<span style="color:' + color + ';font-weight:700;">' + arrow + ' ' + fmtPct(s.deltaPct) + '</span>'
      +    ' <span style="color:var(--text);">' + escHtml(label) + '</span>'
      +    ' <span style="color:var(--text-3);font-size:12px;">(الآن ' + escHtml(current) + ' · سابقاً ' + escHtml(prior) + ')</span>'
      +    '</li>';
  }

  /** Purpose-aware one-liner explaining which Meta result this overview tracks. */
  function purposeFrameCopy(family, resultLabel, efficiencyLabel) {
    switch (family) {
      case 'awareness':
        return 'هذه حملة وعي — نتابع ' + resultLabel + ' و' + efficiencyLabel + ' كما في مدير إعلانات Meta، وليس الرسائل أو المبيعات.';
      case 'messaging':
        return 'هذه حملة رسائل — النتيجة الأساسية هي المحادثات وتكلفتها، وليس مرات الظهور.';
      case 'traffic':
        return 'هذه حملة زيارات — نتابع النقرات وتكلفة النقرة وجودة ما بعد النقر.';
      case 'sales':
        return 'هذه حملة مبيعات — نتابع المشتريات وتكلفة الشراء / العائد.';
      case 'leads':
        return 'هذه حملة عملاء محتملين — نتابع عدد العملاء وتكلفتهم.';
      case 'engagement':
        return 'هذه حملة تفاعل منشور — نتابع التفاعل وتكلفته (وليست محادثات الرسائل).';
      case 'app':
        return 'هذه حملة ترويج تطبيق — نتابع النقرات / التثبيتات وتكلفة الاكتساب.';
      default:
        return 'نعرض مؤشرات الهدف الحقيقي لهذه الحملة فقط.';
    }
  }

  function isGenericNarrationClient(title, body) {
    var t = String(title || '').trim();
    var b = String(body || '').trim();
    if (!t && !b) return true;
    if (t === 'تحديث أداء الحملة' || t.indexOf('تحديث أداء الحملة') === 0) return true;
    if (b.indexOf('راجعنا أداء حملتك وصدرت توصية جديدة') !== -1) return true;
    return false;
  }

  function renderInspector(data) {
    var c = data.campaign || {};
    var a = data.account  || {};
    var s = data.summary  || {};
    var sig = data.signals || { positive: [], negative: [] };
    var timeline = Array.isArray(data.timeline) ? data.timeline : [];

    // ── Title + subtitle ──────────────────────────────────────────────────
    document.getElementById('inspector-title').textContent = c.name || 'الحملة';
    var purposeText = c.purposeLabelAr || translateObjective(c.objective);
    var statusBadge =
      '<span class="badge ' + statusBadgeClass(c.status) + '">'
    +   escHtml(statusArabic(c.status))
    + '</span>';
    var objectiveChip = purposeText
      ? '<span class="obj-chip" style="margin-top:0;">' + escHtml(purposeText) + '</span>'
      : '';
    var subtitleEl = document.getElementById('inspector-subtitle');
    subtitleEl.style.direction = 'rtl';
    subtitleEl.style.textAlign = 'right';
    subtitleEl.innerHTML =
      '<div class="insp-meta">'
    +   '<span class="insp-meta-window">آخر ' + (s.windowDays || 30) + ' يوم</span>'
    +   statusBadge
    +   objectiveChip
    + '</div>';

    // ── Purpose-first financial summary ───────────────────────────────────
    var budgetLine =
      c.dailyBudgetMinor    != null ? fmtMinor(c.dailyBudgetMinor,    a.currencyMinorFactor, a.currency) + ' / يومياً'
    : c.lifetimeBudgetMinor != null ? fmtMinor(c.lifetimeBudgetMinor, a.currencyMinorFactor, a.currency) + ' (إجمالي)'
    : '—';

    var freshnessAttr = state.lastSyncedAt ? ' data-freshness="' + escHtml(state.lastSyncedAt) + '"' : '';
    var resultLabel = s.resultLabelAr || 'إجمالي الرسائل';
    var efficiencyLabel = s.efficiencyLabelAr || 'تكلفة الرسالة';
    var family = s.kpiFamily || c.purposeFamily || 'messaging';
    var resultInfoId = s.resultKey === 'impressions' ? 'impressions'
      : s.resultKey === 'clicks' ? 'clicks'
      : s.resultKey === 'purchases' ? 'purchases'
      : s.resultKey === 'leads' ? 'leads'
      : s.resultKey === 'reach' ? 'reach'
      : 'messages';
    var efficiencyInfoId = s.efficiencyKey === 'cpm' ? 'cpm'
      : s.efficiencyKey === 'cpc' ? 'cpc'
      : s.efficiencyKey === 'costPerMessage' ? 'cost_per_messaging_conversation'
      : 'cost_per_result';
    var resultValue = s.results != null ? s.results
      : (s.messages != null ? s.messages : 0);
    var efficiencyMajor = s.avgCostPerResult != null ? s.avgCostPerResult
      : s.avgCostPerMessage;
    var efficiencyText = efficiencyMajor != null
      ? fmtMinor(efficiencyMajor * a.currencyMinorFactor, a.currencyMinorFactor, a.currency)
      : '—';
    var spendText = fmtMinor(s.spendMinor, a.currencyMinorFactor, a.currency);
    var purposeFrame = purposeFrameCopy(family, resultLabel, efficiencyLabel);

    var purposeBanner =
      '<div class="insp-purpose">'
    +   '<div class="insp-purpose-mark" aria-hidden="true"></div>'
    +   '<div>'
    +     '<div class="insp-purpose-title">معيار العرض · ' + escHtml(purposeText || 'الحملة') + '</div>'
    +     '<div class="insp-purpose-text">' + escHtml(purposeFrame) + '</div>'
    +   '</div>'
    + '</div>';

    function metricCard(opts) {
      return ''
        + '<div class="insp-metric' + (opts.hero ? ' is-hero' : '') + (opts.secondary ? ' is-secondary' : '') + '">'
        +   '<div class="insp-metric-label">' + escHtml(opts.label)
        +     (opts.infoId
          ? ' <button type="button" class="info-btn" data-metric-info="' + escAttr(opts.infoId) + '"' + freshnessAttr + ' title="ما هذا؟" aria-label="شرح المؤشر">i</button>'
          : '')
        +   '</div>'
        +   '<div class="insp-metric-value">' + escHtml(opts.value) + '</div>'
        +   (opts.sub ? '<div class="insp-metric-sub">' + escHtml(opts.sub) + '</div>' : '')
        + '</div>';
    }

    var kpiHtml =
      '<div class="insp-primary">'
    +   metricCard({
          hero: true,
          label: resultLabel,
          infoId: resultInfoId,
          value: fmtNum(resultValue, 0),
          sub: 'النتيجة الأساسية حسب هدف الحملة',
        })
    +   metricCard({
          hero: true,
          label: efficiencyLabel,
          infoId: efficiencyInfoId,
          value: efficiencyText,
          sub: 'تكلفة كل وحدة من النتيجة الأساسية',
        })
    + '</div>'
    + '<div class="insp-secondary">'
    +   metricCard({
          secondary: true,
          label: 'الإنفاق',
          infoId: 'spend',
          value: spendText,
          sub: 'خلال النافذة المحددة',
        })
    +   metricCard({
          secondary: true,
          label: 'الميزانية',
          value: budgetLine,
          sub: budgetLine === '—' ? 'لم تُرجع Meta ميزانية على مستوى الحملة' : 'من إعدادات الحملة في Meta',
        })
    + '</div>';

    // ── Signals block ──────────────────────────────────────────────────────
    var hasPos = sig.positive && sig.positive.length > 0;
    var hasNeg = sig.negative && sig.negative.length > 0;
    var signalsHtml;
    if (!hasPos && !hasNeg) {
      signalsHtml =
        '<div class="insp-stable">'
      +   '<div class="insp-stable-icon" aria-hidden="true">✓</div>'
      +   '<div>الأداء مستقر خلال آخر 7 أيام — لا توجد تغيّرات حادة تستحق تدخلاً الآن.</div>'
      + '</div>';
    } else {
      var posBody = hasPos
        ? '<ul class="insp-signal-list">' + sig.positive.map(function(x){ return signalLine(x, true); }).join('') + '</ul>'
        : '<div class="insp-signal-empty">لا إيجابيات بارزة في هذه المقارنة.</div>';
      var negBody = hasNeg
        ? '<ul class="insp-signal-list">' + sig.negative.map(function(x){ return signalLine(x, false); }).join('') + '</ul>'
        : '<div class="insp-signal-empty">لا سلبيات بارزة في هذه المقارنة.</div>';
      signalsHtml =
        '<div class="insp-signals">'
      +   '<div class="insp-signal-card is-pos">'
      +     '<div class="insp-signal-head is-pos"><span class="insp-signal-dot is-pos"></span>إيجابيات</div>'
      +     posBody
      +   '</div>'
      +   '<div class="insp-signal-card is-neg">'
      +     '<div class="insp-signal-head is-neg"><span class="insp-signal-dot is-neg"></span>سلبيات</div>'
      +     negBody
      +   '</div>'
      + '</div>';
    }

    // ── AI timeline ────────────────────────────────────────────────────────
    var narrationPendingMsg = 'الذكاء الاصطناعي يحلّل بيانات هذه الحملة لتقديم توصية أوضح…';
    var timelineEmptyMsg    = 'لا توجد توصيات بعد — سيبدأ التحليل تلقائياً بعد اكتمال البيانات.';

    var usefulTimeline = timeline.filter(function(t) {
      var n = t.narration || {};
      if (!n.arabicTitle && !n.arabicNarration) return true; // pending — keep
      return !isGenericNarrationClient(n.arabicTitle, n.arabicNarration);
    });

    var timelineHtml;
    if (timeline.length === 0) {
      timelineHtml = '<div class="insp-empty-panel">' + escHtml(timelineEmptyMsg) + '</div>';
    } else if (usefulTimeline.length === 0) {
      timelineHtml =
        '<div class="insp-empty-panel">'
      +   'التوصية السابقة عامة وغير كافية — نعيد التحليل بناءً على هدف الحملة الفعلي ('
      +   escHtml(purposeText || 'الحملة')
      +   ').'
      + '</div>';
    } else {
      timelineHtml = usefulTimeline.map(function(t) {
        var narration  = t.narration || {};
        var hasArabic  = !!(narration.arabicTitle || narration.arabicNarration);
        var bodyHtml;
        if (hasArabic) {
          var titleHtml = narration.arabicTitle
            ? '<div class="insp-timeline-title">' + escHtml(narration.arabicTitle) + '</div>'
            : '';
          var narrHtml  = narration.arabicNarration
            ? '<div class="insp-timeline-body">' + escHtml(narration.arabicNarration) + '</div>'
            : '';
          bodyHtml = titleHtml + narrHtml;
        } else {
          bodyHtml = '<div class="insp-timeline-body" style="color:var(--text-3);">' + escHtml(narrationPendingMsg) + '</div>';
        }
        return '<div class="insp-timeline-item">'
          +    '<div class="insp-timeline-date">' + escHtml(fmtDate(t.tickDate)) + '</div>'
          +    bodyHtml
          +  '</div>';
      }).join('');
    }

    function sectionBlock(title, hint, body) {
      return ''
        + '<section class="insp-section">'
        +   '<div class="insp-section-head">'
        +     '<div class="insp-section-title">' + escHtml(title) + '</div>'
        +     (hint ? '<div class="insp-section-hint">' + escHtml(hint) + '</div>' : '')
        +   '</div>'
        +   body
        + '</section>';
    }

    var overviewHtml =
      purposeBanner
    + sectionBlock('نتائج الهدف', 'كما يعرضها مدير إعلانات Meta لهذا النوع', kpiHtml)
    + sectionBlock('اتجاه الأداء', 'إنفاق · نتائج الهدف · الكفاءة — أيام بلا بيانات تظهر كفجوة',
        '<div class="insp-chart-grid">'
      +   '<div class="chart-card">'
      +     '<div class="chart-card-header"><div class="chart-card-title">الإنفاق</div></div>'
      +     '<div class="chart-canvas-wrap"><canvas id="insp-chart-spend"></canvas>'
      +       '<div class="chart-empty" id="insp-chart-spend-empty" style="display:none;">لا إنفاق</div></div>'
      +   '</div>'
      +   '<div class="chart-card">'
      +     '<div class="chart-card-header"><div class="chart-card-title">' + escHtml(resultLabel) + '</div></div>'
      +     '<div class="chart-canvas-wrap"><canvas id="insp-chart-results"></canvas>'
      +       '<div class="chart-empty" id="insp-chart-results-empty" style="display:none;">لا نتائج</div></div>'
      +   '</div>'
      +   '<div class="chart-card">'
      +     '<div class="chart-card-header"><div class="chart-card-title">' + escHtml(efficiencyLabel) + '</div></div>'
      +     '<div class="chart-canvas-wrap"><canvas id="insp-chart-eff"></canvas>'
      +       '<div class="chart-empty" id="insp-chart-eff-empty" style="display:none;">لا كفاءة يومية</div></div>'
      +   '</div>'
      + '</div>')
    + sectionBlock('تغيّر الأداء', 'مقارنة آخر 7 أيام بالـ 7 التي قبلها', signalsHtml)
    + sectionBlock('نصائح الذكاء الاصطناعي', null, timelineHtml);

    var creativesHtml = renderCreativesTab(Array.isArray(data.creatives) ? data.creatives : []);

    // Audience tab (Pass C) — accepts the breakdowns block emitted by the
    // /inspector endpoint and renders four sections (age, gender, platform,
    // position). The renderer owns all Arabic translation of Meta vocabulary.
    var audienceHtml = renderAudienceTab(data.breakdowns || {}, a, s.kpiFamily || 'messaging');

    destroyInspectorCharts();
    document.getElementById('inspector-body').innerHTML =
        '<div data-tab-panel="overview">'  + overviewHtml  + '</div>'
      + '<div data-tab-panel="creatives" style="display:none;">' + creativesHtml + '</div>'
      + '<div data-tab-panel="audience"  style="display:none;">' + audienceHtml  + '</div>'
      + '<div data-tab-panel="investigate" style="display:none;" id="investigate-panel">'
      +   '<div class="v2-action-empty">اضغط على هذا التبويب لبدء التحقيق الشامل بالذكاء الاصطناعي.</div>'
      + '</div>';

    // Reset the active tab to Overview every time we render new data.
    switchInspectorTab('overview');
    requestAnimationFrame(function () {
      renderInspectorCharts(data.trendSeries || null, a);
    });
  }

  function destroyInspectorCharts() {
    ['inspSpendChart', 'inspResultsChart', 'inspEffChart'].forEach(function (k) {
      destroyChartInstance(state[k]);
      state[k] = null;
    });
  }

  function renderInspectorCharts(ts, account) {
    destroyInspectorCharts();
    if (!ts || !Array.isArray(ts.dates) || !ts.dates.length) {
      showChartEmpty('insp-chart-spend', true);
      showChartEmpty('insp-chart-results', true);
      showChartEmpty('insp-chart-eff', true);
      return;
    }
    var factor = (account && account.currencyMinorFactor) || state.minorFactor || 100;
    var currency = (account && account.currency) || state.currency || 'USD';
    var byDate = {};
    ts.dates.forEach(function (iso, i) {
      byDate[String(iso).slice(0, 10)] = i;
    });
    var end = new Date();
    end.setHours(12, 0, 0, 0);
    var start = new Date(end);
    start.setDate(start.getDate() - 29);
    var labels = [];
    var spendData = [];
    var resultsData = [];
    var effData = [];
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var key = d.toISOString().slice(0, 10);
      labels.push(fmtShortDate(key));
      var idx = byDate[key];
      if (idx == null) {
        spendData.push(null);
        resultsData.push(null);
        effData.push(null);
        continue;
      }
      var spendMinor = Array.isArray(ts.spendMinor) ? Number(ts.spendMinor[idx]) : NaN;
      spendData.push(Number.isFinite(spendMinor) ? spendMinor / factor : null);
      var res = Array.isArray(ts.results) ? Number(ts.results[idx]) : NaN;
      resultsData.push(Number.isFinite(res) ? res : null);
      var cpr = Array.isArray(ts.costPerResult) ? ts.costPerResult[idx] : null;
      effData.push(cpr == null || !Number.isFinite(Number(cpr)) ? null : Number(cpr));
    }

    var hasSpend = spendData.some(function (v) { return v != null && v > 0; });
    var hasResults = resultsData.some(function (v) { return v != null && v > 0; });
    var hasEff = effData.some(function (v) { return v != null && v > 0; });
    showChartEmpty('insp-chart-spend', !hasSpend);
    showChartEmpty('insp-chart-results', !hasResults);
    showChartEmpty('insp-chart-eff', !hasEff);

    if (hasSpend) {
      state.inspSpendChart = makeLineChart('insp-chart-spend', labels, [{
        label: 'الإنفاق (' + currency + ')',
        data: spendData,
        borderColor: '#D9A759',
        _rgb: [217, 167, 89],
        _fmt: 'currency',
        fill: true, tension: 0.35, spanGaps: false,
        pointBackgroundColor: '#D9A759',
      }]);
    }
    if (hasResults) {
      state.inspResultsChart = makeLineChart('insp-chart-results', labels, [{
        label: ts.resultLabelAr || 'النتائج',
        data: resultsData,
        borderColor: '#2DD4BF',
        _rgb: [45, 212, 191],
        _fmt: 'int',
        fill: true, tension: 0.35, spanGaps: false,
        pointBackgroundColor: '#2DD4BF',
      }]);
    }
    if (hasEff) {
      state.inspEffChart = makeLineChart('insp-chart-eff', labels, [{
        label: (ts.efficiencyLabelAr || 'الكفاءة') + ' (' + currency + ')',
        data: effData,
        borderColor: '#60A5FA',
        _rgb: [96, 165, 250],
        _fmt: 'currency',
        fill: true, tension: 0.35, spanGaps: false,
        pointBackgroundColor: '#60A5FA',
      }]);
    }
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
        +     (state.currentInspectorCampaignId
          ? '<a class="btn btn-ghost btn-sm" style="align-self:flex-start;" href="/ad-analysis?campaignId='
            + encodeURIComponent(state.currentInspectorCampaignId)
            + (item.adId ? '&adId=' + encodeURIComponent(item.adId) : '')
            + '">حلّل هذا الإعلان</a>'
          : '')
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
  function renderAudienceTab(breakdowns, account, kpiFamily) {
    var ORDER = ['age', 'gender', 'publisher_platform', 'platform_position'];
    var sections = [];
    var isMessaging = !kpiFamily || kpiFamily === 'messaging';

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
        var clicksText = fmtNum(Number(r.clicks || 0), 0);
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

        var metricsLine = isMessaging
          ? ('الرسائل: <span style="color:var(--text-2);">' + escHtml(msgText) + '</span>'
            + ' · تكلفة الرسالة: <span style="color:var(--text-2);">' + escHtml(cpm) + '</span>'
            + ' · تفاعل الإعلان: <span style="color:var(--text-2);">' + escHtml(ctrText) + '</span>')
          : ('الظهور: <span style="color:var(--text-2);">' + escHtml(fmtNum(Number(r.impressions || 0), 0)) + '</span>'
            + ' · النقرات: <span style="color:var(--text-2);">' + escHtml(clicksText) + '</span>'
            + ' · تفاعل الإعلان: <span style="color:var(--text-2);">' + escHtml(ctrText) + '</span>');

        return ''
          + '<div style="margin:10px 0;direction:rtl;text-align:right;' + rowBg + '">'
          +   '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text);margin-bottom:4px;gap:8px;flex-wrap:wrap;">'
          +     '<span style="font-weight:600;">' + escHtml(labelAr) + winnerBadge + '</span>'
          +     '<span style="color:var(--text-3);font-size:12px;">'
          +       metricsLine
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
  function hideInspectorModal() {
    destroyInspectorCharts();
    document.getElementById('campaign-inspector-modal').style.display = 'none';
  }

  async function openInspector(campaignId, initialTab) {
    if (!state.workspaceId || !campaignId) return;
    state.currentInspectorCampaignId = campaignId;
    var startTab = initialTab || 'overview';
    document.getElementById('inspector-title').textContent = 'تفاصيل الحملة';
    var subtitleEl = document.getElementById('inspector-subtitle');
    subtitleEl.style.direction = 'rtl';
    subtitleEl.style.textAlign = 'right';
    subtitleEl.textContent = 'جارٍ التحميل…';
    document.getElementById('inspector-body').innerHTML =
      '<div style="text-align:center;color:var(--text-3);padding:24px;direction:rtl;">جارٍ تحميل البيانات…</div>';
    switchInspectorTab(startTab);
    showInspectorModal();
    try {
      var data = await apiFetch('/api/workspaces/' + state.workspaceId + '/campaigns/' + encodeURIComponent(campaignId) + '/inspector?days=30');
      try {
        renderInspector(data);
        switchInspectorTab(startTab);
        if (startTab === 'investigate') loadInvestigation(campaignId);
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
    runDataObserver(workspaceId);
  }

  // ── Data observer — detect and report account/campaign divergence ─────
  function runDataObserver(workspaceId) {
    if (!workspaceId) return;
    apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/data-health', {}, 10000)
      .then(function(health) {
        var banner = document.getElementById('data-observer-banner');
        var msgEl = document.getElementById('observer-msg');
        var fixBtn = document.getElementById('observer-fix-btn');
        if (!banner || !msgEl) return;

        var parts = [];
        if (health.divergenceStatus === 'HIGH' || health.divergenceStatus === 'MODERATE') {
          parts.push('فرق بين إجمالي الحساب وإجمالي الحملات: ' + health.divergencePct + '% — '
            + (health.divergenceStatus === 'HIGH' ? 'فرق كبير' : 'فرق معتدل'));
        }
        if (health.dormantActiveCampaigns > 0 || health.staleActiveCount > 0) {
          var dormantN = health.dormantActiveCampaigns || health.staleActiveCount || 0;
          var deliveringN = (health.campaignCounts && health.campaignCounts.deliveringInWindow) || health.activeCampaigns || 0;
          var metaN = health.metaActiveCampaigns || (health.campaignCounts && health.campaignCounts.activeStatus) || 0;
          parts.push(deliveringN + ' حملة تعمل فعلياً · ' + dormantN + ' تحتاج مراجعة · ' + metaN + ' معلّمة نشطة في المنصة');
        }
        if (health.orphanedCount > 0) {
          parts.push(health.orphanedCount + ' حملة محذوفة — بياناتها القديمة مدمجة مع الجديدة');
        }
        if (Array.isArray(health.checks)) {
          health.checks.filter(function(ch) { return ch.severity === 'CRITICAL' || ch.severity === 'WARN'; }).forEach(function(ch) {
            if (ch.messageAr) parts.push(ch.messageAr);
          });
        }

        if (parts.length === 0) {
          banner.style.display = 'flex';
          banner.className = 'data-observer-banner ok';
          msgEl.textContent = 'البيانات متسقة — لا توجد مشاكل.';
          fixBtn.style.display = 'none';
          setTimeout(function() { banner.style.display = 'none'; }, 5000);
          return;
        }

        banner.style.display = 'flex';
        banner.className = 'data-observer-banner warn';
        msgEl.textContent = parts.join(' · ');
        if (health.orphanedCount > 0) {
          fixBtn.style.display = '';
          fixBtn.onclick = function() {
            fixBtn.disabled = true;
            fixBtn.textContent = 'جارٍ التنظيف…';
            apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/data-health?cleanup=true', {}, 15000)
              .then(function(result) {
                toast('تم تنظيف ' + (result.orphanedRowsDeleted || 0) + ' صف بيانات قديمة', 'success');
                fixBtn.style.display = 'none';
                loadCampaignData();
                setTimeout(function() { runDataObserver(workspaceId); }, 2000);
              })
              .catch(function() {
                toast('تعذّر تنظيف البيانات', 'error');
                fixBtn.disabled = false;
                fixBtn.textContent = 'تنظيف البيانات';
              });
          };
        } else {
          fixBtn.style.display = 'none';
        }
      })
      .catch(function() { /* silently skip if the endpoint is unavailable */ });
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

    // Sortable headers — clicking a column switches to that metric sort.
    // Numeric columns start descending; text columns ascending.
    document.getElementById('campaigns-thead').addEventListener('click', function(e) {
      var th = e.target && e.target.closest && e.target.closest('.th-sort');
      if (!th) return;
      var key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = (key === 'name' || key === 'status' || key === 'deliveryRank' || key === 'costPerResult') ? 1 : -1;
      }
      state.sortPreset = 'custom';
      var hint = document.getElementById('sort-hint');
      if (hint) hint.textContent = 'الترتيب: حسب العمود المحدد';
      document.querySelectorAll('#campaigns-thead .th-sort').forEach(function(el) {
        el.classList.remove('is-sorted', 'asc', 'desc');
      });
      th.classList.add('is-sorted', state.sortDir === 1 ? 'asc' : 'desc');
      applyFilters();
    });

    // Delivery status + sort selects (Ads Manager toolbar).
    var statusSelect = document.getElementById('status-filter-select');
    if (statusSelect) {
      statusSelect.value = state.statusFilter;
      statusSelect.addEventListener('change', function() {
        state.statusFilter = statusSelect.value || 'DELIVERING';
        applyFilters();
      });
    }
    var sortPresetSelect = document.getElementById('sort-preset-select');
    if (sortPresetSelect) {
      sortPresetSelect.value = state.sortPreset;
      sortPresetSelect.addEventListener('change', function() {
        applySortPreset(sortPresetSelect.value || 'attention');
        applyFilters();
      });
    }

    document.getElementById('force-sync-btn').addEventListener('click', function() {
      forceSync();
    });

    // Charts live inside a collapsed <details> — remeasure when opened.
    var trendsEl = document.getElementById('camp-trends');
    if (trendsEl) {
      var trendsAction = trendsEl.querySelector('.camp-trends-action');
      function syncTrendsActionLabel() {
        if (trendsAction) trendsAction.textContent = trendsEl.open ? 'إخفاء الرسوم' : 'عرض الرسوم';
      }
      syncTrendsActionLabel();
      trendsEl.addEventListener('toggle', function() {
        syncTrendsActionLabel();
        if (!trendsEl.open) return;
        requestAnimationFrame(function() {
          updateCharts(state.insights);
          [state.spendChart, state.ctrChart, state.resultsChart, state.frequencyChart, state.cpmChart, state.cprChart].forEach(function(c) {
            if (c) try { c.resize(); } catch (e) {}
          });
        });
      });
    }

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
      openInspector(btn.getAttribute('data-campaign-id'), btn.getAttribute('data-tab') || 'overview');
    });

    document.getElementById('display-mode-toggle').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.view-btn');
      if (!btn) return;
      setDisplayMode(btn.getAttribute('data-view') || 'table');
    });
    setDisplayMode('table');

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
      renderFreshnessStrip(state.insights);
      applyFilters();

      // Show container BEFORE creating charts — Chart.js needs a laid-out
      // canvas to measure dimensions. Creating inside display:none → 0×0.
      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';

      // Defer chart creation to the next frame so the browser has painted
      // the layout and canvas dimensions are resolved.
      requestAnimationFrame(function() {
        updateCharts(state.insights);
        runDataObserver(workspaceId);
      });
      staggerReveal(['.camp-kpi-row', '#data-observer-banner', '#fresh-strip', '.camp-trends', '.table-wrap']);

    } catch (err) {
      showError(friendlyApiError(err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'الحملات', active: 'campaigns', content, scripts });
}
