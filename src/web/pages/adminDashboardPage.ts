// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminDashboardPage.ts
//
//  Platform-admin observability page.
//
//  Mirrors the visual language of dashboardPage.ts (same CSS custom
//  properties, same sidebar/topbar layout, vanilla JS hydration). The page
//  HTML is served to anyone who visits /admin — every piece of sensitive
//  data is fetched from /api/admin/platform-stats which gates on
//  `requirePlatformAdmin`. Non-admins see "Forbidden" in the content area.
//
//  Widgets:
//    1. Reach card        — workspaces / accounts / active campaigns
//    2. Money table       — one row per currency, daily + implied monthly
//    3. Brain Health card — last-7d snapshot + narration coverage
//    4. Cache meta footer — computedAt + fromCache badge + Refresh Now button
//                           (POSTs /api/admin/cache/bust then refetches)
// ════════════════════════════════════════════════════════════════════════

export function adminDashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin — Adlytic</title>
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

    .sidebar { width: 220px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar-logo { padding: 20px 20px 16px; font-size: 18px; font-weight: 700; color: var(--text); border-bottom: 1px solid var(--border); letter-spacing: -0.3px; }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: var(--text-2); font-size: 13.5px; font-weight: 500; transition: background 0.15s, color 0.15s; }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: rgba(99,102,241,0.15); color: var(--accent); }
    .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
    .sidebar-bottom { padding: 12px 8px; border-top: 1px solid var(--border); }

    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .topbar { height: 56px; flex-shrink: 0; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
    .topbar-left { display: flex; align-items: center; gap: 12px; }
    .workspace-name { font-weight: 600; font-size: 15px; color: var(--text); }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; }
    .btn-logout { padding: 6px 14px; border-radius: 7px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); font-size: 13px; font-weight: 500; transition: background 0.15s, color 0.15s; }
    .btn-logout:hover { background: var(--border); color: var(--text); }

    .content { flex: 1; overflow-y: auto; padding: 24px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .page-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 24px; }

    .state-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; gap: 16px; }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.75s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .state-title { font-size: 16px; font-weight: 600; color: var(--text); }
    .state-text { font-size: 13px; color: var(--text-2); text-align: center; max-width: 420px; }

    /* Admin-specific widgets */
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 18px; }
    .card { padding: 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .card-title { font-size: 14px; font-weight: 600; color: var(--text); }
    .card-meta { font-size: 12px; color: var(--text-3); }
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; }
    .kpi { display: flex; flex-direction: column; gap: 4px; }
    .kpi-label { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 24px; font-weight: 700; color: var(--text); line-height: 1.1; }
    .kpi-value.hero { font-size: 32px; color: var(--accent); }

    table.money { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.money th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-3); border-bottom: 1px solid var(--border); }
    table.money td { padding: 12px; border-bottom: 1px solid var(--border); }
    table.money td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text); }
    table.money tr:last-child td { border-bottom: none; }
    table.money .ccy-badge { padding: 3px 8px; border-radius: 6px; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: var(--accent); }

    .cache-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-top: 4px; }
    .cache-info { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-2); }
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; }
    .badge-cache { background: rgba(245,158,11,0.15); color: var(--warning); border: 1px solid rgba(245,158,11,0.35); }
    .badge-fresh { background: rgba(34,197,94,0.15); color: var(--success); border: 1px solid rgba(34,197,94,0.35); }
    .btn-refresh { padding: 8px 14px; border-radius: 7px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; transition: opacity 0.15s; }
    .btn-refresh:hover { opacity: 0.9; }
    .btn-refresh[disabled] { opacity: 0.5; cursor: not-allowed; }

    .error-box { padding: 16px; border: 1px solid rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); border-radius: 10px; color: var(--error); font-size: 13px; }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-logo">Ad<span>lytic</span></div>
    <nav class="sidebar-nav">
      <a class="nav-item" href="/dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a class="nav-item" href="/campaigns">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4H3z"/><path d="M3 11h18v2H3z"/><path d="M3 17h12v4H3z"/></svg>
        Campaigns
      </a>
      <a class="nav-item" href="/settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </a>
      <a class="nav-item active" href="/admin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
        Admin
      </a>
    </nav>
    <div class="sidebar-bottom">
      <div class="nav-item" id="sidebar-user" style="pointer-events:none;">
        <div class="avatar" id="sidebar-avatar">?</div>
        <span id="sidebar-name" style="font-size:13px;color:var(--text-2);">Loading…</span>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <div class="topbar-left">
        <span class="workspace-name">Platform Observability</span>
      </div>
      <div class="topbar-right">
        <div class="avatar" id="top-avatar">?</div>
        <button class="btn-logout" id="btn-logout">Logout</button>
      </div>
    </header>

    <main class="content">
      <div class="page-title">Admin Dashboard</div>
      <div class="page-subtitle">Platform-wide reach, money under management, brain health</div>

      <div class="state-overlay" id="loading-state">
        <div class="spinner"></div>
        <span class="state-text">Loading platform stats…</span>
      </div>

      <div id="error-state" style="display:none;">
        <div class="error-box" id="error-msg">An error occurred.</div>
      </div>

      <div id="admin-content" style="display:none;">

        <!-- Reach + Brain Health (two cards side by side) -->
        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <div class="card-title">Reach</div>
              <div class="card-meta">Across all workspaces</div>
            </div>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Workspaces</div><div class="kpi-value" id="reach-workspaces">—</div></div>
              <div class="kpi"><div class="kpi-label">Ad Accounts</div><div class="kpi-value" id="reach-accounts">—</div></div>
              <div class="kpi"><div class="kpi-label">Active</div><div class="kpi-value" id="reach-active-accounts">—</div></div>
              <div class="kpi"><div class="kpi-label">Campaigns</div><div class="kpi-value hero" id="reach-campaigns">—</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div class="card-title">Brain Health</div>
              <div class="card-meta">Last <span id="brain-lookback">7</span> days</div>
            </div>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Snapshots</div><div class="kpi-value" id="brain-snapshots">—</div></div>
              <div class="kpi"><div class="kpi-label">Narrated</div><div class="kpi-value" id="brain-narrations">—</div></div>
              <div class="kpi"><div class="kpi-label">Coverage</div><div class="kpi-value hero" id="brain-coverage">—</div></div>
            </div>
          </div>
        </div>

        <!-- Money table -->
        <div class="card" style="margin-bottom:18px;">
          <div class="card-head">
            <div class="card-title">Money Under Management</div>
            <div class="card-meta">Native currency · Daily budgets (active campaigns)</div>
          </div>
          <div id="money-empty" style="display:none;font-size:13px;color:var(--text-3);text-align:center;padding:18px 0;">
            No active campaigns with a daily budget set.
          </div>
          <table class="money" id="money-table" style="display:none;">
            <thead>
              <tr>
                <th>Currency</th>
                <th>Active Campaigns</th>
                <th style="text-align:right;">Total Daily Budget</th>
                <th style="text-align:right;">Implied Monthly (×30)</th>
              </tr>
            </thead>
            <tbody id="money-tbody"></tbody>
          </table>
        </div>

        <!-- Cache meta footer -->
        <div class="cache-bar">
          <div class="cache-info">
            <span id="cache-badge" class="badge badge-fresh">FRESH</span>
            <span>Computed <span id="cache-age">just now</span></span>
          </div>
          <button class="btn-refresh" id="btn-refresh">Refresh Now</button>
        </div>

      </div>
    </main>
  </div>
</div>

<script>
(function() {
  function getToken() {
    try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; }
  }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    window.location.href = '/login';
  }
  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + (parts.length > 1 ? (parts[parts.length - 1][0] || '').toUpperCase() : '');
  }
  function fmtNumber(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString();
  }
  function fmtMoney(n, ccy) {
    if (n === null || n === undefined) return '—';
    // Show whole numbers for zero-decimal currencies (e.g. IQD), 2-decimals otherwise.
    var isWhole = Number.isInteger(n);
    var formatted = isWhole ? Number(n).toLocaleString() : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return formatted + ' ' + ccy;
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toFixed(1) + '%';
  }
  function fmtRelativeTime(ms) {
    var diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diffSec < 60) return diffSec + 's ago';
    var diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return diffMin + 'm ago';
    var diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    return Math.round(diffHr / 24) + 'd ago';
  }

  async function apiFetch(url, opts) {
    opts = opts || {};
    var token = getToken();
    var headers = Object.assign({}, opts.headers || {}, {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (token || ''),
    });
    var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      var msg = 'Request failed (' + res.status + ')';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  function renderStats(stats) {
    // Reach
    document.getElementById('reach-workspaces').textContent = fmtNumber(stats.reach.totalWorkspaces);
    document.getElementById('reach-accounts').textContent = fmtNumber(stats.reach.totalAdAccounts);
    document.getElementById('reach-active-accounts').textContent = fmtNumber(stats.reach.activeAdAccounts);
    document.getElementById('reach-campaigns').textContent = fmtNumber(stats.reach.activeCampaigns);

    // Brain Health
    document.getElementById('brain-lookback').textContent = String(stats.brain.lookbackDays);
    document.getElementById('brain-snapshots').textContent = fmtNumber(stats.brain.snapshotsLastNDays);
    document.getElementById('brain-narrations').textContent = fmtNumber(stats.brain.narrationsLastNDays);
    document.getElementById('brain-coverage').textContent = fmtPct(stats.brain.narrationCoveragePct);

    // Money table
    var rows = stats.money && stats.money.byCurrency ? stats.money.byCurrency : [];
    var tableEl = document.getElementById('money-table');
    var emptyEl = document.getElementById('money-empty');
    var tbody = document.getElementById('money-tbody');
    if (rows.length === 0) {
      tableEl.style.display = 'none';
      emptyEl.style.display = 'block';
    } else {
      emptyEl.style.display = 'none';
      tableEl.style.display = 'table';
      tbody.innerHTML = rows.map(function(r) {
        return ''
          + '<tr>'
          +   '<td><span class="ccy-badge">' + escHtml(r.currency) + '</span></td>'
          +   '<td>' + fmtNumber(r.activeCampaigns) + '</td>'
          +   '<td class="num">' + fmtMoney(r.totalDailyBudgetMajor, r.currency) + '</td>'
          +   '<td class="num">' + fmtMoney(r.impliedMonthlyMajor, r.currency) + '</td>'
          + '</tr>';
      }).join('');
    }

    // Cache meta
    var badge = document.getElementById('cache-badge');
    if (stats.fromCache) {
      badge.textContent = 'CACHED';
      badge.className = 'badge badge-cache';
    } else {
      badge.textContent = 'FRESH';
      badge.className = 'badge badge-fresh';
    }
    document.getElementById('cache-age').textContent = fmtRelativeTime(stats.computedAt);
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadStats() {
    var stats = await apiFetch('/api/admin/platform-stats');
    renderStats(stats);
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
  }

  async function bustAndReload(btn) {
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Refreshing…';
    try {
      await apiFetch('/api/admin/cache/bust', { method: 'POST', body: '{}' });
      await loadStats();
    } catch (err) {
      showError('Refresh failed: ' + (err.message || String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-refresh').addEventListener('click', function(e) {
      bustAndReload(e.currentTarget);
    });

    try {
      var me = await apiFetch('/api/auth/me');
      // Server-side gating is what actually protects /api/admin/* — this is a
      // friendly UI guard so non-admins who somehow land on /admin see a clear
      // message instead of just an empty card.
      if (!me.isPlatformAdmin) {
        showError('This page is reserved for platform administrators.');
        return;
      }
      var userName = me.name || me.email || 'Admin';
      document.getElementById('sidebar-avatar').textContent = initials(userName);
      document.getElementById('top-avatar').textContent = initials(userName);
      document.getElementById('sidebar-name').textContent = userName;

      await loadStats();
    } catch (err) {
      showError('Failed to load admin stats: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>
</body>
</html>`;
}
