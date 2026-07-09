// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboardPage.ts
//
//  Dashboard — the premium overview. Shell is provided by layout(); this
//  file owns ONLY the page-specific markup and client logic.
//
//  Sections (top → bottom):
//    1. Financial Health row    — 30d / 7d / Lifetime (90d window) spend
//    2. Executive Pulse Banner  — single human-readable business health statement
//    3. AI Motion Ticker        — marquee feeding off brain.cmoFeedV2 + issues
//    4. Active Ads Showcase     — green-blink grid of currently-spending campaigns
//    5. Split panel             — AI Brain Box (left) + Spend chart (right)
//    6. Main Move card          — unified #1 priority + narrative + lower-priority expand
//    7. Spotlight               — best campaign + opportunity
//    8. V6 Brain detail         — CMO Feed, Interventions Ledger
//    9. Advanced Analytics      — collapsed KPI grid, Live Pulse metrics, charts, issues
//
//  Data-binding contract (verified against schema + server.ts):
//    /api/dashboard/:wsId                       → brain, health, issues, kpis, ...
//    /api/workspaces/:wsId/insights?days=90     → DailyStat[] (DESC, spend BigInt MINOR)
//    /api/workspaces/:wsId/campaigns            → Campaign[] (budgets BigInt MINOR)
//    /api/workspaces/:wsId                      → adAccounts[currency, currencyMinorFactor]
//    Full auto-refresh (30s, tab visible)         → dashboard + insights + campaigns
//    Live Pulse comes from dashboard DTO brain.livePulse (no separate pulse poll)
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';
import { dashboardStyles } from './dashboard/dashboardStyles';
import { i18nHelpersJs } from './dashboard/lib/i18n';
import { formatHelpersJs } from './dashboard/lib/format';
import { currencyHelpersJs } from './dashboard/lib/currency';
import { renderKpisJs } from './dashboard/sections/kpis';
import { renderIssuesJs } from './dashboard/sections/issues';
import { renderDiagnosesJs } from './dashboard/sections/diagnoses';

export function dashboardPage(): string {
  const extraHead = dashboardStyles;

  const content = `
    <div class="loading-overlay" id="loading-state">
      <div class="dash-skeleton" id="dash-skeleton" aria-hidden="true">
        <div class="skeleton-hero-grid">
          <div class="skeleton-block skeleton-hero"></div>
          <div class="skeleton-block skeleton-hero"></div>
          <div class="skeleton-block skeleton-hero"></div>
        </div>
        <div class="skeleton-block skeleton-chart"></div>
      </div>
    </div>

    <div class="onboarding-overlay" id="onboarding-overlay" style="display:none;">
      <div class="onboarding-card">
        <div class="onboarding-icon">⚡</div>
        <div class="onboarding-title" id="onboarding-title">جارٍ تجهيز لوحة التحكم</div>
        <div class="onboarding-msg" id="onboarding-msg">نحلل آخر 30 يوماً من حملاتك…</div>
        <div class="onboarding-progress"><div class="onboarding-progress-bar" id="onboarding-bar"></div></div>
        <div class="onboarding-meta" id="onboarding-meta">يستغرق هذا عادةً دقيقة واحدة</div>
      </div>
    </div>

    <div id="error-state" style="display:none;">
      <div class="alert alert-error" id="error-msg">An error occurred.</div>
    </div>

    <div id="dashboard-content" style="display:none;">
      <div class="page-header">
        <div class="page-title">لوحة التحكم</div>
        <div class="page-subtitle" id="dash-subtitle">نظرة عامة على أداء إعلاناتك · <span id="dash-last-updated" class="text-3">—</span></div>
      </div>

      <!-- Stale-data banner -->
      <div class="alert alert-warning" id="stale-banner">
        <div style="flex:1;">
          <div style="font-weight:600;">تُعرض بيانات مخزّنة — انتهت صلاحية الرمز</div>
          <div style="font-size:12px;margin-top:2px;color:var(--text-2);">انتهت صلاحية رمز حساب الإعلانات. هذه الأرقام من آخر مزامنة ناجحة.</div>
        </div>
        <a href="/workspace" class="btn btn-primary btn-sm">إعادة الربط</a>
      </div>

      <!-- 1 ▸ Financial hero cards -->
      <section class="hero-grid" id="hero-grid">
        <div class="hero-card" id="hero-30">
          <div class="hero-label">إنفاق 30 يوماً <button type="button" class="info-btn" data-metric-info="spend" title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>
          <div class="hero-value" id="hero-30-val">—</div>
          <div class="hero-sub">آخر 30 يوماً</div>
          <span class="hero-delta flat" id="hero-30-delta">→ —</span>
        </div>
        <div class="hero-card success" id="hero-7">
          <div class="hero-label">إنفاق 7 أيام <button type="button" class="info-btn" data-metric-info="spend" title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>
          <div class="hero-value" id="hero-7-val">—</div>
          <div class="hero-sub">آخر 7 أيام</div>
          <span class="hero-delta flat" id="hero-7-delta">→ —</span>
        </div>
        <div class="hero-card warning" id="hero-life">
          <div class="hero-label">الإنفاق الكلي <button type="button" class="info-btn" data-metric-info="spend" title="ما هذا؟" aria-label="شرح المؤشر">i</button></div>
          <div class="hero-value" id="hero-life-val">—</div>
          <div class="hero-sub" id="hero-life-sub">سجل الحساب (نافذة 90 يوماً)</div>
          <span class="hero-delta flat">إجمالي الحساب</span>
        </div>
      </section>

      <!-- 2 ▸ Executive Pulse Banner (Tier 1) -->
      <section id="exec-pulse-section" class="exec-pulse-banner healthy" style="display:none;" dir="auto">
        <div class="exec-pulse-text" id="exec-pulse-text">—</div>
      </section>

      <!-- 3 ▸ AI Motion Ticker -->
      <section class="ticker-wrap" id="ticker-wrap" style="display:none;" dir="auto">
        <div class="ticker-header">
          <div class="ticker-header-left">
            <span class="ticker-live-dot"></span>
            <span class="ticker-header-title" id="ticker-title">مراقب الذكاء الاصطناعي</span>
          </div>
          <div class="ticker-freshness" id="ticker-freshness"></div>
        </div>
        <div class="ticker-scroll-area">
          <div class="ticker-track" id="ticker-track" dir="auto"></div>
        </div>
      </section>

      <!-- 3b ▸ AI Context Strip — account snapshot for AI monitoring -->
      <div class="ai-context-strip" id="ai-context-strip" style="display:none;" dir="auto">
        <div class="ai-ctx-pill ai-ctx-pill-primary" id="ai-ctx-campaigns"></div>
        <div class="ai-ctx-pill" id="ai-ctx-window"></div>
        <div class="ai-ctx-pill" id="ai-ctx-sync"></div>
        <div class="ai-ctx-pill ai-ctx-pill-muted" id="ai-ctx-interval"></div>
      </div>

      <!-- 3 ▸ Active Ads Showcase -->
      <section class="active-section" id="active-section" style="display:none;">
        <div class="active-header">
          <div class="active-title">إعلانات نشطة · تُنفق الآن</div>
          <div class="active-meta" id="active-meta">—</div>
        </div>
        <div class="active-grid" id="active-grid"></div>
      </section>

      <!-- 4 ▸ Bottom Split Panel — AI Brain Box (left) + Spend chart (right) -->
      <section class="split-grid">
        <div class="brain-box">
          <div class="brain-box-head">
            <div class="brain-box-icon">AI</div>
            <div class="brain-box-title">مساعدك الذكي</div>
            <div class="brain-box-sub" id="brain-box-sub">—</div>
          </div>
          <div id="strategy-list" dir="auto">
            <div class="v2-action-empty">Analyzing…</div>
          </div>
        </div>
        <div class="chart-panel">
          <div class="chart-panel-head">
            <div class="chart-panel-title">الأداء · الإنفاق عبر الزمن</div>
            <div class="chart-panel-meta" id="chart-panel-meta">—</div>
          </div>
          <div class="chart-panel-canvas"><canvas id="chart-spend-main"></canvas><div class="chart-empty" id="chart-spend-main-empty" style="display:none;">لا توجد بيانات إنفاق في هذه الفترة</div></div>
        </div>
      </section>

      <!-- 5 ▸ Main Move — unified focus (Tier 2 + Tier 3 narrative) -->
      <section class="v2-section" id="main-move-section">
        <div class="v2-section-head">
          <div class="v2-section-title" id="main-move-label">الخطوة الأهم</div>
          <div class="v2-section-meta" id="main-move-meta">—</div>
        </div>
        <div class="main-move-card" id="main-move-card">
          <div class="main-move-empty" id="main-move-empty">جارٍ التحميل…</div>
        </div>
      </section>

      <section class="v2-section below-chart-section" id="v2-spotlight-section" style="display:none;">
        <div class="v2-spotlight-grid" id="v2-spotlight"></div>
      </section>

      <!-- Main Move action modal (remediation workflow) -->
      <div id="main-move-action-modal" class="modal-overlay" style="display:none;">
        <div class="modal" role="dialog" aria-labelledby="action-modal-title" style="max-width:520px;width:92%;">
          <div class="modal-title" id="action-modal-title">—</div>
          <div class="modal-subtitle" id="action-modal-subtitle">—</div>
          <div class="action-modal-steps" id="action-modal-steps"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="action-modal-cancel">إلغاء</button>
            <button type="button" class="btn btn-primary btn-sm" id="action-modal-confirm">I've applied this</button>
          </div>
        </div>
      </div>

      <!-- 7 ▸ Advanced Analytics (collapsed) -->
      <details class="v2-advanced">
        <summary>
          التحليلات المتقدمة
          <span>نبض مباشر · مؤشرات · اتجاهات · تشخيص · حملات</span>
        </summary>
        <div class="v2-advanced-body">
          <div class="adv-shell">

            <!-- 1. Live pulse -->
            <section class="adv-panel" id="brain-pulse-section" style="display:none;">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">الآن</div>
                  <div class="adv-panel-title">النبض المباشر</div>
                </div>
                <div class="adv-panel-meta">يتحدّث كل 30 ثانية · <span id="brain-pulse-tick">—</span></div>
              </div>
              <div class="adv-pulse-grid">
                <div class="adv-pulse-card">
                  <div id="brain-pulse-burn-label" class="adv-pulse-label">سرعة الإنفاق</div>
                  <div id="brain-pulse-burn" class="adv-pulse-value">—</div>
                  <div class="adv-pulse-sub"><span id="brain-pulse-burn-n">0</span> <span id="brain-pulse-burn-meta">حملة</span></div>
                </div>
                <div class="adv-pulse-card">
                  <div id="brain-pulse-spend-label" class="adv-pulse-label">حصة إنفاق اليوم</div>
                  <div id="brain-pulse-spendpct" class="adv-pulse-value">—</div>
                  <div id="brain-pulse-spend-meta" class="adv-pulse-sub">من الميزانية اليومية</div>
                </div>
                <div class="adv-pulse-card">
                  <div id="brain-pulse-dna-label" class="adv-pulse-label">التشابه مع الأفضل</div>
                  <div id="brain-pulse-dna" class="adv-pulse-value">—</div>
                  <div id="brain-pulse-dna-meta" class="adv-pulse-sub">مقارنةً بأفضل حملاتك</div>
                </div>
              </div>
            </section>

            <!-- 2. Window KPIs -->
            <section class="adv-panel">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">آخر 30 يوماً</div>
                  <div class="adv-panel-title">مؤشرات النافذة</div>
                </div>
              </div>
              <div class="kpi-grid adv-kpi-grid" id="kpi-grid"></div>
            </section>

            <!-- 3. Trends -->
            <section class="adv-panel">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">آخر 30 يوماً</div>
                  <div class="adv-panel-title">الاتجاهات</div>
                </div>
              </div>
              <div class="chart-grid adv-chart-grid">
                <div class="chart-card" id="adv-ctr-card">
                  <div class="chart-card-header"><div class="chart-card-title" id="chart-ctr-title">اتجاه تفاعل الإعلان</div></div>
                  <div class="chart-canvas-wrap"><canvas id="chart-ctr"></canvas></div>
                </div>
                <div class="chart-card" id="adv-msgs-card">
                  <div class="chart-card-header"><div class="chart-card-title">اتجاه الرسائل</div></div>
                  <div class="chart-canvas-wrap"><canvas id="chart-impressions"></canvas></div>
                </div>
              </div>
            </section>

            <!-- 4. Attribution -->
            <div id="attribution-section" class="adv-panel" style="display:none;"></div>

            <!-- 5. Diagnoses -->
            <section id="diagnoses-section" class="adv-panel" style="display:none;">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">الخطوة التالية</div>
                  <div class="adv-panel-title">التشخيص والتوصيات</div>
                  <div class="adv-panel-sub">لماذا تغيّرت النتائج · وماذا تفعل الآن</div>
                </div>
              </div>
              <div class="diagnosis-grid" id="diagnoses-grid"></div>
            </section>

            <!-- 6. Alerts -->
            <section class="adv-panel">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">مراقبة</div>
                  <div class="adv-panel-title">التنبيهات والمشاكل</div>
                  <div class="adv-panel-sub">ملاحظات مرتبة حسب الأولوية</div>
                </div>
              </div>
              <div id="issues-list"><div class="adv-empty-ok">لا توجد مشاكل — حسابك يعمل بشكل جيد.</div></div>
            </section>

            <!-- 7. Campaigns -->
            <section class="adv-panel adv-campaigns-wrap">
              <div class="adv-panel-head">
                <div>
                  <div class="adv-panel-kicker">الحساب</div>
                  <div class="adv-panel-title">أداء الحملات</div>
                  <div class="adv-panel-sub">الأفضل والأسوأ أولاً، ثم الأعلى إنفاقاً</div>
                </div>
              </div>
              <div class="table-wrap" style="border:none;background:transparent;overflow-x:auto;">
                <table class="adv-campaigns-table">
                  <thead>
                    <tr>
                      <th>الحملة</th>
                      <th>الحالة</th>
                      <th>الإنفاق</th>
                      <th>النتائج</th>
                      <th>التفاعل</th>
                      <th>ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody id="campaigns-tbody">
                    <tr><td colspan="6" class="text-3" style="text-align:center;padding:18px;">جارٍ التحميل…</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </div>
      </details>
    </div>
  `;

  const scripts = `
<script src="/vendor/chart.umd.min.js"></script>
<script>
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  var REFRESH_MS = 30000;
  var refreshTimer = null;
  var chartInstances = {};
  var chartResizeBound = false;
  var pendingAdvancedCharts = null;
  var CHART_MAIN_H = 280;
  var CHART_CARD_H = 220;

  function lockChartBox(canvasId, heightPx) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    var box = canvas.parentElement;
    box.style.height = heightPx + 'px';
    box.style.maxHeight = heightPx + 'px';
    box.style.minHeight = heightPx + 'px';
    box.style.overflow = 'hidden';
  }

  function isElementVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40;
  }

  function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
      try { chartInstances[canvasId].destroy(); } catch (e) {}
      delete chartInstances[canvasId];
    }
  }

  function resizeAllCharts() {
    Object.keys(chartInstances).forEach(function (id) {
      var canvas = document.getElementById(id);
      if (!canvas || !isElementVisible(canvas)) return;
      try { chartInstances[id].resize(); } catch (e) {}
    });
  }

  function bindChartResize() {
    if (chartResizeBound) return;
    chartResizeBound = true;
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeAllCharts, 150);
    });
    var details = document.querySelector('.v2-advanced');
    if (details) {
      details.addEventListener('toggle', function () {
        if (details.open) {
          renderAdvancedCharts(true);
          setTimeout(resizeAllCharts, 50);
        }
      });
    }
  }

  function buildDataset(label, data, color, bg, fillArea) {
    return {
      label: label,
      data: data,
      borderColor: color,
      backgroundColor: bg,
      fill: fillArea !== false,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true,
    };
  }

  function makeLineChart(canvasId, labels, datasets, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var heightPx = (canvasId === 'chart-spend-main') ? CHART_MAIN_H : CHART_CARD_H;
    lockChartBox(canvasId, heightPx);

    if (!isElementVisible(canvas) && canvasId !== 'chart-spend-main') {
      return null;
    }

    if (chartInstances[canvasId]) {
      chartInstances[canvasId].data.labels = labels;
      chartInstances[canvasId].data.datasets = datasets;
      chartInstances[canvasId].update('none');
      return chartInstances[canvasId];
    }

    destroyChart(canvasId);
    var ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
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
            backgroundColor: '#221D19',
            borderColor: '#3D352D',
            borderWidth: 1,
            titleColor: '#F3EFE7',
            bodyColor: '#B8AC9C',
            padding: 10,
            filter: function (item) { return !(item.dataset && item.dataset.isIssueMarkers); },
          }
        },
        scales: {
          x: {
            grid: { color: '#322B25' },
            ticks: { color: '#746A5C', maxTicksLimit: (opts && opts.maxTicks) || 7, font: { size: 11 } },
          },
          y: {
            grid: { color: '#322B25' },
            ticks: { color: '#746A5C', font: { size: 11 } },
            beginAtZero: true,
          }
        },
        elements: { point: { radius: 0, hoverRadius: 4 } },
        onClick: function (evt, elements, chart) {
          if (!elements || !elements.length) return;
          var el = elements[0];
          var ds = chart.data.datasets[el.datasetIndex];
          if (ds && ds.isIssueMarkers && ds.pointDates && ds.pointDates[el.index]) {
            openTimelineAttribution(ds.pointDates[el.index]);
          }
        },
      }
    });
    bindChartResize();
    return chartInstances[canvasId];
  }

  function renderAdvancedCharts(force) {
    if (!pendingAdvancedCharts) return;
    var details = document.querySelector('.v2-advanced');
    if (!force && details && !details.open) return;
    var p = pendingAdvancedCharts;
    var hasCtr = p.ctrSeries.some(function (v) { return v > 0; });
    var hasMsgs = p.impSeries.some(function (v) { return v > 0; });
    var ctrCard = document.getElementById('adv-ctr-card');
    var msgCard = document.getElementById('adv-msgs-card');
    if (ctrCard) ctrCard.style.display = hasCtr ? '' : 'none';
    if (msgCard) msgCard.style.display = hasMsgs ? '' : 'none';
    if (hasCtr) {
      makeLineChart('chart-ctr', p.labels, [
        buildDataset(lbl('Ad engagement (%)', 'تفاعل الإعلان (٪)'), p.ctrSeries, '#34A871', 'rgba(52,168,113,0.08)'),
      ]);
    }
    if (hasMsgs) {
      makeLineChart('chart-impressions', p.labels, [
        buildDataset(lbl('Messages', 'الرسائل'), p.impSeries, '#C77A1F', 'rgba(199,122,31,0.08)'),
      ]);
    }
  }

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
  var state = {
    currency: 'USD',
    minorFactor: 100,
    workspaceId: null,
    locale: 'EN',
    mainMovePrimary: null,
    lastInsights: [],
    lastCampaigns: [],
    lastSyncedAt: null,
    lastIssues: [],
    lastIssueDates: [],
  };

  ${i18nHelpersJs}

  // ── helpers ─────────────────────────────────────────────────────────────
  ${formatHelpersJs}
  ${currencyHelpersJs}

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  function formatLastUpdated(isoOrDate) {
    if (!isoOrDate) return '—';
    try {
      return new Date(isoOrDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return '—'; }
  }
  function updateLastUpdatedLabel(dashData) {
    var el = document.getElementById('dash-last-updated');
    if (!el) return;
    var synced = dashData.workspace && dashData.workspace.lastSyncedAt;
    el.textContent = synced
      ? (lbl('Synced ', 'آخر مزامنة ') + formatLastUpdated(synced))
      : (lbl('Updated ', 'حُدّث ') + formatLastUpdated(new Date()));
  }

  // ── Hero cards ──────────────────────────────────────────────────────────
  function findKpi(dashData, key) {
    return (dashData.kpis || []).find(function (k) { return k.key === key; });
  }
  function renderHero(dashData, insights90) {
    var h30 = document.getElementById('hero-30-val');
    var h7 = document.getElementById('hero-7-val');
    var hLife = document.getElementById('hero-life-val');
    var hLifeSub = document.getElementById('hero-life-sub');
    if (!h30 || !h7 || !hLife) return;
    if (state.lastSyncedAt) {
      document.querySelectorAll('#hero-grid .info-btn[data-metric-info]').forEach(function (btn) {
        btn.setAttribute('data-freshness', state.lastSyncedAt);
      });
    }
    var arr = Array.isArray(insights90) ? insights90 : [];
    var spendKpi = findKpi(dashData, 'spend');
    var spend7 = sumMinor(arr.slice(0, 7));
    var spend90 = sumMinor(arr);

    // 30d hero: authoritative KPI from getDashboard DTO (single source of truth).
    if (spendKpi && spendKpi.display) {
      tickText(h30, spendKpi.display);
    } else {
      tickText(h30, fmtCurrencyMinor(sumMinor(arr.slice(0, 30))));
    }

    tickText(h7, fmtCurrencyMinor(spend7));
    var lifeMinor = (dashData.lifetimeSpend && dashData.lifetimeSpend.syncedAt != null)
      ? dashData.lifetimeSpend.minor
      : spend90; // fallback if lifetime sync pending
    tickText(hLife, fmtCurrencyMinor(lifeMinor));

    function applyDelta(el, pct, goodWhenUp) {
      if (pct == null) { el.className = 'hero-delta flat'; el.textContent = '→ —'; return; }
      var up = pct >= 0;
      var arrow = up ? '↑' : '↓';
      var cls = (up === !!goodWhenUp) ? 'up' : 'down';
      // Spend going up is bad for cost-control; goodWhenUp = false
      el.className = 'hero-delta ' + cls;
      el.textContent = arrow + ' ' + Math.abs(pct).toFixed(1) + '% ' + lbl('vs prior', 'مقابل السابق');
    }

    // 30d delta: align with KPI DTO when present (30d vs prior-30d server math).
    var d30 = (spendKpi && spendKpi.deltaPct != null)
      ? Number(spendKpi.deltaPct) * 100
      : (function () {
          var spend30 = sumMinor(arr.slice(0, 30));
          var prior30 = sumMinor(arr.slice(30, 60));
          return prior30 > 0 ? ((spend30 - prior30) / prior30) * 100 : null;
        })();
    applyDelta(document.getElementById('hero-30-delta'), d30, false);

    // 7d delta: insights fallback only (no 7d KPI in DTO).
    var prior7 = sumMinor(arr.slice(7, 14));
    var d7 = prior7 > 0 ? ((spend7 - prior7) / prior7) * 100 : null;
    applyDelta(document.getElementById('hero-7-delta'), d7, false);

    // Lifetime sub: authoritative Meta lifetime when synced, else honest window label.
    var days = Math.min(arr.length, 90);
    if (hLifeSub) {
      hLifeSub.textContent =
        (dashData.lifetimeSpend && dashData.lifetimeSpend.syncedAt)
          ? lbl('Meta account lifetime total', 'إجمالي حساب Meta الكلي')
          : ('Account history (' + days + '-day window)');
    }
  }

  // ── AI Motion Ticker (Enhanced) ──────────────────────────────────────────
  function buildTickerItems(dashData) {
    var items = [];
    var cmoFeedV2 = (dashData.brain && Array.isArray(dashData.brain.cmoFeedV2)) ? dashData.brain.cmoFeedV2 : [];
    cmoFeedV2.slice(0, 6).forEach(function (it) {
      if (it.title) {
        var sev = it.severity === 'CRITICAL' ? 'critical' : it.severity === 'HIGH' ? 'warning' : 'success';
        items.push({
          category: 'strategy',
          badge: lbl('Strategy', 'استراتيجية'),
          severity: sev,
          text: it.title + (it.campaignName ? ' — ' + it.campaignName : ''),
          explain: it.body || lbl('AI-generated strategic recommendation', 'توصية استراتيجية من الذكاء الاصطناعي'),
        });
      }
    });
    var issues = Array.isArray(dashData.issues) ? dashData.issues : [];
    issues.slice(0, 5).forEach(function (iss) {
      var sev = (iss.severity || 'low').toLowerCase();
      var mappedSev = sev === 'critical' ? 'critical' : sev === 'high' ? 'warning' : sev === 'medium' ? 'warning' : 'success';
      var rec = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      items.push({
        category: 'alert',
        badge: lbl('Alert', 'تنبيه'),
        severity: mappedSev,
        text: (iss.title || iss.code || lbl('Observation', 'ملاحظة')) + (rec ? ' — ' + rec : ''),
        explain: rec
          ? lbl('Recommended action: ', 'الإجراء المقترح: ') + rec
          : lbl('Review this alert in the issues panel below', 'راجع هذا التنبيه في لوحة المشاكل أدناه'),
      });
    });
    var kpis = Array.isArray(dashData.kpis) ? dashData.kpis : [];
    kpis.slice(0, 4).forEach(function (k) {
      if (k.deltaPct == null) return;
      var pct = Math.abs(Number(k.deltaPct) * 100).toFixed(1);
      var dir = k.direction === 'up' ? lbl('up', 'ارتفاع') : lbl('down', 'انخفاض');
      var isGood = k.direction === 'up' ? (k.goodWhenUp !== false) : (k.goodWhenUp === false);
      items.push({
        category: 'performance',
        badge: lbl('KPI', 'مؤشر'),
        severity: isGood ? 'success' : 'warning',
        text: (k.label || k.key) + ' ' + dir + ' ' + pct + '%',
        explain: isGood
          ? lbl('Positive trend — continue current strategy', 'اتجاه إيجابي — استمر في الاستراتيجية الحالية')
          : lbl('Needs attention — AI is monitoring for further decline', 'يحتاج اهتمام — الذكاء الاصطناعي يراقب أي انخفاض إضافي'),
      });
    });
    // Intra-day pulse if available
    var pulse = dashData.brain && dashData.brain.livePulse;
    if (pulse && pulse.intraDaySpendPct != null) {
      items.push({
        category: 'insight',
        badge: lbl('Today', 'اليوم'),
        severity: 'success',
        text: lbl('Budget pacing: ', 'سرعة الإنفاق: ') + pulse.intraDaySpendPct.toFixed(1) + '% ' + lbl('spent', 'أُنفق'),
        explain: lbl('Percentage of daily budget spent so far today', 'نسبة الميزانية اليومية المنفقة حتى الآن'),
      });
    }
    if (items.length === 0) {
      items.push({
        category: 'insight',
        badge: lbl('Status', 'الحالة'),
        severity: 'success',
        text: lbl('AI is monitoring your account — no active alerts', 'الذكاء الاصطناعي يراقب حسابك — لا توجد تنبيهات'),
        explain: lbl('All metrics are within normal ranges. You will be notified when action is needed.', 'جميع المؤشرات ضمن النطاق الطبيعي. سيتم إعلامك عند الحاجة لإجراء.'),
      });
    }
    return items;
  }
  function renderTicker(items, dashData) {
    if (!items || items.length === 0) return;
    var wrap = document.getElementById('ticker-wrap');
    var track = document.getElementById('ticker-track');
    var titleEl = document.getElementById('ticker-title');
    var freshnessEl = document.getElementById('ticker-freshness');
    if (!wrap || !track) return;

    if (titleEl) titleEl.textContent = lbl('AI Monitor', 'مراقب الذكاء الاصطناعي');

    if (freshnessEl) {
      var synced = dashData && dashData.workspace && dashData.workspace.lastSyncedAt;
      if (synced) {
        var ago = Math.round((Date.now() - new Date(synced).getTime()) / 60000);
        var agoText = ago < 2 ? lbl('Just now', 'الآن') : ago < 60 ? ago + lbl('m ago', 'د') : Math.round(ago / 60) + lbl('h ago', 'س');
        var isStale = ago > 30;
        freshnessEl.innerHTML = '<span class="ticker-freshness-dot' + (isStale ? ' stale' : '') + '"></span> '
          + lbl('Data: ', 'البيانات: ') + escHtml(agoText);
      } else {
        freshnessEl.innerHTML = '';
      }
    }

    var catIcon = { strategy: '🎯', alert: '⚠️', performance: '📊', insight: '💡' };
    var shown = items.slice(0, 4);
    track.innerHTML = shown.map(function (it) {
      var icon = catIcon[it.category] || '•';
      var catCls = 'cat-' + (it.category || 'insight');
      var explain = it.explain
        ? '<div class="ticker-explain" dir="auto">' + escHtml(it.explain) + '</div>'
        : '';
      return '<div class="ticker-item">'
        + '<div class="ticker-item-top">'
          + '<span class="ticker-icon">' + icon + '</span>'
          + '<span class="ticker-badge ' + catCls + '">' + escHtml(it.badge) + '</span>'
        + '</div>'
        + '<div class="ticker-text" dir="auto">' + escHtml(it.text) + '</div>'
        + explain
      + '</div>';
    }).join('');
    wrap.style.display = 'block';
  }
  function renderAiContextStrip(dashData, campaigns) {
    var strip = document.getElementById('ai-context-strip');
    if (!strip) return;
    var cc = dashData && dashData.workspace && dashData.workspace.campaignCounts;
    var delivering = cc ? cc.deliveringInWindow : 0;
    var spendingToday = cc ? cc.spendingToday : 0;
    var dormant = cc ? cc.dormantActive : 0;
    var total = cc ? cc.total : (Array.isArray(campaigns) ? campaigns.length : 0);
    var synced = dashData && dashData.workspace && dashData.workspace.lastSyncedAt;
    var ctxCampaigns = document.getElementById('ai-ctx-campaigns');
    var ctxWindow = document.getElementById('ai-ctx-window');
    var ctxSync = document.getElementById('ai-ctx-sync');
    var ctxInterval = document.getElementById('ai-ctx-interval');
    if (ctxCampaigns) {
      ctxCampaigns.innerHTML = '<div class="ai-ctx-label">' + lbl('Campaigns', 'الحملات') + '</div>'
        + '<div class="ai-ctx-value"><b>' + delivering + '</b> ' + lbl('delivering', 'تعمل')
        + ' · ' + spendingToday + ' ' + lbl('today', 'اليوم')
        + ' · ' + dormant + ' ' + lbl('dormant', 'بدون إنفاق')
        + ' / ' + total + ' ' + lbl('total', 'إجمالي') + '</div>';
    }
    if (ctxWindow) {
      ctxWindow.innerHTML = '<div class="ai-ctx-label">' + lbl('Analysis window', 'نافذة التحليل') + '</div>'
        + '<div class="ai-ctx-value">' + lbl('Last 30 days', 'آخر 30 يوماً') + '</div>';
    }
    if (ctxSync) {
      var syncTxt = synced
        ? formatLastUpdated(synced)
        : lbl('Awaiting sync', 'بانتظار المزامنة');
      ctxSync.innerHTML = '<div class="ai-ctx-label">' + lbl('Last sync', 'آخر مزامنة') + '</div>'
        + '<div class="ai-ctx-value">' + escHtml(syncTxt) + '</div>';
    }
    if (ctxInterval) {
      ctxInterval.innerHTML = '<div class="ai-ctx-label">' + lbl('Auto-sync', 'المزامنة التلقائية') + '</div>'
        + '<div class="ai-ctx-value">' + lbl('Every 15 minutes', 'كل 15 دقيقة') + '</div>';
    }
    strip.style.display = 'grid';
  }

  // ── Active Ads Showcase ─────────────────────────────────────────────────
  function renderActiveAds(campaigns, campaignCounts) {
    var active = (campaigns || []).filter(function (c) { return c.isCurrentlySpending === true; });
    var sec = document.getElementById('active-section');
    var grid = document.getElementById('active-grid');
    var meta = document.getElementById('active-meta');
    if (!sec || !grid) return;
    if (active.length === 0) { sec.style.display = 'none'; return; }
    // SaaS attention order: highest spend first among campaigns spending now.
    active = active.slice().sort(function (a, b) {
      return (Number(b.spendWindowMinor) || 0) - (Number(a.spendWindowMinor) || 0);
    });
    sec.style.display = 'block';
    if (meta) {
      if (campaignCounts) {
        meta.textContent = campaignCounts.deliveringInWindow + ' ' + lbl('delivering', 'تعمل')
          + ' · ' + campaignCounts.spendingToday + ' ' + lbl('spending today', 'تنفق اليوم')
          + ' · ' + campaignCounts.dormantActive + ' ' + lbl('dormant', 'بدون إنفاق');
      } else {
        meta.textContent = active.length + ' ' + lbl('spending today', 'حملة تُنفق اليوم');
      }
    }
    grid.innerHTML = active.slice(0, 12).map(function (c) {
      var budget = c.dailyBudget
        ? fmtCurrencyMinor(c.dailyBudget) + ' / يوم'
        : (c.lifetimeBudget ? fmtCurrencyMinor(c.lifetimeBudget) + ' ' + lbl('total', 'إجمالي') : lbl('No budget set', 'بدون ميزانية محددة'));
      return '<div class="active-card">'
        + '<div class="active-top">'
          + '<span class="blink-dot"></span>'
          + '<span class="active-name" dir="auto" title="' + escHtml(c.name) + '">' + escHtml(c.name || '—') + '</span>'
        + '</div>'
        + '<div class="active-meta-row"><span>' + escHtml(translateObjective(c.objective)) + '</span><b>' + escHtml(budget) + '</b></div>'
      + '</div>';
    }).join('');
  }

  // ── Steady-state helpers (rich content when no actions pending) ─────────
  function getSteadyState(dashData) {
    return dashData && dashData.steadyState ? dashData.steadyState : null;
  }
  function buildClientSteadyFallback(dashData, kpis) {
    var kp = Array.isArray(kpis) ? kpis : [];
    var ctr = kp.find(function (k) { return k && k.key === 'ctr'; });
    var best = dashData && dashData.bestCampaign;
    var insights = [];
    if (best && best.name) {
      insights.push({
        title: lbl('Top performer holding steady', 'أفضل حملة مستقرة'),
        body: best.name + ' · ' + lbl('Score', 'النتيجة') + ' ' + (best.health != null ? best.health : '—')
          + (best.ctr != null ? ' · CTR ' + Number(best.ctr).toFixed(2) + '%' : ''),
      });
    }
    if (ctr && ctr.display) {
      insights.push({
        title: lbl('Engagement trend', 'اتجاه التفاعل'),
        body: lbl('CTR', 'تفاعل الإعلان') + ' ' + ctr.display
          + (ctr.deltaPct != null ? ' (' + (ctr.direction === 'up' ? '+' : '-') + Math.abs(Number(ctr.deltaPct) * 100).toFixed(1) + '%)' : ''),
      });
    }
    var pulse = dashData && dashData.brain && dashData.brain.livePulse;
    if (pulse && pulse.campaignsObserved) {
      insights.push({
        title: lbl('Background monitoring', 'المراقبة في الخلفية'),
        body: lbl('Watching', 'يراقب') + ' ' + pulse.campaignsObserved + ' ' + lbl('active campaigns', 'حملات نشطة')
          + (pulse.intraDaySpendPct != null ? ' · ' + pulse.intraDaySpendPct.toFixed(1) + '% ' + lbl("of today's budget", 'من ميزانية اليوم') : ''),
      });
    }
    if (insights.length === 0) {
      insights.push({
        title: lbl('Account overview', 'نظرة على الحساب'),
        body: lbl('Metrics are within normal ranges — AI continues monitoring in the background.', 'المؤشرات ضمن النطاقات الطبيعية — الذكاء الاصطناعي يتابع في الخلفية.'),
      });
    }
    return {
      mainMoveTitle: lbl('Campaigns running stable', 'الحملات تعمل باستقرار'),
      mainMoveNarrative: insights[0] ? insights[0].body : '',
      stableCampaigns: best ? [{ name: best.name, health: best.health, ctrDisplay: best.ctr != null ? Number(best.ctr).toFixed(2) + '%' : '—', messages: best.messages || 0 }] : [],
      benchmarks: ctr ? [{ label: lbl('CTR', 'تفاعل الإعلان'), valueDisplay: ctr.display, verdict: lbl('Monitoring', 'مراقبة'), positive: true }] : [],
      backgroundSummary: insights[insights.length - 1] ? insights[insights.length - 1].body : '',
      insights: insights,
    };
  }
  function renderSteadyMainMove(steady) {
    var card = document.getElementById('main-move-card');
    var meta = document.getElementById('main-move-meta');
    if (!card || !steady) return false;
    state.mainMovePrimary = null;
    if (meta) meta.textContent = lbl('Steady state · no action needed', 'مستقر · لا إجراء مطلوب');
    var stableList = Array.isArray(steady.stableCampaigns) ? steady.stableCampaigns : [];
    var stableHtml = stableList.length > 0
      ? '<div class="main-move-steady-list">' + stableList.slice(0, 4).map(function (c) {
          return '<div class="main-move-steady-item" dir="auto"><b>' + escHtml(c.name || '—') + '</b> · '
            + escHtml(lbl('Health', 'الصحة')) + ' ' + escHtml(String(c.health != null ? c.health : '—'))
            + ' · CTR ' + escHtml(c.ctrDisplay || '—')
            + (c.messages ? ' · ' + escHtml(String(c.messages)) + ' ' + escHtml(lbl('results', 'نتائج')) : '')
            + '</div>';
        }).join('') + '</div>'
      : '';
    var benchHtml = Array.isArray(steady.benchmarks) && steady.benchmarks.length > 0
      ? '<div class="main-move-benchmarks">' + steady.benchmarks.slice(0, 4).map(function (b) {
          var cls = b.positive === true ? ' positive' : (b.positive === false ? ' negative' : '');
          return '<div class="main-move-benchmark' + cls + '">'
            + '<span class="main-move-benchmark-label">' + escHtml(b.label) + '</span>'
            + '<span class="main-move-benchmark-value">' + escHtml(b.valueDisplay) + '</span>'
            + '<span class="main-move-benchmark-verdict">' + escHtml(b.verdict) + '</span>'
          + '</div>';
        }).join('') + '</div>'
      : '';
    card.innerHTML = '<div class="main-move-primary steady" dir="auto">'
      + '<div class="main-move-tag">' + escHtml(lbl('Steady performance', 'أداء مستقر')) + '</div>'
      + '<div class="main-move-title">' + escHtml(steady.mainMoveTitle || lbl('Account is steady', 'الحساب مستقر')) + '</div>'
      + stableHtml
      + benchHtml
      + '<div class="main-move-why">' + escHtml(steady.mainMoveNarrative || steady.backgroundSummary || '') + '</div>'
      + (steady.backgroundSummary && steady.backgroundSummary !== steady.mainMoveNarrative
        ? '<div class="main-move-why" style="border-top:none;margin-top:0;padding-top:0;font-size:12.5px;color:var(--text-3);">' + escHtml(steady.backgroundSummary) + '</div>'
        : '')
    + '</div>';
    return true;
  }
  function renderSteadyBrainBox(steady) {
    var list = document.getElementById('strategy-list');
    var sub = document.getElementById('brain-box-sub');
    if (!list || !steady) return false;
    var cards = Array.isArray(steady.insights) ? steady.insights : [];
    if (cards.length === 0) return false;
    list.innerHTML = cards.slice(0, 6).map(function (c) {
      return '<div class="strategy-card low">'
        + '<div class="strategy-head">'
          + '<div class="strategy-title">' + escHtml(c.title) + '</div>'
          + '<span class="strategy-sev">' + escHtml(lbl('Stable', 'مستقر')) + '</span>'
        + '</div>'
        + '<div class="strategy-body">' + escHtml(c.body) + '</div>'
      + '</div>';
    }).join('');
    if (sub) sub.textContent = cards.length + ' ' + lbl(cards.length === 1 ? 'insight' : 'insights', cards.length === 1 ? 'رؤية' : 'رؤى');
    return true;
  }

  // ── AI Brain Box (strategy cards — skips Main Move #1 to avoid duplication) ─
  function renderBrainBox(dashData) {
    var list = document.getElementById('strategy-list');
    var sub  = document.getElementById('brain-box-sub');
    var cards = [];
    var mainPrimary = buildAllMoveItems(dashData)[0];
    var skipTitle = mainPrimary ? mainPrimary.title : '';

    function shouldSkip(title, body) {
      if (!skipTitle) return false;
      return textsOverlap(title, skipTitle) || textsOverlap(body, skipTitle);
    }

    var feed = (dashData.brain && Array.isArray(dashData.brain.cmoFeedV2)) ? dashData.brain.cmoFeedV2 : [];
    feed.slice(0, 4).forEach(function (it) {
      if (shouldSkip(it.title, it.body)) return;
      var sev = it.severity === 'CRITICAL' ? 'critical' : it.severity === 'HIGH' ? 'high' : 'medium';
      var title = it.title || it.campaignName || lbl('AI decision', 'قرار ذكي');
      var body = !it.generatedAt ? lbl('AI summary pending…', 'جاري تجهيز الملخص…') : (it.body || lbl('Action recommended', 'إجراء مقترح'));
      if (shouldSkip(title, body)) return;
      cards.push({ sev: sev, title: title, body: body });
    });

    var issues = Array.isArray(dashData.issues) ? dashData.issues.slice() : [];
    issues.sort(function (a, b) {
      return severityRank(a.severity) - severityRank(b.severity);
    });
    issues.slice(0, 4).forEach(function (iss) {
      var sev = (iss.severity || 'medium').toLowerCase();
      var rec = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      var title = iss.title || iss.code || lbl('Observation', 'ملاحظة');
      var body = rec || lbl('Review affected campaigns and adjust strategy.', 'راجع الحملات المتأثرة وعدّل الاستراتيجية.');
      if (shouldSkip(title, body)) return;
      cards.push({ sev: sev, title: title, body: body });
    });

    if (cards.length === 0) {
      var steadyForBrain = getSteadyState(dashData);
      if (steadyForBrain && renderSteadyBrainBox(steadyForBrain)) return;
      var fallbackBrain = buildClientSteadyFallback(dashData, []);
      if (renderSteadyBrainBox(fallbackBrain)) return;
      list.innerHTML = '<div class="v2-action-empty">' + escHtml(lbl(
        'Account is steady — no strategic actions needed right now.',
        'الحساب مستقر — لا توجد إجراءات استراتيجية الآن.'
      )) + '</div>';
      sub.textContent = lbl('All clear', 'كل شيء مستقر');
      return;
    }
    list.innerHTML = cards.slice(0, 6).map(function (c) {
      var sevLabel = c.sev === 'critical' ? lbl('Critical', 'حرج')
        : c.sev === 'high' ? lbl('High', 'مرتفع')
        : c.sev === 'medium' ? lbl('Watch', 'مراقبة')
        : lbl('Info', 'معلومة');
      return '<div class="strategy-card ' + c.sev + '">'
        + '<div class="strategy-head">'
          + '<div class="strategy-title">' + escHtml(c.title) + '</div>'
          + '<span class="strategy-sev">' + escHtml(sevLabel) + '</span>'
        + '</div>'
        + '<div class="strategy-body">' + escHtml(c.body) + '</div>'
      + '</div>';
    }).join('');
    sub.textContent = cards.length + ' ' + lbl(cards.length === 1 ? 'insight' : 'insights', cards.length === 1 ? 'رؤية' : 'رؤى');
  }

  // ── Advanced: KPI / Issues / Campaign table ─────────────────────────────
  ${renderKpisJs}
  ${renderIssuesJs}
  ${renderDiagnosesJs}

  // Draw/refresh the Advanced Analytics trend charts — only while their
  // <details> is open (see the 0×0-canvas note above). Hides a card whose
  // series is all zeros instead of showing an empty box.
  function renderAdvancedChartsIfOpen() {
    renderAdvancedCharts(true);
  }

  function renderAttribution(attr) {
    var section = document.getElementById('attribution-section');
    if (!attr || !section) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    var DRIVER_AR = { impressions: 'الظهور', ctr: 'نسبة النقر', cvr: 'نسبة التحويل' };
    var factors = [
      { key: 'impressions', label: 'الظهور', delta: attr.drivers.impressions.change, contribution: attr.drivers.impressions.contribution },
      { key: 'ctr', label: 'نسبة النقر', delta: attr.drivers.ctr.change, contribution: attr.drivers.ctr.contribution },
      { key: 'cvr', label: 'نسبة التحويل', delta: attr.drivers.cvr.change, contribution: attr.drivers.cvr.contribution },
    ];
    var totalDir = attr.totalChange >= 0 ? 'ارتفعت' : 'انخفضت';
    section.innerHTML = '<div class="adv-panel-head"><div>'
      + '<div class="adv-panel-kicker">تفسير</div>'
      + '<div class="adv-panel-title">لماذا تغيّرت النتائج؟</div>'
      + '</div></div>'
      + '<div class="attribution-bars">'
      + factors.map(function (f) {
          var cls = f.delta > 0.02 ? 'positive' : f.delta < -0.02 ? 'negative' : 'neutral';
          var fillColor = f.delta > 0.02 ? 'var(--success)' : f.delta < -0.02 ? 'var(--error)' : 'var(--text-3)';
          var pct = Math.min(Math.abs(f.delta * 100), 100);
          var isPrimary = f.key === attr.primaryDriver;
          return '<div class="attribution-factor">'
            + '<div class="attribution-factor-label">' + f.label + '</div>'
            + '<div class="attribution-factor-value ' + cls + '">'
              + (f.delta >= 0 ? '+' : '') + (f.delta * 100).toFixed(1) + '%'
            + '</div>'
            + '<div class="attribution-factor-bar"><div class="attribution-factor-fill" style="width:' + pct + '%;background:' + fillColor + ';"></div></div>'
            + (isPrimary ? '<div class="attribution-primary-tag">السبب الرئيسي</div>' : '')
          + '</div>';
        }).join('')
      + '</div>'
      + '<div class="attribution-narrative">' + escHtml(
          attr.drivers
            ? ('النتائج ' + totalDir + ' ' + Math.abs(attr.totalChange * 100).toFixed(0) + '% — '
              + 'الظهور ' + (attr.drivers.impressions.change >= 0 ? '+' : '−') + Math.abs(attr.drivers.impressions.change * 100).toFixed(0) + '%، '
              + 'نسبة النقر ' + (attr.drivers.ctr.change >= 0 ? '+' : '−') + Math.abs(attr.drivers.ctr.change * 100).toFixed(0) + '%، '
              + 'نسبة التحويل ' + (attr.drivers.cvr.change >= 0 ? '+' : '−') + Math.abs(attr.drivers.cvr.change * 100).toFixed(0) + '%. '
              + 'السبب الرئيسي: ' + (DRIVER_AR[attr.primaryDriver] || attr.primaryDriver) + '.')
            : attr.narrative
        ) + '</div>';
  }

  function renderCampaignsTable(best, worst, allCampaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var byId = {};
    (allCampaigns || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    function enrich(c) {
      if (!c) return null;
      var full = byId[c.id] || {};
      return Object.assign({}, full, c, {
        spendWindowMinor: full.spendWindowMinor != null ? full.spendWindowMinor : c.spendWindowMinor,
        messagesWindow: full.messagesWindow != null ? full.messagesWindow : (c.messages != null ? c.messages : null),
        ctrWindow: full.ctrWindow != null ? full.ctrWindow : c.ctr,
        dailyBudget: full.dailyBudget != null ? full.dailyBudget : c.dailyBudget,
        objective: full.objective || c.objective,
        status: full.status || c.status,
        deliveryTier: full.deliveryTier || c.deliveryTier,
        isCurrentlySpending: full.isCurrentlySpending != null ? full.isCurrentlySpending : c.isCurrentlySpending,
        isDormantActive: full.isDormantActive != null ? full.isDormantActive : c.isDormantActive,
      });
    }
    best = enrich(best);
    worst = enrich(worst);
    var rows = [];
    function noteFor(c, forced) {
      if (forced) return forced;
      if (c.isCurrentlySpending) return 'تنفق الآن';
      if (c.deliveryTier === 'DORMANT_ACTIVE' || c.isDormantActive) return 'تحتاج مراجعة';
      if (c.deliveryTier === 'DELIVERING_TODAY' || c.deliveryTier === 'DELIVERING_WINDOW') return 'تعمل';
      if ((c.status || '').toUpperCase() === 'PAUSED') return 'متوقفة';
      return '';
    }
    function noteClass(note) {
      if (note === 'الأفضل') return 'note-best';
      if (note === 'الأسوأ') return 'note-worst';
      if (note === 'تنفق الآن') return 'note-hot';
      if (note === 'تحتاج مراجعة') return 'note-watch';
      return 'note-muted';
    }
    function row(c, forcedNote) {
      var note = noteFor(c, forcedNote);
      var spend = c.spendWindowMinor != null ? fmtCurrencyMinor(c.spendWindowMinor)
        : (c.dailyBudget != null ? fmtCurrencyMinor(c.dailyBudget) + ' / يوم' : '—');
      var msgs = c.messagesWindow != null ? Number(c.messagesWindow).toLocaleString('en-US')
        : (c.messages != null ? Number(c.messages).toLocaleString('en-US') : '—');
      var ctr = c.ctrWindow != null ? Number(c.ctrWindow).toFixed(2) + '%'
        : (c.ctr != null ? Number(c.ctr).toFixed(2) + '%' : '—');
      return '<tr>'
        + '<td><div class="adv-camp-name">' + escHtml(c.name || '—') + '</div>'
          + '<div class="adv-camp-obj">' + escHtml(translateObjective(c.objective)) + '</div></td>'
        + '<td>' + statusBadge(c.status || 'UNKNOWN') + '</td>'
        + '<td class="adv-camp-num">' + escHtml(spend) + '</td>'
        + '<td class="adv-camp-num">' + escHtml(String(msgs)) + '</td>'
        + '<td class="adv-camp-num">' + escHtml(ctr) + '</td>'
        + '<td><span class="adv-camp-note ' + noteClass(note) + '">' + escHtml(note || '—') + '</span></td>'
      + '</tr>';
    }
    if (best)  rows.push(row(best,  'الأفضل'));
    if (worst && (!best || worst.id !== best.id)) rows.push(row(worst, 'الأسوأ'));
    var seen = new Set([best && best.id, worst && worst.id].filter(Boolean));
    var rest = (allCampaigns || []).filter(function (c) { return c && c.id && !seen.has(c.id); });
    rest.sort(function (a, b) {
      var as = Number(a.spendWindowMinor) || 0;
      var bs = Number(b.spendWindowMinor) || 0;
      if (bs !== as) return bs - as;
      return (Number(b.messagesWindow) || 0) - (Number(a.messagesWindow) || 0);
    });
    rest.slice(0, 40).forEach(function (c) { rows.push(row(c, '')); });
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="6" class="text-3" style="text-align:center;padding:18px;">لا توجد حملات.</td></tr>';
  }

  // ── Tier 1: Executive Pulse Banner ──────────────────────────────────────
  function normalizeForDedupe(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function textsOverlap(a, b) {
    var na = normalizeForDedupe(a);
    var nb = normalizeForDedupe(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 12 && nb.length >= 12 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) return true;
    return false;
  }
  function issueIndicatesBudgetWaste(iss) {
    var blob = ((iss.code || '') + ' ' + (iss.title || '') + ' ' + (Array.isArray(iss.causes) ? iss.causes.join(' ') : '')).toUpperCase();
    return /BUDGET|WASTE|BURN|OVERSPEND|BLEED|SPEND/.test(blob);
  }
  function deriveBusinessHealth(dashData) {
    var healthyFallback = {
      level: 'healthy',
      text: lbl('Status: Healthy. Your ads are converting efficiently.', 'الحالة: جيد. إعلاناتك تحقق نتائج بكفاءة.'),
    };
    try {
      if (!dashData) return healthyFallback;
      var issues = Array.isArray(dashData.issues) ? dashData.issues.filter(Boolean) : [];
      var hasCritical = issues.some(function (i) { return (i.severity || '').toLowerCase() === 'critical'; });
      var hasHigh = issues.some(function (i) { return (i.severity || '').toLowerCase() === 'high'; });
      var budgetWaste = issues.some(issueIndicatesBudgetWaste);
      var band = (dashData.health && dashData.health.band) || 'none';
      var pulse = dashData.brain && dashData.brain.livePulse;
      if (pulse && pulse.intraDaySpendPct != null && pulse.intraDaySpendPct >= 85) budgetWaste = true;
      var feed = (dashData.brain && Array.isArray(dashData.brain.cmoFeedV2)) ? dashData.brain.cmoFeedV2 : [];
      if (feed.some(function (it) { return it && it.severity === 'CRITICAL'; })) hasCritical = true;

      if (hasCritical || band === 'poor' || (hasHigh && budgetWaste)) {
        return {
          level: 'critical',
          text: lbl(
            'Status: Immediate Action Required. We detected budget waste.',
            'الحالة: انتبه، توجد حملات تهدر الميزانية حالياً'
          ),
        };
      }
      if (hasHigh || band === 'attention' || budgetWaste) {
        return {
          level: 'warning',
          text: lbl(
            'Status: Needs Attention. Some campaigns need a quick review.',
            'الحالة: يحتاج انتباه. بعض الحملات تحتاج مراجعة سريعة.'
          ),
        };
      }
      return healthyFallback;
    } catch (e) {
      console.error('[dashboard] deriveBusinessHealth failed:', e);
      return healthyFallback;
    }
  }
  function renderExecutivePulse(dashData) {
    var sec = document.getElementById('exec-pulse-section');
    var el = document.getElementById('exec-pulse-text');
    if (!sec || !el) return;
    var health = deriveBusinessHealth(dashData);
    sec.className = 'exec-pulse-banner ' + health.level;
    el.textContent = health.text;
    sec.style.display = 'flex';
  }

  // ── Tier 2+3: Main Move (unified focus + narrative) ─────────────────────
  function severityRank(s) {
    var order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[(s || 'medium').toLowerCase()] != null ? order[(s || 'medium').toLowerCase()] : 9;
  }
  function feedSeverityRank(s) {
    if (s === 'CRITICAL') return 0;
    if (s === 'HIGH') return 1;
    return 2;
  }
  function savedSpendLabel(dashData) {
    var ledger = dashData.brain && dashData.brain.ledger;
    if (ledger && ledger.savedSpendDisplay && ledger.savedSpend > 0) {
      return lbl('Save ' + ledger.savedSpendDisplay, 'وفّر ' + ledger.savedSpendDisplay);
    }
    return null;
  }
  function issueActionCode(iss, dashData) {
    var kb = iss && iss.evidence && iss.evidence.knowledgeBase;
    var kbActions = kb && kb.recommended_optimization_actions;
    if (Array.isArray(kbActions) && kbActions[0] && kbActions[0].id) return kbActions[0].id;
    if (dashData && dashData.priorityAction && dashData.priorityAction.actionCode) {
      return dashData.priorityAction.actionCode;
    }
    return iss && iss.code ? String(iss.code) : null;
  }
  function buildAllMoveItems(dashData) {
    try {
      if (!dashData) return [];
      var items = [];
      var seen = [];

      function pushItem(item) {
        if (!item || !item.title) return;
        for (var i = 0; i < seen.length; i++) {
          if (textsOverlap(seen[i], item.title) || (item.narrative && textsOverlap(seen[i], item.narrative))) return;
        }
        seen.push(item.title);
        if (item.narrative) seen.push(item.narrative);
        items.push(item);
      }

      var issues = Array.isArray(dashData.issues) ? dashData.issues.filter(Boolean).slice() : [];
      issues.sort(function (a, b) { return severityRank(a.severity) - severityRank(b.severity); });

      issues.forEach(function (iss) {
        if (!iss) return;
        var sev = (iss.severity || 'medium').toLowerCase();
        var recs = Array.isArray(iss.recommendations) ? iss.recommendations : (iss.recommendations ? [iss.recommendations] : []);
        var decision = recs[0] || lbl('Review and resolve', 'راجع الحملة وطبّق التوصية');
        var causes = Array.isArray(iss.causes) ? iss.causes.join(' · ') : (iss.causes || '');
        pushItem({
          kind: 'issue',
          itemId: 'issue:' + (iss.code || iss.title || 'unknown'),
          issueCode: iss.code || null,
          actionCode: issueActionCode(iss, dashData),
          rank: severityRank(sev),
          severity: sev,
          title: iss.title || iss.code || lbl('Action needed', 'إجراء مطلوب'),
          decision: decision,
          steps: recs.slice(0, 4),
          narrative: causes || decision,
          impact: savedSpendLabel(dashData),
          buttonText: sev === 'critical' ? lbl('Fix Now', 'تطبيق الحل فوراً') : lbl('Review', 'مراجعة'),
          confidence: iss.confidence || (sev === 'critical' ? 92 : sev === 'high' ? 86 : 78),
        });
      });

      if (dashData.priorityAction) {
        var pa = dashData.priorityAction;
        var paText = typeof pa === 'string' ? pa : (pa.text || pa.actionCode || '');
        if (paText) {
          pushItem({
            kind: 'priority',
            itemId: 'priority:' + (pa.actionCode || 'top'),
            actionCode: pa.actionCode || null,
            rank: 0.5,
            severity: 'high',
            title: paText,
            decision: paText,
            steps: [paText],
            narrative: paText,
            impact: savedSpendLabel(dashData),
            buttonText: lbl('Fix Now', 'تطبيق الحل فوراً'),
            confidence: 92,
          });
        }
      }

      var feed = (dashData.brain && Array.isArray(dashData.brain.cmoFeedV2)) ? dashData.brain.cmoFeedV2.filter(Boolean).slice() : [];
      feed.sort(function (a, b) { return feedSeverityRank(a.severity) - feedSeverityRank(b.severity); });
      feed.forEach(function (it) {
        if (!it || !it.generatedAt) return;
        var sev = it.severity === 'CRITICAL' ? 'critical' : it.severity === 'HIGH' ? 'high' : 'medium';
        pushItem({
          kind: 'feed',
          itemId: 'feed:' + (it.dedupeKey || it.id || it.campaignName || it.title || 'unknown'),
          actionCode: dashData.priorityAction && dashData.priorityAction.actionCode ? dashData.priorityAction.actionCode : null,
          campaignId: it.campaignId || null,
          campaignName: it.campaignName || null,
          feedKey: it.dedupeKey || null,
          rank: feedSeverityRank(it.severity) + 0.1,
          severity: sev,
          title: it.title || it.campaignName || lbl('AI decision', 'قرار ذكي'),
          decision: it.body || lbl('Review AI recommendation', 'راجع توصية الذكاء الاصطناعي'),
          steps: it.body ? [it.body] : [],
          narrative: it.bodyFull || it.body || '',
          impact: savedSpendLabel(dashData),
          buttonText: sev === 'critical' ? lbl('Fix Now', 'تطبيق الحل فوراً') : lbl('Review', 'مراجعة'),
          confidence: sev === 'critical' ? 90 : 82,
        });
      });

      items.sort(function (a, b) { return a.rank - b.rank; });
      return items;
    } catch (e) {
      console.error('[dashboard] buildAllMoveItems failed:', e);
      return [];
    }
  }
  function pickMainMoveNarrative(primary, dashData, kpis) {
    try {
      if (!primary) return '';
      if (primary.narrative && primary.narrative !== primary.decision && primary.narrative !== primary.title) {
        return primary.narrative;
      }
      var kpiList = Array.isArray(kpis) ? kpis : [];
      var ctr = kpiList.find(function (k) { return k && (k.key || '').toLowerCase() === 'ctr'; });
      if (ctr && ctr.deltaPct != null) {
        var up = ctr.direction === 'up';
        return lbl(
          'Engagement moved ' + (up ? '+' : '-') + Math.abs(Number(ctr.deltaPct) * 100).toFixed(1) + '% vs prior period.',
          'تفاعل الإعلان ' + (up ? 'ارتفع' : 'انخفض') + ' مقارنة بالفترة السابقة.'
        );
      }
      return primary.decision || '';
    } catch (e) {
      console.error('[dashboard] pickMainMoveNarrative failed:', e);
      return (primary && primary.decision) || '';
    }
  }
  // "Ask AI why" deep-link — hands the Main Move item's own title/campaign
  // straight to the /ai chat as a prefilled question (see aiPage.ts's ?q=
  // handling), instead of duplicating a root-cause explanation UI here.
  function mainMoveAiQuestion(item) {
    var q = lbl('Why is this happening and how do I fix it, in detail: ', 'لماذا يحدث هذا، وكيف أحله بالتفصيل: ') + (item.title || '');
    if (item.campaignName) q += lbl(' (campaign: ', ' (حملة: ') + item.campaignName + ')';
    return q;
  }
  function renderMainMove(dashData, kpis) {
    var card = document.getElementById('main-move-card');
    var meta = document.getElementById('main-move-meta');
    var label = document.getElementById('main-move-label');
    if (!card) return;
    try {
    if (label) label.textContent = lbl('Main Move', 'الخطوة الأهم');
    var items = buildAllMoveItems(dashData);
    if (items.length === 0) {
      var steady = getSteadyState(dashData) || buildClientSteadyFallback(dashData, kpis);
      if (renderSteadyMainMove(steady)) return;
      if (meta) meta.textContent = lbl('All clear', 'كل شيء مستقر');
      state.mainMovePrimary = null;
      card.innerHTML = '<div class="main-move-empty">' + escHtml(lbl(
        'No actions for today. Account is steady.',
        'لا توجد إجراءات اليوم. حسابك مستقر.'
      )) + '</div>';
      return;
    }
    var primary = items[0];
    var secondary = items.slice(1, 6);
    var why = pickMainMoveNarrative(primary, dashData, kpis);
    if (textsOverlap(why, primary.title)) why = primary.decision && !textsOverlap(primary.decision, primary.title) ? primary.decision : '';
    if (textsOverlap(why, primary.decision)) why = '';

    if (meta) {
      meta.textContent = secondary.length > 0
        ? lbl(secondary.length + ' more item' + (secondary.length === 1 ? '' : 's') + ' below', secondary.length + ' عناصر إضافية بالأسفل')
        : lbl('Top priority for the next 24h', 'الأولوية للـ ٢٤ ساعة القادمة');
    }

    var sevCls = primary.severity === 'critical' ? 'has-critical' : primary.severity === 'high' ? 'has-warning' : '';
    var ctaCls = primary.severity === 'critical' ? ' critical' : '';
    var impactHtml = primary.impact
      ? '<div class="main-move-impact">' + escHtml(primary.impact) + '</div>'
      : '';

    var html = '<div class="main-move-primary ' + sevCls + '" dir="auto">'
      + '<div class="main-move-tag">' + escHtml(lbl("Today's #1 priority", 'الأولوية الأولى اليوم')) + '</div>'
      + '<div class="main-move-title">' + escHtml(primary.title) + '</div>'
      + impactHtml
      + (why ? '<div class="main-move-why">' + escHtml(why) + '</div>' : '')
      + '<div class="main-move-cta-row">'
        + '<button class="main-move-cta' + ctaCls + '" type="button">' + escHtml(primary.buttonText) + '</button>'
        + '<a class="btn btn-secondary btn-sm" href="/ai?q=' + encodeURIComponent(mainMoveAiQuestion(primary)) + '">' + escHtml(lbl('Ask AI why', 'اسأل الذكاء الاصطناعي لماذا')) + '</a>'
        + '<span class="text-xs text-3">' + escHtml(lbl('Confidence', 'الثقة')) + ' ' + escHtml(String(primary.confidence)) + '%</span>'
      + '</div>'
    + '</div>';

    if (secondary.length > 0) {
      html += '<details class="main-move-more">'
        + '<summary>' + escHtml(lbl('Other priorities (' + secondary.length + ')', 'أولويات أخرى (' + secondary.length + ')')) + '</summary>'
        + '<div class="main-move-secondary">'
        + secondary.map(function (a, idx) {
          return '<div class="main-move-secondary-item" dir="auto">'
            + '<div class="main-move-secondary-pri">#' + (idx + 2) + '</div>'
            + '<div class="main-move-secondary-body">'
              + '<div class="main-move-secondary-title">' + escHtml(a.title) + '</div>'
              + '<div class="main-move-secondary-decision">' + escHtml(a.decision) + '</div>'
            + '</div>'
          + '</div>';
        }).join('')
        + '</div>'
      + '</details>';
    }
    card.innerHTML = html;
    state.mainMovePrimary = primary;
    } catch (e) {
      console.error('[dashboard] renderMainMove failed:', e);
      state.mainMovePrimary = null;
      card.innerHTML = '<div class="main-move-empty">' + escHtml(lbl(
        'No actions for today. Account is steady.',
        'لا توجد إجراءات اليوم. حسابك مستقر.'
      )) + '</div>';
    }
  }

  // ── Main Move action workflow ───────────────────────────────────────────
  function actionStepsForItem(item) {
    if (!item) return [];
    var steps = Array.isArray(item.steps) ? item.steps.filter(Boolean) : [];
    if (steps.length > 0) return steps;
    if (item.decision) return [item.decision];
    return [lbl('Review affected campaigns and apply the recommended fix.', 'راجع الحملات المتأثرة وطبّق الإصلاح الموصى به.')];
  }
  function closeActionModal() {
    var modal = document.getElementById('main-move-action-modal');
    if (modal) modal.style.display = 'none';
  }
  function openActionModal(item) {
    var modal = document.getElementById('main-move-action-modal');
    var titleEl = document.getElementById('action-modal-title');
    var subEl = document.getElementById('action-modal-subtitle');
    var stepsEl = document.getElementById('action-modal-steps');
    if (!modal || !titleEl || !subEl || !stepsEl) return;
    var steps = actionStepsForItem(item);
    titleEl.textContent = item.title || lbl('Recommended action', 'الإجراء الموصى به');
    var subtitleParts = [];
    if (item.campaignName) subtitleParts.push(item.campaignName);
    if (item.actionCode) subtitleParts.push(String(item.actionCode).replace(/_/g, ' '));
    subEl.textContent = subtitleParts.length > 0
      ? subtitleParts.join(' · ')
      : lbl('Follow these steps in Meta Ads Manager.', 'اتبع هذه الخطوات في مدير إعلانات Meta.');
    stepsEl.innerHTML = steps.map(function (step, idx) {
      return '<div class="action-modal-step" dir="auto"><b>' + (idx + 1) + '</b><span>' + escHtml(step) + '</span></div>';
    }).join('');
    var cancelBtn = document.getElementById('action-modal-cancel');
    var confirmBtn = document.getElementById('action-modal-confirm');
    if (cancelBtn) cancelBtn.textContent = lbl('Cancel', 'إلغاء');
    if (confirmBtn) confirmBtn.textContent = lbl("I've applied this", 'طبّقت الإجراء');
    modal.style.display = 'flex';
  }
  async function confirmExecuteAction() {
    var item = state.mainMovePrimary;
    var confirmBtn = document.getElementById('action-modal-confirm');
    var cta = document.querySelector('.main-move-cta');
    if (!item || !state.workspaceId) return;
    if (!item.itemId) {
      toast(lbl('Cannot record this action — missing item id.', 'تعذّر تسجيل الإجراء — معرف مفقود.'), 'error');
      return;
    }
    if (confirmBtn) confirmBtn.disabled = true;
    var priorCtaText = cta ? cta.textContent : '';
    try {
      await apiFetch('/api/workspaces/' + encodeURIComponent(state.workspaceId) + '/recommendations/action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'EXECUTED',
          itemKey: item.itemId,
          itemKind: item.kind || null,
          actionCode: item.actionCode || null,
          campaignId: item.campaignId || null,
          feedKey: item.feedKey || null,
          title: item.title || null,
        }),
      });
      toast(lbl('Action recorded — we’ll track results over the next 7 days.', 'تم تسجيل الإجراء — سنراقب النتائج خلال ٧ أيام.'), 'success');
      closeActionModal();
      if (cta) {
        cta.disabled = true;
        cta.textContent = lbl('Applied', 'تم التطبيق');
      }
      try {
        var refreshed = await apiFetch('/api/dashboard/' + encodeURIComponent(state.workspaceId));
        if (refreshed && !refreshed.empty) {
          applyDashboardData(refreshed, state.lastInsights || [], state.lastCampaigns || [], null, false);
        }
      } catch (refreshErr) {
        console.warn('[dashboard] post-action refresh failed:', refreshErr);
      }
    } catch (e) {
      console.error('[dashboard] confirmExecuteAction failed:', e);
      if (cta) {
        cta.disabled = false;
        cta.textContent = priorCtaText || item.buttonText || lbl('Fix Now', 'تطبيق الحل فوراً');
      }
      toast(lbl('Could not record action. Try again.', 'تعذّر تسجيل الإجراء. حاول مرة أخرى.'), 'error');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }
  function handleExecuteAction(item) {
    if (!item) return;
    openActionModal(item);
  }
  function wireMainMoveActions() {
    var section = document.getElementById('main-move-section');
    if (!section || section.getAttribute('data-action-wired') === '1') return;
    section.setAttribute('data-action-wired', '1');
    section.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.main-move-cta');
      if (!btn || btn.disabled) return;
      handleExecuteAction(state.mainMovePrimary);
    });
    var modal = document.getElementById('main-move-action-modal');
    var cancelBtn = document.getElementById('action-modal-cancel');
    var confirmBtn = document.getElementById('action-modal-confirm');
    if (cancelBtn) cancelBtn.addEventListener('click', closeActionModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmExecuteAction);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeActionModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var m = document.getElementById('main-move-action-modal');
      if (m && m.style.display !== 'none') closeActionModal();
    });
  }

  // ── V2: Spotlight ───────────────────────────────────────────────────────
  function deriveOpportunity(dashData) {
    if (!dashData || !dashData.opportunity) return null;
    return dashData.opportunity;
  }
  function renderSpotlight(winner, opportunity) {
    var section = document.getElementById('v2-spotlight-section');
    var el = document.getElementById('v2-spotlight');
    if (!el) return;
    var hasWinner = !!(winner && (winner.name || winner.campaignName));
    var hasOpportunity = !!(opportunity && opportunity.title);
    if (!hasWinner && !hasOpportunity) {
      if (section) section.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    if (section) section.style.display = 'block';
    var parts = [];
    if (hasWinner) {
      var reason = winner.reason || ('Top performer · ' + (winner.objective || 'this period'));
      var conf = winner.confidence || 90;
      var score = winner.score != null ? winner.score : (winner.health != null ? winner.health : '—');
      parts.push(
        '<div class="v2-spotlight v2-winner">'
          + '<div class="v2-spotlight-tag">' + escHtml(lbl('Best Campaign', 'أفضل حملة')) + '</div>'
          + '<div class="v2-spotlight-name">' + escHtml(winner.name || winner.campaignName || '—') + '</div>'
          + '<div class="v2-spotlight-reason">' + escHtml(reason) + '</div>'
          + '<div class="v2-spotlight-stat">'
            + '<span>' + escHtml(lbl('Score', 'النتيجة')) + ' <b>' + escHtml(String(score)) + '</b></span>'
            + '<span>' + escHtml(lbl('Confidence', 'الثقة')) + ' <b>' + escHtml(String(conf)) + '%</b></span>'
          + '</div>'
        + '</div>'
      );
    }
    if (hasOpportunity) {
      parts.push(
        '<div class="v2-spotlight v2-opportunity">'
          + '<div class="v2-spotlight-tag">' + escHtml(lbl('Opportunity', 'فرصة')) + '</div>'
          + '<div class="v2-spotlight-name">' + escHtml(opportunity.title) + '</div>'
          + '<div class="v2-spotlight-reason">' + escHtml(opportunity.reason || '') + '</div>'
          + '<div class="v2-spotlight-stat">'
            + '<span>' + escHtml(lbl('Expected gain', 'الربح المتوقع')) + ' <b>' + escHtml(opportunity.expectedGain || '+0%') + '</b></span>'
            + '<span>' + escHtml(lbl('Confidence', 'الثقة')) + ' <b>' + escHtml(String(opportunity.confidence || 80)) + '%</b></span>'
          + '</div>'
        + '</div>'
      );
    }
    el.innerHTML = parts.join('');
  }
  function renderBrainSection(brain, dashData) {
    if (!brain) return;
    applyPulse(brain.livePulse);
    var pulseSection = document.getElementById('brain-pulse-section');
    if (pulseSection && brain.livePulse) pulseSection.style.display = 'block';
  }
  function updatePulseLabels() {
    var el;
    el = document.getElementById('brain-pulse-burn-label');
    if (el) el.textContent = lbl('Spend pace', 'سرعة الإنفاق');
    el = document.getElementById('brain-pulse-burn-meta');
    if (el) el.textContent = lbl('with spend pace today', 'بوتيرة إنفاق اليوم');
    el = document.getElementById('brain-pulse-spend-label');
    if (el) el.textContent = lbl("Today's spend share", 'حصة الإنفاق اليوم');
    el = document.getElementById('brain-pulse-spend-meta');
    if (el) el.textContent = lbl('of total daily budget', 'من إجمالي الميزانية اليومية');
    el = document.getElementById('brain-pulse-dna-label');
    if (el) el.textContent = lbl('Match to your top campaigns', 'مدى تشابه الإعلان مع الأفضل');
    el = document.getElementById('brain-pulse-dna-meta');
    if (el) el.textContent = lbl('compared to your top past campaigns', 'مقارنة بأفضل حملاتك السابقة');
  }
  function applyPulse(pulse) {
    updatePulseLabels();
    if (!pulse) return;
    document.getElementById('brain-pulse-burn').textContent = pulse.burnRateDisplay || '—';
    document.getElementById('brain-pulse-burn-n').textContent = String(pulse.campaignsObserved || 0);
    document.getElementById('brain-pulse-spendpct').textContent = (pulse.intraDaySpendPct != null) ? pulse.intraDaySpendPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-dna').textContent = (pulse.dnaMatchPct != null) ? pulse.dnaMatchPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-tick').textContent = pulse.tickDate || lbl('no tick yet today', 'لا يوجد تحديث اليوم');
  }
  function startAutoRefresh(workspaceId) {
    async function refreshDashboard() {
      if (document.hidden) return;
      try {
        var results = await Promise.all([
          apiFetch('/api/dashboard/' + workspaceId),
          apiFetch('/api/workspaces/' + workspaceId + '/insights?days=90'),
          apiFetch('/api/workspaces/' + workspaceId + '/campaigns').catch(function () { return []; }),
        ]);
        var dashData = results[0] || {};
        if (dashData.empty) return;
        applyDashboardData(dashData, results[1] || [], results[2] || [], null, false);
      } catch (e) { /* silent background refresh */ }
    }
    function stopTimer() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }
    function armTimer() {
      stopTimer();
      refreshTimer = setInterval(refreshDashboard, REFRESH_MS);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refreshDashboard();
        armTimer();
      } else {
        stopTimer();
      }
    });
    window.addEventListener('pagehide', stopTimer);
    armTimer();
  }

  // ── Insights → KPIs fallback (uses minor-unit-aware spend totals) ───────
  function buildKpisFromInsights(insights) {
    var totals = { spendMinor: 0, impressions: 0, clicks: 0, messages: 0 };
    insights.forEach(function (d) {
      totals.spendMinor += Number(d.spend) || 0;
      totals.impressions += Number(d.impressions) || 0;
      totals.clicks += Number(d.clicks) || 0;
      totals.messages += Number(d.messages) || 0;
    });
    // Reach is daily unique users — NOT additive across days. Insights arrive
    // date-DESC; use the most recent day (matches getDashboard.ts convention).
    var latestReach = insights.length ? (Number(insights[0].reach) || 0) : 0;
    var spendMajor = totals.spendMinor / state.minorFactor;
    var ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    var cpc = totals.clicks ? spendMajor / totals.clicks : 0;
    var cpm = totals.impressions ? (spendMajor / totals.impressions) * 1000 : 0;
    return [
      { key: 'spend', label: kpiLabel('spend'), value: spendMajor, display: fmtCurrencyMinor(totals.spendMinor), goodWhenUp: false },
      { key: 'impressions', label: kpiLabel('impressions'), value: totals.impressions, display: fmtNum(totals.impressions), goodWhenUp: true },
      { key: 'reach', label: kpiLabel('reach'), value: latestReach, display: fmtNum(latestReach), goodWhenUp: true },
      { key: 'clicks', label: kpiLabel('clicks'), value: totals.clicks, display: fmtNum(totals.clicks), goodWhenUp: true },
      { key: 'ctr', label: kpiLabel('ctr'), value: ctr, display: fmtPctLocal(ctr), goodWhenUp: true },
      { key: 'cpc', label: kpiLabel('cpc'), value: cpc, display: fmtCurrencyMajor(cpc), goodWhenUp: false },
      { key: 'cpm', label: kpiLabel('cpm'), value: cpm, display: fmtCurrencyMajor(cpm), goodWhenUp: false },
      { key: 'messages', label: kpiLabel('messages'), value: totals.messages, display: fmtNum(totals.messages), goodWhenUp: true },
    ];
  }

  function hideLoadingShowDashboard() {
    var loadingEl = document.getElementById('loading-state');
    var contentEl = document.getElementById('dashboard-content');
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    staggerReveal(['.hero-grid', '#exec-pulse-section', '.ticker-wrap', '.active-section', '.split-grid', '#main-move-section']);
  }

  /** Safety net if init hangs — do not rely on layout SHARED_JS globals. */
  function startLoadingSafetyTimeout(ms) {
    setTimeout(function () {
      var loadingEl = document.getElementById('loading-state');
      if (!loadingEl || loadingEl.style.display === 'none') return;
      console.warn('[dashboard] loading safety timeout — revealing page');
      hideLoadingShowDashboard();
    }, ms || 5000);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function onboardingMessageFromJob(job, tick) {
    if (job.status === 'COMPLETED') {
      return lbl('Building your AI insights…', 'جارٍ بناء رؤى الذكاء الاصطناعي…');
    }
    if (job.chunksTotal > 0 && job.chunksDone > 0) {
      var pct = Math.round((job.chunksDone / job.chunksTotal) * 100);
      return lbl(
        'Analyzing your last 30 days of campaigns… (' + pct + '%)',
        'جارٍ تحليل حملاتك خلال آخر 30 يوماً… (' + pct + '%)'
      );
    }
    var msgs = [
      lbl('Connecting to your Meta ad account…', 'جارٍ الاتصال بحساب Meta الإعلاني…'),
      lbl('Analyzing your last 30 days of campaigns…', 'جارٍ تحليل حملاتك خلال آخر 30 يوماً…'),
      lbl('Pulling spend, reach, and engagement data…', 'جارٍ جلب بيانات الإنفاق والوصول والتفاعل…'),
      lbl('Syncing campaign performance history…', 'جارٍ مزامنة سجل أداء الحملات…'),
      lbl('Preparing your dashboard…', 'جارٍ تجهيز لوحة التحكم…'),
    ];
    return msgs[tick % msgs.length];
  }

  function showOnboardingOverlay(show) {
    var el = document.getElementById('onboarding-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
    var loadingEl = document.getElementById('loading-state');
    if (loadingEl && show) loadingEl.style.display = 'none';
  }

  function updateOnboardingUI(job, tick) {
    var msgEl = document.getElementById('onboarding-msg');
    var barEl = document.getElementById('onboarding-bar');
    var metaEl = document.getElementById('onboarding-meta');
    if (msgEl) msgEl.textContent = onboardingMessageFromJob(job, tick);
    if (barEl) {
      var pct = 8;
      if (job.chunksTotal > 0) pct = Math.max(8, Math.round((job.chunksDone / job.chunksTotal) * 92));
      else if (job.status === 'RUNNING' || job.status === 'IN_PROGRESS') pct = 20 + (tick % 4) * 12;
      else if (job.status === 'COMPLETED') pct = 100;
      barEl.style.width = pct + '%';
    }
    if (metaEl && job.rowsUpserted > 0) {
      metaEl.textContent = lbl(
        job.rowsUpserted + ' data points loaded',
        'تم تحميل ' + job.rowsUpserted + ' نقطة بيانات'
      );
    }
  }

  async function pollSyncJob(jobId) {
    var maxAttempts = 180;
    for (var i = 0; i < maxAttempts; i++) {
      var job = await apiFetch('/api/sync-jobs/' + encodeURIComponent(jobId));
      updateOnboardingUI(job, i);
      if (job.status === 'COMPLETED') return job;
      if (job.status === 'FAILED') throw new Error(job.error || lbl('Sync failed', 'فشلت المزامنة'));
      await sleep(1500);
    }
    throw new Error(lbl('Sync is taking longer than expected — your dashboard will update shortly.',
      'المزامنة تستغرق وقتاً أطول من المتوقع — ستُحدَّث لوحة التحكم قريباً.'));
  }

  async function runOnboardingSync(syncJobId) {
    showOnboardingOverlay(true);
    var titleEl = document.getElementById('onboarding-title');
    if (titleEl) titleEl.textContent = lbl('Setting up your dashboard', 'جارٍ إعداد لوحة التحكم');
    try {
      await pollSyncJob(syncJobId);
      var msgEl = document.getElementById('onboarding-msg');
      if (msgEl) msgEl.textContent = lbl('Almost ready…', 'على وشك الانتهاء…');
      var barEl = document.getElementById('onboarding-bar');
      if (barEl) barEl.style.width = '100%';
      await sleep(600);
    } catch (e) {
      console.warn('[dashboard] onboarding sync poll:', e);
      toast(friendlyApiError(e), 'warning');
    } finally {
      showOnboardingOverlay(false);
    }
  }

  async function waitForInitialSync(syncJobId, workspaceId) {
    if (syncJobId) {
      await runOnboardingSync(syncJobId);
      return;
    }
    showOnboardingOverlay(true);
    var msgEl = document.getElementById('onboarding-msg');
    if (msgEl) msgEl.textContent = lbl('Analyzing your last 30 days of campaigns…', 'جارٍ تحليل حملاتك خلال آخر 30 يوماً…');
    try {
      for (var j = 0; j < 90; j++) {
        var ws = await apiFetch('/api/workspaces/' + workspaceId);
        if (ws && ws.adAccounts && ws.adAccounts.some(function (a) { return a.lastSyncedAt; })) break;
        await sleep(2000);
      }
    } finally {
      showOnboardingOverlay(false);
    }
  }

  // ── Render / refresh dashboard sections ─────────────────────────────────
  function safeRender(sectionName, fn) {
    try { fn(); } catch (e) {
      console.error('[dashboard] ' + sectionName + ' render failed:', e);
    }
  }

  function applyDashboardData(dashData, insights, campaigns, wsData, isInitial) {
    dashData = dashData || {};
    insights = Array.isArray(insights) ? insights : [];
    campaigns = Array.isArray(campaigns) ? campaigns : [];
    state.lastInsights = insights;
    state.lastCampaigns = campaigns;
    try {
      if (dashData.workspace && dashData.workspace.locale) {
        state.locale = String(dashData.workspace.locale).toUpperCase();
      }
      hydrateCurrencyState(dashData, wsData);

      if (isInitial && wsData) {
        var allStale = Array.isArray(wsData.adAccounts)
          && wsData.adAccounts.length > 0
          && wsData.adAccounts.every(function (a) { return a.status !== 'ACTIVE'; });
        if (allStale) {
          var staleBanner = document.getElementById('stale-banner');
          if (staleBanner) staleBanner.style.display = 'flex';
        }
      }

      var workspaceId = state.workspaceId;
      var wsName = (dashData.workspace && (dashData.workspace.name || dashData.workspace.id)) || workspaceId;
      var wsNameEl = document.getElementById('ws-name'); if (wsNameEl) wsNameEl.textContent = wsName;
      var subtitleEl = document.getElementById('dash-subtitle');
      if (subtitleEl) {
        subtitleEl.innerHTML = 'Past 30 days · ' + escHtml(wsName) + ' · <span id="dash-last-updated" class="text-3">—</span>';
      }
      var chartMeta = document.getElementById('chart-panel-meta');
      if (chartMeta) chartMeta.textContent = state.currency;
      updateLastUpdatedLabel(dashData);
      state.lastSyncedAt = (dashData.workspace && dashData.workspace.lastSyncedAt) || null;
      state.lastIssues = Array.isArray(dashData.issues) ? dashData.issues : [];

      safeRender('hero', function () { renderHero(dashData, insights); });
      safeRender('executivePulse', function () { renderExecutivePulse(dashData); });
      safeRender('ticker', function () { renderTicker(buildTickerItems(dashData), dashData); });
      safeRender('aiContext', function () { renderAiContextStrip(dashData, campaigns); });
      safeRender('activeAds', function () { renderActiveAds(campaigns, dashData.workspace && dashData.workspace.campaignCounts); });
      safeRender('brainBox', function () { renderBrainBox(dashData); });

      if (dashData.brain) {
        safeRender('brainSection', function () { renderBrainSection(dashData.brain, dashData); });
      }

      var dashKpis = Array.isArray(dashData.kpis) ? dashData.kpis : [];
      var kpis = dashKpis.length > 0 ? dashKpis : buildKpisFromInsights(insights);
      safeRender('mainMove', function () { renderMainMove(dashData, kpis); });
      safeRender('spotlight', function () { renderSpotlight(dashData.bestCampaign, deriveOpportunity(dashData)); });
      safeRender('kpis', function () { renderKpis(kpis); });

      var last30 = recentAsc(insights, 30);
      var labels = last30.map(function (d) { return new Date(d.date).toLocaleDateString('ar-u-nu-latn', { month: 'short', day: 'numeric' }); });
      var isoDates = last30.map(function (d) { return new Date(d.date).toISOString().slice(0, 10); });
      var spendSeriesMajor = last30.map(function (d) { return (Number(d.spend) || 0) / state.minorFactor; });
      var ctrSeries        = last30.map(function (d) { return Number(d.ctr) || 0; });
      // NOTE: this feeds the "اتجاه الرسائل" chart — it must be messages,
      // not impressions (a long-standing mislabel in the fallback path).
      var impSeries        = last30.map(function (d) { return Number(d.messages) || 0; });

      if (dashData.trendSeries && Array.isArray(dashData.trendSeries.dates)) {
        var ts = dashData.trendSeries;
        var tsIso = ts.dates.map(function (d) {
          var dateVal = d && typeof d === 'object' ? d.date : d;
          return new Date(dateVal).toISOString().slice(0, 10);
        });
        var tsLabels = tsIso.map(function (iso) {
          return new Date(iso).toLocaleDateString('ar-u-nu-latn', { month: 'short', day: 'numeric' });
        });
        if (Array.isArray(ts.spend))    spendSeriesMajor = ts.spend.map(function (s) { return Number(s) / state.minorFactor; });
        if (Array.isArray(ts.ctr))      ctrSeries        = ts.ctr.map(Number);
        if (Array.isArray(ts.messages)) impSeries        = ts.messages.map(Number);
        labels = tsLabels;
        isoDates = tsIso;
      }

      pendingAdvancedCharts = { labels: labels, ctrSeries: ctrSeries, impSeries: impSeries };
      var _chartLabels = labels, _chartIsoDates = isoDates, _spendSeriesMajor = spendSeriesMajor;
      requestAnimationFrame(function () {
        safeRender('charts', function () {
          var hasSpend = _spendSeriesMajor.some(function(v){ return v > 0; });
          var emptyEl = document.getElementById('chart-spend-main-empty');
          var canvasEl = document.getElementById('chart-spend-main');
          if (!hasSpend || !_chartLabels.length) {
            if (emptyEl) emptyEl.style.display = 'flex';
            if (canvasEl) canvasEl.style.display = 'none';
          } else {
            if (emptyEl) emptyEl.style.display = 'none';
            if (canvasEl) canvasEl.style.display = '';
            var spendDatasets = [
              buildDataset(lbl('Spend', 'الإنفاق'), _spendSeriesMajor, '#D9A759', 'rgba(217,167,89,0.12)'),
            ];
            var markerDataset = buildIssueMarkerDataset(_chartLabels, _chartIsoDates, state.lastIssueDates);
            if (markerDataset) spendDatasets.push(markerDataset);
            makeLineChart('chart-spend-main', _chartLabels, spendDatasets, { maxTicks: 10 });
          }
          renderAdvancedCharts(false);
        });
      });

      safeRender('attribution', function () { renderAttribution(dashData.attribution || null); });
      safeRender('diagnoses', function () { renderDiagnoses(Array.isArray(dashData.diagnoses) ? dashData.diagnoses : []); });
      safeRender('issues', function () { renderIssues(Array.isArray(dashData.issues) ? dashData.issues : []); });
      safeRender('campaignsTable', function () { renderCampaignsTable(dashData.bestCampaign, dashData.worstCampaign, campaigns); });
    } catch (e) {
      console.error('[dashboard] applyDashboardData failed:', e);
      if (isInitial) throw e;
    }
  }

  // ── Main init ───────────────────────────────────────────────────────────
  async function init() {
    try {
      wireMainMoveActions();
      var advDetails = document.querySelector('details.v2-advanced');
      if (advDetails) advDetails.addEventListener('toggle', renderAdvancedChartsIfOpen);
      startLoadingSafetyTimeout(5000);

      var token = getToken();
      if (!token) { window.location.href = '/login'; return; }

      // 1) Identify user — shared shell init (timeout-bounded)
      var me = await initAppShell();
      if (!me) return;
      state.locale = (me.locale || 'AR').toUpperCase();
      var userName = me.name || me.email || 'User';
      var userInitials = initialsOf(userName);
      var avEl = document.getElementById('user-avatar');     if (avEl) avEl.textContent = userInitials;
      var nameEl = document.getElementById('user-name');     if (nameEl) nameEl.textContent = userName;
      var emailEl = document.getElementById('user-email');   if (emailEl) emailEl.textContent = me.email || '';

      // 2) Resolve workspace
      var workspaceId = getWsId();
      if (!workspaceId && me.memberships && me.memberships.length > 0) {
        workspaceId = me.memberships[0].workspaceId || (me.memberships[0].workspace && me.memberships[0].workspace.id);
        if (workspaceId) setWsId(workspaceId);
      }
      if (!workspaceId) {
        hideLoadingShowDashboard();
        document.getElementById('kpi-grid').innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-title">No workspace found</div><div class="empty-text">Create or join a workspace to see your dashboard.</div></div>';
        return;
      }
      state.workspaceId = workspaceId;

      await resumeActiveSyncIfAny(workspaceId, {
        statusContainerId: 'dashboard-content',
        onComplete: function () { refreshDashboard(); },
      });

      var urlParams = new URLSearchParams(window.location.search);
      var isPostConnect = urlParams.get('connected') === '1';
      var syncJobId = urlParams.get('syncJob') || null;
      if (isPostConnect || syncJobId) {
        await waitForInitialSync(syncJobId, workspaceId);
        window.history.replaceState({}, '', '/dashboard');
      }

      // 3) Parallel data fetch (each call bounded; failures degrade gracefully)
      var results = await Promise.all([
        apiFetchWithTimeout('/api/dashboard/' + workspaceId, {}, 15000).catch(function (e) { console.warn('[dashboard] dashboard fetch failed:', e); return {}; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/insights?days=90', {}, 15000).catch(function () { return []; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/campaigns', {}, 15000).catch(function () { return []; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId, {}, 15000).catch(function () { return null; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/issue-dates?days=30', {}, 15000).catch(function () { return []; }),
      ]);
      var dashData = results[0] || {};
      if (dashData.workspace && dashData.workspace.locale) {
        state.locale = String(dashData.workspace.locale).toUpperCase();
      }
      var insights = results[1] || [];
      var campaigns = results[2] || [];
      var wsData = results[3];
      state.lastIssueDates = Array.isArray(results[4]) ? results[4] : [];

      // 4) Empty state — no ad account connected
      if (dashData.empty) {
        if (!isPostConnect) {
          window.location.href = '/welcome';
          return;
        }
        hideLoadingShowDashboard();
        document.getElementById('hero-grid').innerHTML =
          '<div class="empty-state" style="grid-column:1/-1;">'
          + '<div class="empty-icon">📊</div>'
          + '<div class="empty-title">' + lbl('Connect your Meta Ads account', 'اربط حساب إعلانات Meta') + '</div>'
          + '<div class="empty-text">' + lbl('Link your ad account to see spend, engagement, reach, and AI-powered recommendations.', 'اربط حسابك الإعلاني لرؤية الإنفاق وتفاعل الإعلان والوصول والتوصيات الذكية.') + '</div>'
          + '<a href="/welcome" class="btn btn-primary" style="margin-top:14px;">' + lbl('Connect with Meta', 'الربط مع Meta') + '</a>'
        + '</div>';
        return;
      }

      // Show the container FIRST so Chart.js canvases have real dimensions.
      hideLoadingShowDashboard();
      try {
        applyDashboardData(dashData, insights, campaigns, wsData, true);
        startAutoRefresh(workspaceId);
      } catch (renderErr) {
        console.error('[dashboard] init render failed:', renderErr);
      }

    } catch (err) {
      console.error('[dashboard] init failed:', err);
      hideLoadingShowDashboard();
      showError(friendlyApiError(err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'لوحة التحكم', active: 'dashboard', content, scripts, extraHead, mode: 'pro' });
}
