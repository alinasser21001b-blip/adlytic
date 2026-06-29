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
  <div class="loading-text">Loading campaigns…</div>
</div>

<div id="error-state" style="display:none;">
  <div class="alert alert-error" id="error-msg">An error occurred.</div>
</div>

<div id="main-content" style="display:none;">
  <!-- No ad account CTA -->
  <div class="alert alert-info section-gap" id="no-ad-account-cta"
       style="display:none;flex-direction:column;align-items:center;text-align:center;padding:24px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Connect Your Meta Ad Account</div>
    <div style="margin-bottom:14px;max-width:480px;">Link your Meta Ads account to start tracking campaign performance, spend, and ROI in real time.</div>
    <a href="/workspace" class="btn btn-primary">Go to Workspace</a>
  </div>

  <!-- Paused / expired token CTA -->
  <div class="alert alert-warning section-gap" id="paused-account-cta"
       style="display:none;flex-direction:column;align-items:center;text-align:center;padding:24px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Ad Account Token Expired</div>
    <div style="margin-bottom:14px;max-width:480px;">Your Meta Ads access token has expired. Data shown below is cached and may be outdated. Reconnect your account to resume live syncing.</div>
    <a href="/workspace?connect=manual" class="btn btn-primary">Reconnect Meta (paste token)</a>
  </div>

  <!-- Page header -->
  <div class="page-header flex items-center justify-between">
    <div>
      <div class="page-title">Campaigns</div>
      <div class="page-subtitle" id="page-subtitle">All campaigns across your Meta ad account</div>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" class="btn btn-ghost btn-sm js-sync-trigger" id="force-sync-btn" title="Sync latest data from Meta">↻ Refresh Data</button>
      <div class="tabs" id="date-tabs">
        <button class="tab" data-days="7">7d</button>
        <button class="tab" data-days="14">14d</button>
        <button class="tab active" data-days="30">30d</button>
        <button class="tab" data-days="90">90d</button>
      </div>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Campaigns</div>
      <div class="kpi-value" id="total-campaigns">—</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label" title="Campaigns with spend today (matches dashboard)">Spending Today</div>
      <div class="kpi-value" id="active-campaigns" style="color:var(--success);">—</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Paused</div>
      <div class="kpi-value" id="paused-campaigns" style="color:var(--warning);">—</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Spend</div>
      <div class="kpi-value" id="total-spend" style="font-size:18px;">—</div>
      <div class="text-xs text-3" id="spend-period" style="margin-top:6px;">last 30 days</div>
    </div>
  </div>

  <!-- Charts -->
  <div class="chart-grid">
    <div class="chart-card">
      <div class="chart-card-header"><div class="chart-card-title">Spend Over Time</div></div>
      <div class="chart-canvas-wrap"><canvas id="chart-spend"></canvas></div>
    </div>
    <div class="chart-card" id="ctr-chart-card">
      <div class="chart-card-header"><div class="chart-card-title">CTR Over Time</div></div>
      <div class="chart-canvas-wrap"><canvas id="chart-ctr"></canvas></div>
    </div>
  </div>

  <!-- Campaigns table -->
  <div class="table-wrap">
    <div class="table-header">
      <div class="table-title">All Campaigns</div>
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="form-input search-input" id="search-input" placeholder="Search campaigns…" style="width:240px;">
      </div>
    </div>
    <div style="overflow-x:auto;" id="table-container">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Objective</th>
            <th>Daily Budget</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="campaigns-tbody">
          <tr><td colspan="6" style="color:var(--text-3);text-align:center;padding:24px;">Loading…</td></tr>
        </tbody>
      </table>
    </div>
    <div id="empty-campaigns" style="display:none;">
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No campaigns found</div>
        <div class="empty-text">No campaigns match your search or there are no campaigns in this workspace yet.</div>
      </div>
    </div>
  </div>

  <!-- Inspector-local styles. Kept inline (not in layout()) so the
       tab styling lives next to the markup that uses it and we avoid
       polluting the global stylesheet for a single modal. -->
  <style>
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
      border-bottom-color: var(--primary, #6366f1);
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
      background: var(--surface-1, #0f0f12);
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
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
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
  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtShortDate(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    workspaceId: null,
    // Currency context — hydrated from /api/workspaces/:id once it returns.
    // Defaults are safe for the common case (USD-style 2-decimal currencies).
    currency: 'USD',
    minorFactor: 100,
  };

  // ── Chart helpers ─────────────────────────────────────────────────────────
  function makeLineChart(canvasId, labels, datasets) {
    var ctx = document.getElementById(canvasId).getContext('2d');
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
            backgroundColor: '#18181b',
            borderColor: '#232326',
            borderWidth: 1,
            titleColor: '#f1f0f0',
            bodyColor: '#a0a0b0',
            padding: 10,
          }
        },
        scales: {
          x: {
            grid: { color: '#232326' },
            ticks: { color: '#5a5a6a', maxTicksLimit: 8, font: { size: 11 } }
          },
          y: {
            grid: { color: '#232326' },
            ticks: { color: '#5a5a6a', font: { size: 11 } }
          }
        },
        elements: { point: { radius: 0, hoverRadius: 4 } }
      }
    });
  }

  function updateCharts(insights) {
    try {
    var filtered = recentAsc(insights, state.days);
    var labels = filtered.map(function(d) { return fmtShortDate(d.date); });
    // d.spend is BigInt minor units (e.g. cents). We pass the raw minor
    // number into the chart series here because the y-axis tick formatter
    // would otherwise need the divisor too — keep it consistent by also
    // dividing in the dataset. The chart already shows magnitude only.
    var spendData = filtered.map(function(d) { return (Number(d.spend) || 0) / state.minorFactor; });
    var ctrData = filtered.map(function(d) { return Number(d.ctr) || 0; });

    if (state.spendChart) {
      state.spendChart.data.labels = labels;
      state.spendChart.data.datasets[0].data = spendData;
      state.spendChart.update();
    } else {
      state.spendChart = makeLineChart('chart-spend', labels, [{
        label: 'Spend',
        data: spendData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.08)',
        fill: true, tension: 0.4
      }]);
    }

    var hasCtrData = ctrData.some(function(v){ return v > 0; });
    var ctrCard = document.getElementById('ctr-chart-card');
    if (!hasCtrData) {
      ctrCard.style.display = 'none';
    } else {
      ctrCard.style.display = 'block';
      if (state.ctrChart) {
        state.ctrChart.data.labels = labels;
        state.ctrChart.data.datasets[0].data = ctrData;
        state.ctrChart.update();
      } else {
        state.ctrChart = makeLineChart('chart-ctr', labels, [{
          label: 'CTR (%)',
          data: ctrData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.08)',
          fill: true, tension: 0.4
        }]);
      }
    }
    } catch (chartErr) {
      console.error('[campaigns] chart render failed:', chartErr);
      var ctrCard = document.getElementById('ctr-chart-card');
      if (ctrCard) ctrCard.style.display = 'none';
    }
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  function updateSummary(campaigns, insights) {
    var total = campaigns.length;
    // Match dashboard "Active Ads · Now Spending" — DB status alone can stay
    // stale ACTIVE when sync is blocked (e.g. TOKEN_ENCRYPTION_KEY rotation).
    var active = campaigns.filter(function(c){ return c.isCurrentlySpending === true; }).length;
    var paused = campaigns.filter(function(c){ return c.status === 'PAUSED'; }).length;
    var filtered = recentAsc(insights, state.days);
    // d.spend is BigInt minor units (cents for USD, EGP, SAR; whole-unit
    // for IQD). Sum in minor units, format once with the account's
    // currencyMinorFactor — never assume "$" or 100.
    var totalSpendMinor = filtered.reduce(function(acc, d){ return acc + (Number(d.spend) || 0); }, 0);

    document.getElementById('total-campaigns').textContent = String(total);
    document.getElementById('active-campaigns').textContent = String(active);
    document.getElementById('paused-campaigns').textContent = String(paused);
    document.getElementById('total-spend').textContent = fmtCurrencyMinor(totalSpendMinor);
    document.getElementById('spend-period').textContent = 'last ' + state.days + ' days';
  }

  // ── Table rendering ───────────────────────────────────────────────────────
  // statusBadge is provided as a global by SHARED_JS in layout.ts — uses the
  // unified .badge palette (badge-green/yellow/gray/red).
  function renderTable(campaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var emptyEl = document.getElementById('empty-campaigns');
    var tableContainer = document.getElementById('table-container');
    try {
    if (!campaigns || !Array.isArray(campaigns)) campaigns = [];

    if (campaigns.length === 0) {
      tableContainer.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyEl.style.display = 'none';

    tbody.innerHTML = campaigns.map(function(c) {
      // Campaign.dailyBudget / lifetimeBudget are BigInt minor units in the
      // schema. They came through bigintReplacer as plain Numbers but still
      // in MINOR units — format via the account-aware helper.
      var budget = c.dailyBudget != null
        ? fmtCurrencyMinor(c.dailyBudget)
        : (c.lifetimeBudget != null ? fmtCurrencyMinor(c.lifetimeBudget) + ' (lifetime)' : '—');
      return '<tr>'
        + '<td><div style="font-weight:600;">' + escHtml(c.name || '—') + '</div>'
        + '<div style="font-size:11px;color:var(--text-3);margin-top:2px;font-family:monospace;">' + escHtml(c.id || '') + '</div></td>'
        + '<td>' + statusBadge(c.status) + '</td>'
        + '<td style="color:var(--text-2);">' + escHtml(c.objective || '—') + '</td>'
        + '<td>' + escHtml(budget) + '</td>'
        + '<td style="color:var(--text-2);">' + escHtml(fmtDate(c.createdAt)) + '</td>'
        + '<td><button class="btn btn-secondary btn-sm js-inspect-btn" data-campaign-id="' + escHtml(c.id) + '">View</button></td>'
        + '</tr>';
    }).join('');
    } catch (tableErr) {
      console.error('[campaigns] table render failed:', tableErr);
      tbody.innerHTML = '<tr><td colspan="6" class="section-fallback">Could not display campaigns — try refreshing.</td></tr>';
    }
  }

  // ── Search filter ─────────────────────────────────────────────────────────
  function applyFilter(query) {
    var q = (query || '').toLowerCase().trim();
    if (!q) {
      renderTable(state.campaigns);
      return;
    }
    var filtered = state.campaigns.filter(function(c) {
      return (c.name || '').toLowerCase().includes(q)
        || (c.objective || '').toLowerCase().includes(q)
        || (c.status || '').toLowerCase().includes(q)
        || (c.id || '').toLowerCase().includes(q);
    });
    renderTable(filtered);
  }

  // ── Date tab switch ───────────────────────────────────────────────────────
  function setDays(days) {
    state.days = days;
    document.querySelectorAll('.tab').forEach(function(btn) {
      if (btn.dataset.days != null) btn.classList.toggle('active', Number(btn.dataset.days) === days);
    });
    updateSummary(state.campaigns, state.insights);
    updateCharts(state.insights);
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
    var color   = isPositive ? 'var(--success)' : 'var(--danger, #ef4444)';
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
    var kpiHtml =
      '<div class="kpi-grid" style="grid-template-columns:repeat(2, 1fr);gap:12px;margin-bottom:20px;direction:rtl;text-align:right;">'
    +   '<div class="kpi-card"><div class="kpi-label">الإنفاق</div>'
    +     '<div class="kpi-value" style="font-size:18px;">' + escHtml(fmtMinor(s.spendMinor, a.currencyMinorFactor, a.currency)) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">الميزانية</div>'
    +     '<div class="kpi-value" style="font-size:14px;">' + escHtml(budgetLine) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">إجمالي الرسائل</div>'
    +     '<div class="kpi-value" style="font-size:18px;">' + escHtml(fmtNum(s.messages, 0)) + '</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">تكلفة الرسالة</div>'
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
    +   '<div><div style="font-weight:700;color:var(--danger, #ef4444);margin-bottom:8px;text-align:right;">سلبيات 🔴</div>' + negHtml + '</div>'
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
      + '<div data-tab-panel="audience"  style="display:none;">' + audienceHtml  + '</div>';

    // Reset the active tab to Overview every time we render new data.
    switchInspectorTab('overview');
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
          ? 'linear-gradient(90deg, #10b981, #34d399)'
          : 'linear-gradient(90deg, var(--accent, #6366f1), var(--accent-2, #8b5cf6))';
        var rowBg      = isWinner
          ? 'background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:8px 10px;'
          : '';
        var winnerBadge = isWinner
          ? '<span style="display:inline-block;background:#10b981;color:#fff;font-size:10px;font-weight:700;'
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
      apiFetch('/api/workspaces/' + workspaceId + '/campaigns'),
      apiFetch('/api/workspaces/' + workspaceId + '/insights?days=90'),
      apiFetch('/api/workspaces/' + workspaceId).catch(function() { return null; }),
    ]);
    var campaigns = results[0];
    var insights = results[1];
    var wsData = results[2];

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

    var searchInput = document.getElementById('search-input');
    var searchVal = searchInput && searchInput.value;
    if (searchVal) applyFilter(searchVal);
    else renderTable(state.campaigns);
    updateSummary(state.campaigns, state.insights);
    updateCharts(state.insights);
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
    var label = err.reconnectLabel || 'Reconnect Meta';
    el.innerHTML = escHtml(msg)
      + ' <a href="' + escHtml(link) + '" style="color:var(--accent);font-weight:600;margin-left:8px;white-space:nowrap;">'
      + escHtml(label) + ' →</a>';
    container.appendChild(el);
    setTimeout(function() { el.remove(); }, 8000);
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
        toast('Sync complete — ' + (job.rowsUpserted || 0) + ' rows updated', 'success');
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
      applyFilter(e.target.value);
    });

    document.getElementById('force-sync-btn').addEventListener('click', function() {
      forceSync();
    });

    // Delegated click for inspector — tbody is re-rendered on every search,
    // so listen on the stable container instead of the row buttons.
    document.getElementById('campaigns-tbody').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.js-inspect-btn');
      if (!btn) return;
      e.preventDefault();
      openInspector(btn.getAttribute('data-campaign-id'));
    });

    // Tab switching — delegated so the listener survives renderInspector()
    // overwriting #inspector-body. Idempotent: a re-render replaces panels,
    // not buttons, so the original handler stays bound.
    document.getElementById('inspector-tabs').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.inspector-tab');
      if (!btn) return;
      var name = btn.getAttribute('data-tab');
      if (name) switchInspectorTab(name);
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

      var [campaigns, insights, wsData] = await Promise.all([
        apiFetch('/api/workspaces/' + workspaceId + '/campaigns'),
        apiFetch('/api/workspaces/' + workspaceId + '/insights?days=90'),
        apiFetch('/api/workspaces/' + workspaceId).catch(function() { return null; }),
      ]);

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
      try {
        var dashData = await apiFetch('/api/dashboard/' + workspaceId);
        if (dashData && dashData.workspace) {
          wsName = dashData.workspace.name || dashData.workspace.id || wsName;
        }
      } catch (_) { /* non-critical */ }

      document.getElementById('ws-name').textContent = wsName;
      document.getElementById('page-subtitle').textContent =
        'All campaigns · ' + wsName;

      updateSummary(state.campaigns, state.insights);
      updateCharts(state.insights);
      renderTable(state.campaigns);

      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';

    } catch (err) {
      showError(friendlyApiError(err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'Campaigns', active: 'campaigns', content, scripts });
}
