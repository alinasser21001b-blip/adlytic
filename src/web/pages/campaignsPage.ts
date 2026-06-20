export function campaignsPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Campaigns — Adlytic</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0b;
      --surface: #111113;
      --surface-2: #18181b;
      --border: #232326;
      --text: #f1f0f0;
      --text-2: #a0a0b0;
      --text-3: #5a5a6a;
      --accent: #6366f1;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; }
    a { color: inherit; text-decoration: none; }
    button { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }

    .app { display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar {
      width: 220px; flex-shrink: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
    }
    .sidebar-logo {
      padding: 20px 20px 16px;
      font-size: 18px; font-weight: 700; color: var(--text);
      border-bottom: 1px solid var(--border); letter-spacing: -0.3px;
    }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-radius: 8px;
      color: var(--text-2); font-size: 13.5px; font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: rgba(99,102,241,0.15); color: var(--accent); }
    .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
    .sidebar-bottom { padding: 12px 8px; border-top: 1px solid var(--border); }

    /* Main */
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* Topbar */
    .topbar {
      height: 56px; flex-shrink: 0;
      background: var(--surface); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
    }
    .workspace-name { font-weight: 600; font-size: 15px; }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff;
    }
    .btn-logout {
      padding: 6px 14px; border-radius: 7px;
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--text-2); font-size: 13px; font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .btn-logout:hover { background: var(--border); color: var(--text); }

    .content { flex: 1; overflow-y: auto; padding: 24px; }

    /* States */
    .state-overlay {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 300px; gap: 16px;
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .state-text { color: var(--text-2); font-size: 14px; }
    .state-title { font-size: 17px; font-weight: 600; color: var(--text); }
    .error-box {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
      border-radius: 10px; padding: 16px 20px; color: var(--error); font-size: 13.5px;
      margin-bottom: 16px;
    }

    /* Page header */
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
    .page-title { font-size: 20px; font-weight: 700; }
    .page-subtitle { font-size: 13px; color: var(--text-2); margin-top: 4px; }

    /* Date range tabs */
    .date-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 4px; }
    .date-tab {
      padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: 500;
      color: var(--text-2); transition: background 0.15s, color 0.15s;
    }
    .date-tab:hover { background: var(--surface-2); color: var(--text); }
    .date-tab.active { background: var(--accent); color: #fff; }

    /* Summary cards */
    .summary-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px;
    }
    @media (max-width: 900px) { .summary-grid { grid-template-columns: 1fr 1fr; } }
    .summary-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 16px 18px;
    }
    .summary-label {
      font-size: 11.5px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.6px; color: var(--text-3); margin-bottom: 6px;
    }
    .summary-value { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; }
    .summary-sub { font-size: 12px; color: var(--text-3); margin-top: 4px; }

    /* Charts row */
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    @media (max-width: 800px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px 20px;
    }
    .chart-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 14px; }
    .chart-wrap { position: relative; height: 200px; }

    /* Table section */
    .table-section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; overflow: hidden;
    }
    .table-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid var(--border); gap: 12px;
    }
    .table-title { font-size: 14px; font-weight: 700; color: var(--text); }
    .search-input {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 8px; padding: 7px 14px; color: var(--text);
      font-size: 13px; outline: none; width: 220px;
      transition: border-color 0.15s;
    }
    .search-input::placeholder { color: var(--text-3); }
    .search-input:focus { border-color: var(--accent); }
    .campaigns-table { width: 100%; border-collapse: collapse; }
    .campaigns-table th {
      text-align: left; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.6px;
      color: var(--text-3); padding: 0 16px 0; height: 36px; white-space: nowrap;
      background: var(--surface-2);
    }
    .campaigns-table td {
      padding: 12px 16px; font-size: 13px; color: var(--text);
      border-top: 1px solid var(--border);
    }
    .campaigns-table tbody tr:hover td { background: rgba(255,255,255,0.015); }
    .campaign-name-cell { font-weight: 600; color: var(--text); }
    .campaign-id { font-size: 11px; color: var(--text-3); margin-top: 2px; font-family: monospace; }

    /* Badges */
    .badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
      white-space: nowrap;
    }
    .badge-active { background: rgba(34,197,94,0.15); color: var(--success); border: 1px solid rgba(34,197,94,0.3); }
    .badge-paused { background: rgba(245,158,11,0.15); color: var(--warning); border: 1px solid rgba(245,158,11,0.3); }
    .badge-archived { background: rgba(90,90,106,0.15); color: var(--text-3); border: 1px solid var(--border); }
    .badge-deleted { background: rgba(239,68,68,0.15); color: var(--error); border: 1px solid rgba(239,68,68,0.3); }

    /* Actions */
    .btn-view {
      padding: 5px 14px; border-radius: 7px;
      background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25);
      color: var(--accent); font-size: 12px; font-weight: 600;
      transition: background 0.15s;
    }
    .btn-view:hover { background: rgba(99,102,241,0.2); }

    /* Empty / CTA */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 48px 24px; gap: 12px; text-align: center;
    }
    .empty-icon { font-size: 40px; margin-bottom: 4px; }
    .empty-title { font-size: 17px; font-weight: 700; color: var(--text); }
    .empty-desc { font-size: 13px; color: var(--text-2); max-width: 340px; line-height: 1.6; }
    .btn-cta {
      margin-top: 8px;
      padding: 10px 24px; border-radius: 9px;
      background: var(--accent); color: #fff;
      font-size: 14px; font-weight: 600;
      transition: opacity 0.15s;
    }
    .btn-cta:hover { opacity: 0.88; }

    .no-ad-account {
      background: rgba(99,102,241,0.06);
      border: 1px dashed rgba(99,102,241,0.3);
      border-radius: 12px; padding: 32px 24px;
      text-align: center; margin-bottom: 24px;
    }
    .no-ad-account-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
    .no-ad-account-desc { font-size: 13px; color: var(--text-2); margin-bottom: 16px; }
  </style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-logo">Ad<span>lytic</span></div>
    <nav class="sidebar-nav">
      <a class="nav-item" href="/dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a class="nav-item active" href="/campaigns">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4H3z"/><path d="M3 11h18v2H3z"/><path d="M3 17h12v4H3z"/></svg>
        Campaigns
      </a>
      <a class="nav-item" href="/recommendations">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
        Recommendations
      </a>
      <a class="nav-item" href="/workspace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Workspace
      </a>
      <a class="nav-item" href="/ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        AI Insights
      </a>
      <a class="nav-item" href="/settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </a>
    </nav>
    <div class="sidebar-bottom">
      <div class="nav-item" style="pointer-events:none;">
        <div class="avatar" id="sidebar-avatar">?</div>
        <span id="sidebar-name" style="font-size:13px;color:var(--text-2);">Loading…</span>
      </div>
    </div>
  </aside>

  <!-- Main -->
  <div class="main">
    <header class="topbar">
      <div>
        <span class="workspace-name" id="ws-name">Loading…</span>
      </div>
      <div class="topbar-right">
        <div class="avatar" id="top-avatar">?</div>
        <button class="btn-logout" id="btn-logout">Logout</button>
      </div>
    </header>

    <main class="content" id="content">
      <div class="state-overlay" id="loading-state">
        <div class="spinner"></div>
        <span class="state-text">Loading campaigns…</span>
      </div>
      <div id="error-state" style="display:none;">
        <div class="error-box" id="error-msg">An error occurred.</div>
      </div>

      <div id="main-content" style="display:none;">
        <!-- No ad account CTA -->
        <div class="no-ad-account" id="no-ad-account-cta" style="display:none;">
          <div class="no-ad-account-title">Connect Your Meta Ad Account</div>
          <div class="no-ad-account-desc">Link your Meta Ads account to start tracking campaign performance, spend, and ROI in real time.</div>
          <a href="/workspace" class="btn-cta" style="display:inline-block;">Go to Workspace</a>
        </div>

        <!-- Paused / expired token CTA -->
        <div class="no-ad-account" id="paused-account-cta" style="display:none;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.06);">
          <div class="no-ad-account-title" style="color:var(--warning);">⚠ Ad Account Token Expired</div>
          <div class="no-ad-account-desc">Your Meta Ads access token has expired. Campaign data shown below is cached and may be outdated. Reconnect your account to resume live syncing.</div>
          <a href="/workspace" class="btn-cta" style="display:inline-block;background:var(--warning);">Reconnect in Workspace</a>
        </div>

        <!-- Page header -->
        <div class="page-header">
          <div>
            <div class="page-title">Campaigns</div>
            <div class="page-subtitle" id="page-subtitle">All campaigns across your Meta ad account</div>
          </div>
          <div class="date-tabs" id="date-tabs">
            <button class="date-tab" data-days="7">7d</button>
            <button class="date-tab active" data-days="30">30d</button>
            <button class="date-tab" data-days="14">14d</button>
            <button class="date-tab" data-days="90">90d</button>
          </div>
        </div>

        <!-- Summary cards -->
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Total Campaigns</div>
            <div class="summary-value" id="total-campaigns">—</div>
            <div class="summary-sub">in your account</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Active</div>
            <div class="summary-value" id="active-campaigns" style="color:var(--success);">—</div>
            <div class="summary-sub">currently running</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Paused</div>
            <div class="summary-value" id="paused-campaigns" style="color:var(--warning);">—</div>
            <div class="summary-sub">paused campaigns</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Spend</div>
            <div class="summary-value" id="total-spend" style="font-size:20px;">—</div>
            <div class="summary-sub" id="spend-period">last 30 days</div>
          </div>
        </div>

        <!-- Charts row -->
        <div class="charts-row" id="charts-row">
          <div class="chart-card">
            <div class="chart-title">Spend Over Time</div>
            <div class="chart-wrap"><canvas id="chart-spend"></canvas></div>
          </div>
          <div class="chart-card" id="ctr-chart-card">
            <div class="chart-title">CTR Over Time</div>
            <div class="chart-wrap"><canvas id="chart-ctr"></canvas></div>
          </div>
        </div>

        <!-- Table -->
        <div class="table-section">
          <div class="table-header">
            <div class="table-title">All Campaigns</div>
            <input
              class="search-input"
              id="search-input"
              type="text"
              placeholder="Search campaigns…"
            />
          </div>
          <div style="overflow-x:auto;" id="table-container">
            <table class="campaigns-table">
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
              <div class="empty-desc">No campaigns match your search or there are no campaigns in this workspace yet.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>

<script>
(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────────
  function fmtCurrency(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    var filtered = insights.slice(-state.days);
    var labels = filtered.map(function(d) { return fmtShortDate(d.date); });
    var spendData = filtered.map(function(d) { return Number(d.spend) || 0; });
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
    var filtered = insights.slice(-state.days);
    var totalSpend = filtered.reduce(function(acc, d){ return acc + (Number(d.spend) || 0); }, 0);

    document.getElementById('total-campaigns').textContent = String(total);
    document.getElementById('active-campaigns').textContent = String(active);
    document.getElementById('paused-campaigns').textContent = String(paused);
    document.getElementById('total-spend').textContent = fmtCurrency(totalSpend);
    document.getElementById('spend-period').textContent = 'last ' + state.days + ' days';
  }

  // ── Status badge ──────────────────────────────────────────────────────────
  function statusBadge(status) {
    var s = (status || '').toUpperCase();
    var cls = s === 'ACTIVE' ? 'badge-active'
      : s === 'PAUSED' ? 'badge-paused'
      : s === 'ARCHIVED' ? 'badge-archived'
      : s === 'DELETED' ? 'badge-deleted'
      : 'badge-archived';
    return '<span class="badge ' + cls + '">' + escHtml(s || '—') + '</span>';
  }

  // ── Table rendering ───────────────────────────────────────────────────────
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
      var budget = c.dailyBudget != null
        ? fmtCurrency(c.dailyBudget)
        : (c.lifetimeBudget != null ? fmtCurrency(c.lifetimeBudget) + ' (lifetime)' : '—');
      return '<tr>'
        + '<td><div class="campaign-name-cell">' + escHtml(c.name || '—') + '</div>'
        + '<div class="campaign-id">' + escHtml(c.id || '') + '</div></td>'
        + '<td>' + statusBadge(c.status) + '</td>'
        + '<td style="color:var(--text-2);">' + escHtml(c.objective || '—') + '</td>'
        + '<td>' + escHtml(budget) + '</td>'
        + '<td style="color:var(--text-2);">' + escHtml(fmtDate(c.createdAt)) + '</td>'
        + '<td><button class="btn-view" onclick="window.location.href=\'/campaigns/' + escHtml(c.id) + '\'">View</button></td>'
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
    document.querySelectorAll('.date-tab').forEach(function(btn) {
      btn.classList.toggle('active', Number(btn.dataset.days) === days);
    });
    updateSummary(state.campaigns, state.insights);
    updateCharts(state.insights);
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }

    document.getElementById('btn-logout').addEventListener('click', logout);

    document.getElementById('date-tabs').addEventListener('click', function(e) {
      var btn = e.target.closest('.date-tab');
      if (btn) setDays(Number(btn.dataset.days));
    });

    document.getElementById('search-input').addEventListener('input', function(e) {
      applyFilter(e.target.value);
    });

    try {
      var me = await apiFetch('/api/auth/me');
      var userName = me.name || me.email || 'User';
      document.getElementById('sidebar-avatar').textContent = initials(userName);
      document.getElementById('top-avatar').textContent = initials(userName);
      document.getElementById('sidebar-name').textContent = userName;

      var workspaceId = getWorkspaceId();
      if (!workspaceId && me.memberships && me.memberships.length > 0) {
        workspaceId = me.memberships[0].workspaceId || (me.memberships[0].workspace && me.memberships[0].workspace.id);
        if (workspaceId) setWorkspaceId(workspaceId);
      }

      if (!workspaceId) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('no-ad-account-cta').style.display = 'block';
        renderTable([]);
        return;
      }

      state.workspaceId = workspaceId;

      var [campaigns, insights, wsData] = await Promise.all([
        apiFetch('/api/workspaces/' + workspaceId + '/campaigns'),
        apiFetch('/api/workspaces/' + workspaceId + '/insights?days=90'),
        apiFetch('/api/workspaces/' + workspaceId).catch(function() { return null; }),
      ]);

      // Detect paused / expired token
      var allPaused = wsData && Array.isArray(wsData.adAccounts)
        && wsData.adAccounts.length > 0
        && wsData.adAccounts.every(function(a) { return a.status !== 'ACTIVE'; });

      if (allPaused) {
        document.getElementById('paused-account-cta').style.display = 'block';
      }

      // Detect no ad account connected at all
      var hasData = (Array.isArray(campaigns) && campaigns.length > 0)
        || (Array.isArray(insights) && insights.length > 0);
      if (!hasData && !allPaused) {
        document.getElementById('no-ad-account-cta').style.display = 'block';
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
</script>
</body>
</html>`;
}
