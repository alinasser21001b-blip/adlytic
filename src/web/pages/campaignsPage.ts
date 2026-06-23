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
    <a href="/workspace" class="btn btn-primary">Reconnect in Workspace</a>
  </div>

  <!-- Page header -->
  <div class="page-header flex items-center justify-between">
    <div>
      <div class="page-title">Campaigns</div>
      <div class="page-subtitle" id="page-subtitle">All campaigns across your Meta ad account</div>
    </div>
    <div class="tabs" id="date-tabs">
      <button class="tab" data-days="7">7d</button>
      <button class="tab" data-days="14">14d</button>
      <button class="tab active" data-days="30">30d</button>
      <button class="tab" data-days="90">90d</button>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Campaigns</div>
      <div class="kpi-value" id="total-campaigns">—</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Active</div>
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
  function getToken() { return localStorage.getItem('adlytic_token'); }
  function getWorkspaceId() { return localStorage.getItem('adlytic_workspace_id'); }
  function setWorkspaceId(id) { localStorage.setItem('adlytic_workspace_id', id); }
  function logout() {
    localStorage.removeItem('adlytic_token');
    localStorage.removeItem('adlytic_workspace_id');
    window.location.href = '/login';
  }

  async function apiFetch(path) {
    var token = getToken();
    var res = await fetch(path, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('API error ' + res.status + ' on ' + path);
    return res.json().catch(function() {
      throw new Error('Server returned a non-JSON response from ' + path);
    });
  }

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
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  function updateSummary(campaigns, insights) {
    var total = campaigns.length;
    var active = campaigns.filter(function(c){ return c.status === 'ACTIVE'; }).length;
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
        + '<td><a class="btn btn-secondary btn-sm" href="/campaigns/' + escHtml(c.id) + '">View</a></td>'
        + '</tr>';
    }).join('');
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
        if (primary.currencyMinorFactor) state.minorFactor = Number(primary.currencyMinorFactor);
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
      showError('Failed to load campaigns: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'Campaigns', active: 'campaigns', content, scripts });
}
