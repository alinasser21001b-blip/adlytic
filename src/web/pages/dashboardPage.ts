export function dashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard — Adlytic</title>
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

    /* Layout */
    .app { display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar {
      width: 220px;
      flex-shrink: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 0;
    }
    .sidebar-logo {
      padding: 20px 20px 16px;
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      border-bottom: 1px solid var(--border);
      letter-spacing: -0.3px;
    }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      color: var(--text-2);
      font-size: 13.5px;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: rgba(99,102,241,0.15); color: var(--accent); }
    .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
    .sidebar-bottom { padding: 12px 8px; border-top: 1px solid var(--border); }

    /* Main area */
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* Topbar */
    .topbar {
      height: 56px;
      flex-shrink: 0;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }
    .topbar-left { display: flex; align-items: center; gap: 12px; }
    .workspace-name { font-weight: 600; font-size: 15px; color: var(--text); }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff;
    }
    .btn-logout {
      padding: 6px 14px;
      border-radius: 7px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text-2);
      font-size: 13px;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .btn-logout:hover { background: var(--border); color: var(--text); }

    /* Content */
    .content { flex: 1; overflow-y: auto; padding: 24px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .page-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 24px; }

    /* Loading / Error / Empty */
    .state-overlay {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 300px; gap: 16px;
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .state-text { color: var(--text-2); font-size: 14px; }
    .state-title { font-size: 17px; font-weight: 600; color: var(--text); }
    .error-box {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 10px;
      padding: 16px 20px;
      color: var(--error);
      font-size: 13.5px;
      margin-bottom: 16px;
    }

    /* Health badge */
    .health-row { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .health-badge {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 20px;
    }
    .health-ring {
      position: relative; width: 52px; height: 52px;
    }
    .health-ring svg { width: 52px; height: 52px; transform: rotate(-90deg); }
    .health-ring-bg { fill: none; stroke: var(--border); stroke-width: 5; }
    .health-ring-fg { fill: none; stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
    .health-score-label {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; color: var(--text);
    }
    .health-info .health-score-num { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1; }
    .health-info .health-band { font-size: 12px; color: var(--text-2); margin-top: 2px; }
    .health-desc { font-size: 13px; color: var(--text-2); }

    /* KPI grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
      transition: border-color 0.15s;
    }
    .kpi-card:hover { border-color: var(--accent); }
    .kpi-label { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-3); margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; }
    .kpi-delta { display: flex; align-items: center; gap: 4px; margin-top: 5px; font-size: 12px; font-weight: 600; }
    .kpi-delta.up { color: var(--success); }
    .kpi-delta.down { color: var(--error); }
    .kpi-delta.neutral { color: var(--text-3); }

    /* Charts grid */
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-bottom: 28px;
    }
    @media (max-width: 1100px) { .charts-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 700px) { .charts-grid { grid-template-columns: 1fr; } }
    .chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .chart-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 14px; }
    .chart-wrap { position: relative; height: 180px; }

    /* Bottom grid */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 900px) { .bottom-grid { grid-template-columns: 1fr; } }

    /* Issues */
    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .section-title { font-size: 14px; font-weight: 700; color: var(--text); }
    .issue-item {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .issue-item:last-child { border-bottom: none; }
    .issue-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .issue-title { font-size: 13px; font-weight: 600; color: var(--text); }
    .badge {
      display: inline-flex; align-items: center;
      padding: 2px 9px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      flex-shrink: 0;
    }
    .badge-critical { background: rgba(239,68,68,0.15); color: var(--error); border: 1px solid rgba(239,68,68,0.3); }
    .badge-high { background: rgba(245,158,11,0.15); color: var(--warning); border: 1px solid rgba(245,158,11,0.3); }
    .badge-medium { background: rgba(99,102,241,0.15); color: var(--accent); border: 1px solid rgba(99,102,241,0.3); }
    .badge-low { background: rgba(160,160,176,0.1); color: var(--text-2); border: 1px solid var(--border); }
    .issue-causes { font-size: 12px; color: var(--text-2); margin-top: 3px; }
    .issue-rec { font-size: 12px; color: var(--text-3); margin-top: 2px; font-style: italic; }
    .no-issues { color: var(--text-3); font-size: 13px; padding: 12px 0; }

    /* Campaign table */
    .campaign-table { width: 100%; border-collapse: collapse; }
    .campaign-table th {
      text-align: left; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.6px;
      color: var(--text-3); padding: 0 10px 10px; white-space: nowrap;
    }
    .campaign-table td {
      padding: 10px; font-size: 13px; color: var(--text);
      border-top: 1px solid var(--border);
    }
    .campaign-table tr:hover td { background: rgba(255,255,255,0.02); }
    .highlight-best td:first-child { border-left: 3px solid var(--success); padding-left: 7px; }
    .highlight-worst td:first-child { border-left: 3px solid var(--error); padding-left: 7px; }
    .campaign-name { font-weight: 600; }
    .campaign-sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }

    /* Priority action */
    .priority-card {
      background: linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 100%);
      border: 1px solid rgba(99,102,241,0.25);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex; align-items: flex-start; gap: 14px;
    }
    .priority-icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(99,102,241,0.2);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 17px;
    }
    .priority-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent); margin-bottom: 3px; }
    .priority-text { font-size: 14px; font-weight: 600; color: var(--text); }
  </style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-logo">Ad<span>lytic</span></div>
    <nav class="sidebar-nav">
      <a class="nav-item active" href="/dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a class="nav-item" href="/campaigns">
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
      <div class="nav-item" id="sidebar-user" style="pointer-events:none;">
        <div class="avatar" id="sidebar-avatar">?</div>
        <span id="sidebar-name" style="font-size:13px;color:var(--text-2);">Loading…</span>
      </div>
    </div>
  </aside>

  <!-- Main -->
  <div class="main">
    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="workspace-name" id="ws-name">Loading…</span>
      </div>
      <div class="topbar-right">
        <div class="avatar" id="top-avatar">?</div>
        <button class="btn-logout" id="btn-logout">Logout</button>
      </div>
    </header>

    <!-- Content -->
    <main class="content" id="content">
      <div class="state-overlay" id="loading-state">
        <div class="spinner"></div>
        <span class="state-text">Loading dashboard…</span>
      </div>
      <div id="error-state" style="display:none;">
        <div class="error-box" id="error-msg">An error occurred.</div>
      </div>
      <div id="dashboard-content" style="display:none;">
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle" id="dash-subtitle">Overview of your ad performance</div>

        <!-- Priority Action -->
        <div class="priority-card" id="priority-card" style="display:none;">
          <div class="priority-icon">⚡</div>
          <div>
            <div class="priority-label">Priority Action</div>
            <div class="priority-text" id="priority-text"></div>
          </div>
        </div>

        <!-- Health -->
        <div class="health-row">
          <div class="health-badge">
            <div class="health-ring">
              <svg viewBox="0 0 52 52">
                <circle class="health-ring-bg" cx="26" cy="26" r="22"/>
                <circle class="health-ring-fg" id="health-ring-fg" cx="26" cy="26" r="22"
                  stroke-dasharray="138.23"
                  stroke-dashoffset="138.23"
                  stroke="var(--accent)"/>
              </svg>
              <div class="health-score-label" id="health-score-label">—</div>
            </div>
            <div class="health-info">
              <div class="health-score-num" id="health-score-num">—</div>
              <div class="health-band" id="health-band">Health Score</div>
            </div>
          </div>
          <div class="health-desc" id="health-desc">Analyzing your account…</div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-grid" id="kpi-grid"></div>

        <!-- Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-title">Spend Over Time</div>
            <div class="chart-wrap"><canvas id="chart-spend"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-title">CTR Trend</div>
            <div class="chart-wrap"><canvas id="chart-ctr"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-title">Impressions Trend</div>
            <div class="chart-wrap"><canvas id="chart-impressions"></canvas></div>
          </div>
        </div>

        <!-- Bottom: Issues + Campaigns -->
        <div class="bottom-grid">
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">Issues & Alerts</div>
            </div>
            <div id="issues-list"><div class="no-issues">No issues detected.</div></div>
          </div>
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">Campaign Performance</div>
            </div>
            <div style="overflow-x:auto;">
              <table class="campaign-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Budget</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody id="campaigns-tbody">
                  <tr><td colspan="4" style="color:var(--text-3);text-align:center;padding:20px;">Loading…</td></tr>
                </tbody>
              </table>
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
  function fmt(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return decimals != null ? n.toFixed(decimals) : String(n);
  }
  function fmtCurrency(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(2) + '%';
  }
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2);
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
    return res.json();
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  // ── Chart.js defaults ─────────────────────────────────────────────────────
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
            ticks: { color: '#5a5a6a', maxTicksLimit: 7, font: { size: 11 } }
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

  // ── KPI rendering ─────────────────────────────────────────────────────────
  function renderKpis(kpis) {
    var grid = document.getElementById('kpi-grid');
    if (!kpis || kpis.length === 0) {
      grid.innerHTML = '<div class="state-text" style="padding:12px 0;">No KPI data available.</div>';
      return;
    }
    grid.innerHTML = kpis.map(function(k) {
      var deltaClass = 'neutral';
      var arrow = '';
      if (k.deltaPct != null) {
        var good = k.goodWhenUp !== false;
        var up = k.direction === 'up';
        if (up) { deltaClass = good ? 'up' : 'down'; arrow = '↑ '; }
        else { deltaClass = good ? 'down' : 'up'; arrow = '↓ '; }
      }
      var deltaHtml = k.deltaPct != null
        ? '<div class="kpi-delta ' + deltaClass + '">' + arrow + Math.abs(Number(k.deltaPct)).toFixed(1) + '%</div>'
        : '';
      return '<div class="kpi-card">'
        + '<div class="kpi-label">' + escHtml(k.label || k.key) + '</div>'
        + '<div class="kpi-value">' + escHtml(String(k.display || k.value || '—')) + '</div>'
        + deltaHtml
        + '</div>';
    }).join('');
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Issues rendering ──────────────────────────────────────────────────────
  function renderIssues(issues) {
    var el = document.getElementById('issues-list');
    if (!issues || issues.length === 0) {
      el.innerHTML = '<div class="no-issues">No issues detected. Your account looks healthy!</div>';
      return;
    }
    el.innerHTML = issues.map(function(issue) {
      var sev = (issue.severity || 'low').toLowerCase();
      var badgeClass = 'badge-' + (sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : 'low');
      var causes = Array.isArray(issue.causes) ? issue.causes.join(', ') : (issue.causes || '');
      var recs = Array.isArray(issue.recommendations) ? issue.recommendations[0] : (issue.recommendations || '');
      return '<div class="issue-item">'
        + '<div class="issue-top">'
        + '<div class="issue-title">' + escHtml(issue.title || issue.code) + '</div>'
        + '<span class="badge ' + badgeClass + '">' + escHtml(sev) + '</span>'
        + '</div>'
        + (causes ? '<div class="issue-causes">' + escHtml(causes) + '</div>' : '')
        + (recs ? '<div class="issue-rec">' + escHtml(recs) + '</div>' : '')
        + '</div>';
    }).join('');
  }

  // ── Campaign table ────────────────────────────────────────────────────────
  function renderCampaigns(best, worst, allCampaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var rows = [];

    function statusBadge(s) {
      var cls = s === 'ACTIVE' ? 'badge-low' : s === 'PAUSED' ? 'badge-high' : 'badge-low';
      if (s === 'ACTIVE') cls = 'badge';
      return '<span class="badge ' + cls + '" style="' + (s === 'ACTIVE' ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);' : '') + '">' + escHtml(s || '—') + '</span>';
    }

    function campaignRow(c, cssClass, note) {
      var budget = c.dailyBudget ? fmtCurrency(c.dailyBudget) + '/day' : (c.lifetimeBudget ? fmtCurrency(c.lifetimeBudget) + ' total' : '—');
      return '<tr class="' + cssClass + '">'
        + '<td><div class="campaign-name">' + escHtml(c.name || '—') + '</div>'
        + '<div class="campaign-sub">' + escHtml(c.objective || '') + '</div></td>'
        + '<td>' + statusBadge(c.status) + '</td>'
        + '<td>' + escHtml(budget) + '</td>'
        + '<td style="font-size:11px;color:var(--text-3);">' + escHtml(note) + '</td>'
        + '</tr>';
    }

    if (best) rows.push(campaignRow(best, 'highlight-best', '⭐ Best'));
    if (worst) rows.push(campaignRow(worst, 'highlight-worst', '⚠ Worst'));

    if (Array.isArray(allCampaigns)) {
      var listed = new Set([best && best.id, worst && worst.id].filter(Boolean));
      allCampaigns.forEach(function(c) {
        if (!listed.has(c.id)) rows.push(campaignRow(c, '', ''));
      });
    }

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-3);text-align:center;padding:20px;">No campaigns found.</td></tr>';
    } else {
      tbody.innerHTML = rows.join('');
    }
  }

  // ── Health ring ───────────────────────────────────────────────────────────
  function renderHealth(score, band) {
    var s = Number(score) || 0;
    var circumference = 2 * Math.PI * 22; // ~138.23
    var offset = circumference - (s / 100) * circumference;
    var fg = document.getElementById('health-ring-fg');
    var color = s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--accent)' : s >= 40 ? 'var(--warning)' : 'var(--error)';
    fg.style.stroke = color;
    fg.style.strokeDashoffset = String(offset);
    document.getElementById('health-score-label').textContent = String(s);
    document.getElementById('health-score-num').textContent = String(s);
    document.getElementById('health-band').textContent = band || 'Health Score';
    document.getElementById('health-desc').textContent =
      s >= 80 ? 'Your account is performing well.' :
      s >= 60 ? 'Some improvements recommended.' :
      s >= 40 ? 'Several issues need attention.' :
      'Critical issues detected. Take action now.';
  }

  // ── Insights KPIs fallback ────────────────────────────────────────────────
  function buildKpisFromInsights(insights) {
    var totals = { spend: 0, impressions: 0, reach: 0, clicks: 0, messages: 0 };
    insights.forEach(function(d) {
      totals.spend += Number(d.spend) || 0;
      totals.impressions += Number(d.impressions) || 0;
      totals.reach += Number(d.reach) || 0;
      totals.clicks += Number(d.clicks) || 0;
      totals.messages += Number(d.messages) || 0;
    });
    var ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    var cpc = totals.clicks ? totals.spend / totals.clicks : 0;
    var cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0;
    return [
      { key: 'spend', label: 'Spend', value: totals.spend, display: fmtCurrency(totals.spend), goodWhenUp: false },
      { key: 'impressions', label: 'Impressions', value: totals.impressions, display: fmt(totals.impressions), goodWhenUp: true },
      { key: 'reach', label: 'Reach', value: totals.reach, display: fmt(totals.reach), goodWhenUp: true },
      { key: 'clicks', label: 'Clicks', value: totals.clicks, display: fmt(totals.clicks), goodWhenUp: true },
      { key: 'ctr', label: 'CTR', value: ctr, display: fmtPct(ctr), goodWhenUp: true },
      { key: 'cpc', label: 'CPC', value: cpc, display: fmtCurrency(cpc), goodWhenUp: false },
      { key: 'cpm', label: 'CPM', value: cpm, display: fmtCurrency(cpm), goodWhenUp: false },
      { key: 'messages', label: 'Messages', value: totals.messages, display: fmt(totals.messages), goodWhenUp: true },
    ];
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }

    document.getElementById('btn-logout').addEventListener('click', logout);

    try {
      // Step 1: get user
      var me = await apiFetch('/api/auth/me');
      var userName = me.name || me.email || 'User';
      var userInitials = initials(userName);
      document.getElementById('sidebar-avatar').textContent = userInitials;
      document.getElementById('top-avatar').textContent = userInitials;
      document.getElementById('sidebar-name').textContent = userName;

      // Step 2: resolve workspace
      var workspaceId = getWorkspaceId();
      if (!workspaceId && me.memberships && me.memberships.length > 0) {
        workspaceId = me.memberships[0].workspaceId || me.memberships[0].workspace?.id;
        if (workspaceId) setWorkspaceId(workspaceId);
      }
      if (!workspaceId) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
        document.getElementById('kpi-grid').innerHTML = '<div class="state-overlay"><div class="state-title">No workspace found</div><div class="state-text">Create or join a workspace to see your dashboard.</div></div>';
        return;
      }

      // Step 3: fetch dashboard + insights + campaigns in parallel
      var [dashData, insights, campaigns] = await Promise.all([
        apiFetch('/api/dashboard/' + workspaceId),
        apiFetch('/api/workspaces/' + workspaceId + '/insights?days=30'),
        apiFetch('/api/workspaces/' + workspaceId + '/campaigns').catch(function() { return []; }),
      ]);

      // Empty state — no ad account connected yet
      if (dashData.empty) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
        document.getElementById('kpi-grid').innerHTML =
          '<div class="state-overlay">' +
          '<div class="state-icon">📊</div>' +
          '<div class="state-title">Connect your Meta Ads account</div>' +
          '<div class="state-text">Link your ad account to see spend, CTR, reach, and AI-powered recommendations.</div>' +
          '<a href="/workspace" class="btn btn-primary" style="margin-top:16px;">Go to Workspace</a>' +
          '</div>';
        return;
      }

      // Workspace name
      var wsName = (dashData.workspace && (dashData.workspace.name || dashData.workspace.id)) || workspaceId;
      document.getElementById('ws-name').textContent = wsName;
      document.getElementById('dash-subtitle').textContent = 'Last 30 days · ' + wsName;

      // Health
      if (dashData.health) renderHealth(dashData.health.score, dashData.health.band);

      // Priority action
      if (dashData.priorityAction) {
        var pc = document.getElementById('priority-card');
        pc.style.display = 'flex';
        var paText = typeof dashData.priorityAction === 'string'
          ? dashData.priorityAction
          : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
        document.getElementById('priority-text').textContent = paText;
      }

      // KPIs — prefer dashboard KPIs, fallback to insights
      var kpis = (dashData.kpis && dashData.kpis.length > 0)
        ? dashData.kpis
        : buildKpisFromInsights(insights || []);
      renderKpis(kpis);

      // Charts from insights
      var dates = (insights || []).map(function(d) {
        return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      var spendData = (insights || []).map(function(d) { return Number(d.spend) || 0; });
      var ctrData = (insights || []).map(function(d) { return Number(d.ctr) || 0; });
      var impData = (insights || []).map(function(d) { return Number(d.impressions) || 0; });

      // If trendSeries from dashboard overrides
      if (dashData.trendSeries && dashData.trendSeries.dates) {
        var ts = dashData.trendSeries;
        var tsDates = ts.dates.map(function(d) {
          return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        if (ts.spend) spendData = ts.spend.map(Number);
        if (ts.ctr) ctrData = ts.ctr.map(Number);
        if (ts.messages) impData = ts.messages.map(Number);
        makeLineChart('chart-spend', tsDates, [{ label: 'Spend', data: spendData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.4 }]);
        makeLineChart('chart-ctr', tsDates, [{ label: 'CTR', data: ctrData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.4 }]);
        makeLineChart('chart-impressions', tsDates, [{ label: 'Messages', data: impData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.4 }]);
      } else {
        makeLineChart('chart-spend', dates, [{ label: 'Spend', data: spendData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.4 }]);
        makeLineChart('chart-ctr', dates, [{ label: 'CTR (%)', data: ctrData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.4 }]);
        makeLineChart('chart-impressions', dates, [{ label: 'Impressions', data: impData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.4 }]);
      }

      // Issues
      renderIssues(dashData.issues || []);

      // Campaigns
      renderCampaigns(dashData.bestCampaign, dashData.worstCampaign, campaigns);

      // Show
      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('dashboard-content').style.display = 'block';

    } catch (err) {
      showError('Failed to load dashboard: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>
</body>
</html>`;
}
