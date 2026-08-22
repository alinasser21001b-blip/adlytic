// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminDashboardPage.ts
//
//  جداول الوصول والأموال وقائمة المستخدمين بتفصيلها الكامل — التفاصيل التي تكمّل «تشغيل المنصة».
//
//  ── Why it renders inside the Control Plane shell ─────────────────────
//
//  This page was reachable from the Control Plane and drew its own sidebar,
//  topbar and header. An operator who followed that link left one product and
//  arrived in another — same platform, different application. The navigation
//  audit named it: shell lost, context bar emptied, no active nav item.
//
//  Nothing it renders was removed. The detail it uniquely owns is exactly why
//  this is a WRAP and not a redirect: deleting the route would delete the
//  detail. What is gone is the chrome it duplicated — navigation, context,
//  the command palette and operator identity belong to the shell, here as
//  everywhere else.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `/* The page was authored against --font; the system calls it --font-body. */
    :root { --font: var(--font-body); }
button { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
.access-gate.hidden { display: none; }
@keyframes gate-spin { to { transform: rotate(360deg); }
}
.nav-item.active { background: var(--accent-dim); color: var(--accent); }
.sidebar-bottom { padding: 12px 8px; border-top: 1px solid var(--border); }
.topbar-left { display: flex; align-items: center; gap: 12px; }
.workspace-name { font-weight: 600; font-size: 15px; color: var(--text); }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; }
.btn-logout { padding: 6px 14px; border-radius: 7px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); font-size: 13px; font-weight: 500; transition: background 0.15s, color 0.15s; }
.btn-logout:hover { background: var(--border); color: var(--text); }
.page-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.page-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 24px; }
.state-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; gap: 16px; }
.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.75s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); }
}
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
.badge-cache { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
.badge-fresh { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
.btn-refresh { padding: 8px 14px; border-radius: 7px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; transition: opacity 0.15s; }
.btn-refresh:hover { opacity: 0.9; }
.btn-refresh[disabled] { opacity: 0.5; cursor: not-allowed; }
.btn-activate { padding: 6px 12px; border-radius: 6px; background: var(--success); color: #fff; font-size: 12px; font-weight: 600; }
.btn-activate:hover { opacity: 0.9; }
.btn-activate[disabled] { opacity: 0.5; cursor: not-allowed; }
.badge-active { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
.badge-inactive { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
.error-box { padding: 16px; border: 1px solid var(--error); background: var(--error-dim); border-radius: 10px; color: var(--error); font-size: 13px; }`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">مراقبة المنصة</div>
      <div class="phead-s">جداول الوصول والأموال وقائمة المستخدمين بتفصيلها الكامل — التفاصيل التي تكمّل «تشغيل المنصة».</div>
    </div>
    <div class="phead-actions">
      <button class="btn" id="btn-refresh">تحديث</button>
      <a class="btn" href="/admin/operations">تشغيل المنصة</a>
    </div>
  </div>
`;

const BODY = `
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

        <!-- User activation -->
        <div class="card" style="margin-top:18px;">
          <div class="card-head">
            <div class="card-title">User activation</div>
            <div class="card-meta">Manual WhatsApp onboarding</div>
          </div>
          <div id="users-loading" class="state-text" style="padding:12px 0;">Loading users…</div>
          <div id="users-error" class="error-box" style="display:none;margin-bottom:12px;"></div>
          <table class="money" id="users-table" style="display:none;">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>

      </div>
    `;

const SCRIPT = `
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
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) {
      var msg = 'Request failed (' + res.status + ')';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.json().catch(function() {
      throw new Error('Server returned a non-JSON response from ' + url);
    });
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

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch (e) { return '—'; }
  }

  async function loadUsers() {
    var loadingEl = document.getElementById('users-loading');
    var errorEl = document.getElementById('users-error');
    var tableEl = document.getElementById('users-table');
    var tbody = document.getElementById('users-tbody');
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    tableEl.style.display = 'none';
    try {
      var data = await apiFetch('/api/admin/users');
      var users = data.users || [];
      loadingEl.style.display = 'none';
      tableEl.style.display = 'table';
      tbody.innerHTML = users.map(function (u) {
        var statusBadge = u.isActive
          ? '<span class="badge badge-active">Active</span>'
          : '<span class="badge badge-inactive">Pending</span>';
        var action = u.isActive
          ? '<span style="color:var(--text-3);font-size:12px;">—</span>'
          : '<button class="btn-activate" data-user-id="' + escHtml(u.id) + '">Activate</button>';
        return ''
          + '<tr>'
          +   '<td>' + escHtml(u.email) + '</td>'
          +   '<td>' + escHtml(u.name || '—') + '</td>'
          +   '<td>' + statusBadge + '</td>'
          +   '<td>' + escHtml(fmtDate(u.createdAt)) + '</td>'
          +   '<td>' + action + '</td>'
          + '</tr>';
      }).join('');
      tbody.querySelectorAll('.btn-activate').forEach(function (btn) {
        btn.addEventListener('click', function () { activateUser(btn); });
      });
    } catch (err) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = 'Failed to load users: ' + (err.message || String(err));
    }
  }

  async function activateUser(btn) {
    var userId = btn.getAttribute('data-user-id');
    if (!userId) return;
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Activating…';
    try {
      await apiFetch('/api/admin/users/activate', {
        method: 'POST',
        body: JSON.stringify({ userId: userId }),
      });
      await loadUsers();
    } catch (err) {
      alert('Activation failed: ' + (err.message || String(err)));
      btn.disabled = false;
      btn.textContent = orig;
    }
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
    if (!token) { window.location.replace('/login'); return; }
    // Logout is the shell's control now, not this page's — binding it here
    // would fire the same handler twice.
    var rf = document.getElementById('btn-refresh');
    if (rf) rf.addEventListener('click', function(e) { bustAndReload(e.currentTarget); });

    // The client-side access gate is gone, and deliberately so. It reached for
    // a chrome (.app, #access-gate, #sidebar-avatar) that this page no longer
    // owns — the Control Plane shell does — so it threw inside its own try and
    // fell through to the error branch, which is why the page rendered an
    // error instead of its data. Authorisation was never this gate's job:
    // the route resolves the session server-side and redirects a non-admin to
    // /dashboard, so this HTML only ever reaches a platform admin.
    try {
      await loadStats();
      await loadUsers();
    } catch (err) {
      if (err && err.message === 'Unauthorized') return; // api() already redirected
      showError('Failed to load admin stats: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
`;

export function adminDashboardPage(): string {
  return adminShell({
    active: 'observability',
    title: 'مراقبة المنصة',
    subtitle: 'جداول الوصول والأموال وقائمة المستخدمين بتفصيلها الكامل — التفاصيل التي تكمّل «تشغيل المنصة».',
    css: CSS,
    header: HEADER,
    body: BODY,
    script: SCRIPT,
    commands: [
      { label: 'تشغيل المنصة', href: '/admin/operations', hint: 'العمليات' },
    ],
  });
}
