// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/metaReadinessPage.ts
//
//  Meta Marketing API Access Tier — readiness checklist (platform-admin only).
//
//  A single-purpose internal page that answers one question for whoever is
//  preparing the Meta App Review / access-tier request: "Are we there yet?"
//  It renders the two gating conditions Meta measures, plus the per-category
//  error breakdown, straight from getMetaUsageStats():
//
//    1. ≥ 500 successful Marketing API calls over the rolling 15-day window
//    2. < 15% error rate over the LAST 500 calls
//
//  Mirrors adminDashboardPage.ts: the HTML is served to anyone who visits
//  /admin/meta-readiness, but every number comes from /api/admin/meta-usage
//  which gates on requirePlatformAdmin. A client-side `me.isPlatformAdmin`
//  check is only a friendly UI guard — the server route is the real boundary.
// ════════════════════════════════════════════════════════════════════════

export function metaReadinessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Meta Readiness — Adlytic</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #100E0D;
      --surface: #1A1613;
      --surface-2: #221D19;
      --border: #322B25;
      --text: #F3EFE7;
      --text-2: #B8AC9C;
      --text-3: #746A5C;
      --accent: #D9A759;
      --success: #34A871;
      --warning: #C77A1F;
      --error: #E2604F;
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
    .nav-item.active { background: rgba(217,167,89,0.15); color: var(--accent); }
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
    .state-text { font-size: 13px; color: var(--text-2); text-align: center; max-width: 420px; }

    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 18px; }
    .card { padding: 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .card-title { font-size: 14px; font-weight: 600; color: var(--text); }
    .card-meta { font-size: 12px; color: var(--text-3); }

    /* Verdict banner */
    .verdict { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 12px; margin-bottom: 18px; border: 1px solid var(--border); background: var(--surface); }
    .verdict-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; font-weight: 700; }
    .verdict-ready .verdict-icon { background: rgba(52,168,113,0.15); color: var(--success); border: 1px solid rgba(52,168,113,0.4); }
    .verdict-notready .verdict-icon { background: rgba(199,122,31,0.15); color: var(--warning); border: 1px solid rgba(199,122,31,0.4); }
    .verdict-title { font-size: 16px; font-weight: 700; }
    .verdict-ready .verdict-title { color: var(--success); }
    .verdict-notready .verdict-title { color: var(--warning); }
    .verdict-sub { font-size: 12px; color: var(--text-2); margin-top: 2px; }

    /* Gate checklist */
    .gate { display: flex; align-items: flex-start; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .gate:last-child { border-bottom: none; }
    .gate-check { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; font-weight: 700; margin-top: 2px; }
    .gate-check.ok { background: rgba(52,168,113,0.15); color: var(--success); border: 1px solid rgba(52,168,113,0.4); }
    .gate-check.no { background: rgba(199,122,31,0.15); color: var(--warning); border: 1px solid rgba(199,122,31,0.4); }
    .gate-body { flex: 1; }
    .gate-label { font-size: 14px; font-weight: 600; color: var(--text); }
    .gate-detail { font-size: 12.5px; color: var(--text-2); margin-top: 3px; }
    .gate-value { font-size: 22px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
    .gate-value.ok { color: var(--success); }
    .gate-value.no { color: var(--warning); }

    /* progress bar */
    .bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; margin-top: 10px; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .bar-fill.ok { background: var(--success); }
    .bar-fill.no { background: var(--warning); }

    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
    .kpi { display: flex; flex-direction: column; gap: 4px; }
    .kpi-label { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 24px; font-weight: 700; color: var(--text); line-height: 1.1; }
    .kpi-value.hero { font-size: 30px; color: var(--accent); }

    table.brk { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.brk th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-3); border-bottom: 1px solid var(--border); }
    table.brk td { padding: 11px 12px; border-bottom: 1px solid var(--border); }
    table.brk td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    table.brk tr:last-child td { border-bottom: none; }
    .cat-badge { padding: 3px 8px; border-radius: 6px; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: 0.3px; color: var(--text-2); }

    .warn-box { padding: 12px 16px; border: 1px solid rgba(199,122,31,0.35); background: rgba(199,122,31,0.08); border-radius: 10px; color: var(--warning); font-size: 12.5px; margin-bottom: 18px; }
    .error-box { padding: 16px; border: 1px solid rgba(226,96,79,0.35); background: rgba(226,96,79,0.08); border-radius: 10px; color: var(--error); font-size: 13px; }

    .footer-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-top: 4px; }
    .footer-info { font-size: 12px; color: var(--text-2); }
    .btn-refresh { padding: 8px 14px; border-radius: 7px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; transition: opacity 0.15s; }
    .btn-refresh:hover { opacity: 0.9; }
    .btn-refresh[disabled] { opacity: 0.5; cursor: not-allowed; }
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
      <a class="nav-item" href="/admin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
        Admin
      </a>
      <a class="nav-item active" href="/admin/meta-readiness">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Meta Readiness
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
        <span class="workspace-name">Meta API Access Tier — Readiness</span>
      </div>
      <div class="topbar-right">
        <div class="avatar" id="top-avatar">?</div>
        <button class="btn-logout" id="btn-logout">Logout</button>
      </div>
    </header>

    <main class="content">
      <div class="page-title">Meta Marketing API — Readiness Checklist</div>
      <div class="page-subtitle">Two conditions gate the access-tier request: ≥ <span id="thr-calls">500</span> successful calls over 15 days, and &lt; <span id="thr-err">15</span>% error rate over the last 500 calls.</div>

      <div class="state-overlay" id="loading-state">
        <div class="spinner"></div>
        <span class="state-text">Loading readiness stats…</span>
      </div>

      <div id="error-state" style="display:none;">
        <div class="error-box" id="error-msg">An error occurred.</div>
      </div>

      <div id="content" style="display:none;">

        <div id="redis-warn" class="warn-box" style="display:none;">
          Redis is unavailable, so usage counters read as zero. These numbers are only meaningful once Redis is connected and Meta calls are flowing.
        </div>

        <!-- Verdict banner -->
        <div id="verdict" class="verdict verdict-notready">
          <div class="verdict-icon" id="verdict-icon">…</div>
          <div>
            <div class="verdict-title" id="verdict-title">Checking…</div>
            <div class="verdict-sub" id="verdict-sub"></div>
          </div>
        </div>

        <!-- Two gate cards -->
        <div class="card" style="margin-bottom:18px;">
          <div class="card-head">
            <div class="card-title">Gating Conditions</div>
            <div class="card-meta">Both must pass</div>
          </div>

          <!-- Gate 1: call volume -->
          <div class="gate">
            <div class="gate-check no" id="g1-check">✕</div>
            <div class="gate-body">
              <div class="gate-label">1 · Successful calls over the last 15 days</div>
              <div class="gate-detail">Meta requires at least <strong id="g1-threshold">500</strong> successful (2xx) Marketing API calls in the rolling 15-day window.</div>
              <div class="gate-value no" id="g1-value">—</div>
              <div class="bar"><div class="bar-fill no" id="g1-bar" style="width:0%"></div></div>
            </div>
          </div>

          <!-- Gate 2: error rate over last 500 -->
          <div class="gate">
            <div class="gate-check no" id="g2-check">✕</div>
            <div class="gate-body">
              <div class="gate-label">2 · Error rate over the last 500 calls</div>
              <div class="gate-detail">Must be below <strong id="g2-threshold">15</strong>%. Measured over the most recent <strong id="g2-window">500</strong> terminal responses; the full window must have filled before this gate can pass.</div>
              <div class="gate-value no" id="g2-value">—</div>
              <div class="gate-detail" id="g2-window-note" style="margin-top:6px;"></div>
            </div>
          </div>
        </div>

        <!-- Raw counters -->
        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <div class="card-title">Call Volume</div>
              <div class="card-meta">Rolling windows</div>
            </div>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Today</div><div class="kpi-value" id="c-today">—</div></div>
              <div class="kpi"><div class="kpi-label">Last 7 days</div><div class="kpi-value" id="c-7d">—</div></div>
              <div class="kpi"><div class="kpi-label">Last 15 days</div><div class="kpi-value hero" id="c-15d">—</div></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <div class="card-title">Errors</div>
              <div class="card-meta">Last 15 days &amp; last 500</div>
            </div>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Errors 15d</div><div class="kpi-value" id="e-15d">—</div></div>
              <div class="kpi"><div class="kpi-label">Err rate 15d</div><div class="kpi-value" id="e-rate15">—</div></div>
              <div class="kpi"><div class="kpi-label">Err rate / last 500</div><div class="kpi-value hero" id="e-rate500">—</div></div>
            </div>
          </div>
        </div>

        <!-- Error breakdown -->
        <div class="card" style="margin-bottom:18px;">
          <div class="card-head">
            <div class="card-title">Error Breakdown</div>
            <div class="card-meta">By failure type · last 15 days</div>
          </div>
          <div id="brk-empty" style="display:none;font-size:13px;color:var(--text-3);text-align:center;padding:18px 0;">
            No Meta errors recorded in the last 15 days.
          </div>
          <table class="brk" id="brk-table" style="display:none;">
            <thead>
              <tr>
                <th>Category</th>
                <th>Meaning</th>
                <th style="text-align:right;">Count</th>
              </tr>
            </thead>
            <tbody id="brk-tbody"></tbody>
          </table>
        </div>

        <div class="footer-bar">
          <div class="footer-info">Last updated <span id="updated-at">—</span></div>
          <button class="btn-refresh" id="btn-refresh">Refresh</button>
        </div>

      </div>
    </main>
  </div>
</div>

<script>
(function() {
  var CAT_META = {
    token:          'OAuth / token expired — reconnect needed',
    rate_limit:     'Throttling / quota (429)',
    permission:     'Missing scope or permission (403)',
    invalid_params: 'Invalid parameter / validation (400)',
    server:         'Meta-side failure (5xx)',
    other:          'Uncategorized'
  };
  var CAT_ORDER = ['token','rate_limit','permission','invalid_params','server','other'];

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
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toFixed(1) + '%';
  }
  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch (e) { return '—'; }
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
    return res.json();
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  function setGateCheck(el, ok) {
    el.textContent = ok ? '✓' : '✕';
    el.className = 'gate-check ' + (ok ? 'ok' : 'no');
  }

  function render(stats) {
    var counts = stats.counts;
    var threshold = stats.callThreshold;
    var gatePct = stats.errorRateGatePct;

    document.getElementById('thr-calls').textContent = String(threshold);
    document.getElementById('thr-err').textContent = String(gatePct);
    document.getElementById('g1-threshold').textContent = String(threshold);
    document.getElementById('g2-threshold').textContent = String(gatePct);
    document.getElementById('g2-window').textContent = '500';

    document.getElementById('redis-warn').style.display = stats.redisAvailable ? 'none' : 'block';

    // Gate 1 — call volume
    var g1ok = counts.meetsCallThreshold;
    setGateCheck(document.getElementById('g1-check'), g1ok);
    var g1val = document.getElementById('g1-value');
    g1val.textContent = fmtNumber(counts.last15Days) + ' / ' + fmtNumber(threshold);
    g1val.className = 'gate-value ' + (g1ok ? 'ok' : 'no');
    var pct = Math.min(100, counts.progressToThresholdPct);
    var g1bar = document.getElementById('g1-bar');
    g1bar.style.width = pct + '%';
    g1bar.className = 'bar-fill ' + (g1ok ? 'ok' : 'no');

    // Gate 2 — error rate over last 500
    var g2ok = counts.meetsErrorGate;
    setGateCheck(document.getElementById('g2-check'), g2ok);
    var g2val = document.getElementById('g2-value');
    g2val.textContent = fmtPct(counts.errorRateLast500);
    g2val.className = 'gate-value ' + (g2ok ? 'ok' : 'no');
    var note = document.getElementById('g2-window-note');
    if (counts.recentWindowSize < 500) {
      note.textContent = 'Window not yet full — ' + fmtNumber(counts.recentWindowSize) + ' of 500 calls recorded. The gate stays "not met" until 500 calls have accumulated.';
    } else {
      note.textContent = 'Window full (500 calls). ' + (g2ok ? 'Below the ' + gatePct + '% gate.' : 'At or above the ' + gatePct + '% gate.');
    }

    // Verdict
    var ready = g1ok && g2ok;
    var v = document.getElementById('verdict');
    v.className = 'verdict ' + (ready ? 'verdict-ready' : 'verdict-notready');
    document.getElementById('verdict-icon').textContent = ready ? '✓' : '!';
    document.getElementById('verdict-title').textContent = ready
      ? 'Ready to request the higher access tier'
      : 'Not ready yet';
    var pending = [];
    if (!g1ok) pending.push((threshold - counts.last15Days) + ' more successful calls needed');
    if (!g2ok) {
      if (counts.recentWindowSize < 500) pending.push((500 - counts.recentWindowSize) + ' more calls to fill the error-rate window');
      else pending.push('error rate must drop below ' + gatePct + '%');
    }
    document.getElementById('verdict-sub').textContent = ready
      ? 'Both gating conditions are met. Make sure the Privacy Policy and Data Deletion URLs are also set in the Meta app before submitting.'
      : pending.join(' · ');

    // Raw counters
    document.getElementById('c-today').textContent = fmtNumber(counts.today);
    document.getElementById('c-7d').textContent = fmtNumber(counts.last7Days);
    document.getElementById('c-15d').textContent = fmtNumber(counts.last15Days);
    document.getElementById('e-15d').textContent = fmtNumber(counts.errorsLast15Days);
    document.getElementById('e-rate15').textContent = fmtPct(counts.errorRatePct15d);
    document.getElementById('e-rate500').textContent = fmtPct(counts.errorRateLast500);

    // Error breakdown
    var brk = stats.errorBreakdown15d || {};
    var rows = CAT_ORDER.filter(function(c) { return (brk[c] || 0) > 0; });
    var tableEl = document.getElementById('brk-table');
    var emptyEl = document.getElementById('brk-empty');
    var tbody = document.getElementById('brk-tbody');
    if (rows.length === 0) {
      tableEl.style.display = 'none';
      emptyEl.style.display = 'block';
    } else {
      emptyEl.style.display = 'none';
      tableEl.style.display = 'table';
      tbody.innerHTML = rows.map(function(c) {
        return ''
          + '<tr>'
          +   '<td><span class="cat-badge">' + escHtml(c) + '</span></td>'
          +   '<td style="color:var(--text-2);">' + escHtml(CAT_META[c] || '') + '</td>'
          +   '<td class="num">' + fmtNumber(brk[c]) + '</td>'
          + '</tr>';
      }).join('');
    }

    document.getElementById('updated-at').textContent = stats.latest && stats.latest.lastUpdated
      ? fmtDateTime(stats.latest.lastUpdated)
      : 'no data yet';
  }

  async function loadStats() {
    var stats = await apiFetch('/api/admin/meta-usage');
    render(stats);
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  }

  async function refresh(btn) {
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Refreshing…';
    try { await loadStats(); }
    catch (err) { showError('Refresh failed: ' + (err.message || String(err))); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }

  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-refresh').addEventListener('click', function(e) { refresh(e.currentTarget); });

    try {
      var me = await apiFetch('/api/auth/me');
      // Server-side gating on /api/admin/meta-usage is the real boundary — this
      // is only a friendly UI guard so non-admins see a clear message.
      if (!me.isPlatformAdmin) {
        window.location.href = '/dashboard';
        return;
      }
      var userName = me.name || me.email || 'Admin';
      document.getElementById('sidebar-avatar').textContent = initials(userName);
      document.getElementById('top-avatar').textContent = initials(userName);
      document.getElementById('sidebar-name').textContent = userName;

      await loadStats();
    } catch (err) {
      showError('Failed to load readiness stats: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>
</body>
</html>`;
}
