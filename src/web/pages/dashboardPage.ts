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

    /* ── V2 Decision Interface ──────────────────────────────────────────── */
    .v2-section { margin-bottom: 24px; }
    .v2-section-head {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 12px;
    }
    .v2-section-title {
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--text-3);
    }
    .v2-section-meta { font-size: 12px; color: var(--text-3); }

    /* AccountHealth large card */
    .v2-health-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px 24px;
      display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .v2-health-score-block { display: flex; align-items: center; gap: 16px; }
    .v2-health-verdict {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      padding: 3px 10px; border-radius: 6px;
    }
    .v2-verdict-excellent { background: rgba(34,197,94,0.15); color: var(--success); }
    .v2-verdict-good { background: rgba(34,197,94,0.12); color: var(--success); }
    .v2-verdict-needs-attention { background: rgba(245,158,11,0.15); color: var(--warning); }
    .v2-verdict-critical { background: rgba(239,68,68,0.15); color: var(--error); }
    .v2-health-big { font-size: 36px; font-weight: 800; color: var(--text); line-height: 1; letter-spacing: -1px; }
    .v2-health-big small { font-size: 16px; color: var(--text-3); font-weight: 500; }
    .v2-health-issues { font-size: 13px; color: var(--text-2); margin-top: 4px; }
    .v2-health-divider { width: 1px; align-self: stretch; background: var(--border); margin: 0 6px; }

    /* Today's Actions */
    .v2-actions {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 6px 4px;
    }
    .v2-action-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
    }
    .v2-action-row:last-child { border-bottom: none; }
    .v2-action-priority {
      width: 28px; height: 28px; border-radius: 8px;
      background: var(--surface-2); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800; color: var(--text-2); flex-shrink: 0;
    }
    .v2-action-row[data-pri="1"] .v2-action-priority { background: rgba(99,102,241,0.18); color: var(--accent); border-color: rgba(99,102,241,0.35); }
    .v2-action-body { flex: 1; min-width: 0; }
    .v2-action-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
    .v2-action-decision { font-size: 12.5px; color: var(--text-2); }
    .v2-action-meta { display: flex; gap: 16px; font-size: 11.5px; color: var(--text-3); margin-top: 6px; flex-wrap: wrap; }
    .v2-action-meta b { color: var(--text-2); font-weight: 600; }
    .v2-action-meta .ok { color: var(--success); font-weight: 700; }
    .v2-action-btn {
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--accent); color: #fff;
      font-size: 12.5px; font-weight: 600;
      flex-shrink: 0;
    }
    .v2-action-btn:hover { filter: brightness(1.1); }
    .v2-action-empty { padding: 30px 18px; text-align: center; color: var(--text-3); font-size: 13px; }

    /* Recovery Center */
    .v2-recovery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 14px;
    }
    .v2-recovery-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
    }
    .v2-recovery-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px; }
    .v2-recovery-name { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .v2-recovery-conf { font-size: 11px; color: var(--text-3); margin-top: 2px; }
    .v2-recovery-steps { display: flex; flex-direction: column; gap: 6px; }
    .v2-recovery-step {
      display: flex; align-items: center; gap: 8px;
      font-size: 12.5px; color: var(--text-2);
      padding: 6px 8px; border-radius: 6px;
      background: var(--surface-2);
    }
    .v2-recovery-step b { color: var(--text); font-weight: 600; }
    .v2-recovery-step .gain { color: var(--success); font-weight: 700; font-size: 11.5px; }

    /* Winner + Opportunity grid */
    .v2-spotlight-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 800px) { .v2-spotlight-grid { grid-template-columns: 1fr; } }
    .v2-spotlight {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .v2-spotlight-tag {
      font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--text-3);
    }
    .v2-winner .v2-spotlight-tag { color: var(--success); }
    .v2-opportunity .v2-spotlight-tag { color: var(--accent); }
    .v2-spotlight-name { font-size: 16px; font-weight: 700; color: var(--text); }
    .v2-spotlight-reason { font-size: 12.5px; color: var(--text-2); }
    .v2-spotlight-stat { display: flex; gap: 18px; font-size: 12px; color: var(--text-3); }
    .v2-spotlight-stat b { color: var(--text); font-weight: 700; }
    .v2-spotlight-btn {
      align-self: flex-start;
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text); font-size: 12.5px; font-weight: 600;
    }
    .v2-winner .v2-spotlight-btn { background: var(--success); color: #04190b; border-color: transparent; }
    .v2-opportunity .v2-spotlight-btn { background: var(--accent); color: #fff; border-color: transparent; }
    .v2-spotlight-empty { font-size: 12.5px; color: var(--text-3); padding: 6px 0; }

    /* AI Insights */
    .v2-insights {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .v2-insight {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .v2-insight-icon { font-size: 18px; margin-bottom: 6px; }
    .v2-insight-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .v2-insight-text { font-size: 12px; color: var(--text-2); line-height: 1.5; }

    /* Advanced Analytics accordion */
    .v2-advanced { margin-top: 8px; }
    .v2-advanced summary {
      cursor: pointer;
      list-style: none;
      padding: 14px 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; font-weight: 600; color: var(--text);
    }
    .v2-advanced summary::-webkit-details-marker { display: none; }
    .v2-advanced summary::after { content: '▾'; color: var(--text-3); transition: transform 0.2s; }
    .v2-advanced[open] summary::after { transform: rotate(180deg); }
    .v2-advanced summary span { color: var(--text-3); font-weight: 500; font-size: 12px; }
    .v2-advanced-body { padding: 20px 0 0; }

    /* Mobile */
    @media (max-width: 700px) {
      .content { padding: 16px; }
      .v2-action-row { flex-wrap: wrap; }
      .v2-action-btn { width: 100%; text-align: center; margin-top: 6px; }
      .v2-health-card { padding: 18px; }
      .v2-health-big { font-size: 28px; }
    }
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

        <!-- Stale data banner (shown when ad account token is expired/paused) -->
        <div id="stale-data-banner" style="display:none;margin-bottom:16px;padding:12px 16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:10px;display:none;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:16px;">⚠</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--warning);">Showing cached data — token expired</div>
              <div style="font-size:12px;color:var(--text-2);margin-top:2px;">Your Meta Ads access token has expired. These metrics are from your last successful sync and may be outdated.</div>
            </div>
          </div>
          <a href="/workspace" style="padding:6px 14px;border-radius:7px;background:var(--warning);color:#000;font-size:12px;font-weight:600;white-space:nowrap;text-decoration:none;">Reconnect Account</a>
        </div>

        <!-- ═════════════════════════════════════════════════════════════
             V6 BRAIN — three Strangler-Fig sections (rendered ABOVE V5).
             Hidden until /api/dashboard returns a brain payload. Polling
             refreshes only Live Pulse numerics every 60s.
             ═════════════════════════════════════════════════════════════ -->
        <section id="brain-cmo-feed-section" class="v2-section" style="display:none;margin-bottom:18px;">
          <div class="v2-section-head">
            <div class="v2-section-title">CMO Feed</div>
            <div class="v2-section-meta" id="brain-cmo-feed-meta">AI-narrated decisions for today</div>
          </div>
          <div id="brain-cmo-feed" style="display:flex;flex-direction:column;gap:10px;"></div>
        </section>

        <section id="brain-pulse-section" class="v2-section" style="display:none;margin-bottom:18px;">
          <div class="v2-section-head">
            <div class="v2-section-title">Live Pulse</div>
            <div class="v2-section-meta">Auto-refreshes every 60s · <span id="brain-pulse-tick">—</span></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
            <div style="padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
              <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;">Burn Rate</div>
              <div id="brain-pulse-burn" style="font-size:22px;font-weight:700;color:var(--text);margin-top:6px;">—</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;"><span id="brain-pulse-burn-n">0</span> campaigns</div>
            </div>
            <div style="padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
              <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;">Intra-day Spend</div>
              <div id="brain-pulse-spendpct" style="font-size:22px;font-weight:700;color:var(--text);margin-top:6px;">—</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;">of total daily budget</div>
            </div>
            <div style="padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
              <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;">DNA Match</div>
              <div id="brain-pulse-dna" style="font-size:22px;font-weight:700;color:var(--text);margin-top:6px;">—</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;">vs gold-standard winners</div>
            </div>
          </div>
        </section>

        <section id="brain-ledger-section" class="v2-section" style="display:none;margin-bottom:18px;">
          <div class="v2-section-head">
            <div class="v2-section-title">Interventions Ledger</div>
            <div class="v2-section-meta">Last 7 days</div>
          </div>
          <div style="padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);margin-bottom:12px;">
            <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;">Estimated wasted spend prevented</div>
            <div id="brain-ledger-saved" style="font-size:28px;font-weight:800;color:var(--success,#22c55e);margin-top:6px;">—</div>
          </div>
          <div id="brain-ledger-list" style="display:flex;flex-direction:column;gap:6px;"></div>
        </section>

        <!-- V2 §1 — Account Health -->
        <div class="v2-health-card" id="v2-health">
          <div class="v2-health-score-block">
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
            <div>
              <div class="v2-health-verdict v2-verdict-good" id="v2-health-verdict">Good</div>
              <div class="v2-health-big" id="v2-health-big">— <small>/ 100</small></div>
              <div class="v2-health-issues" id="v2-health-issues">Analyzing your account…</div>
            </div>
          </div>
        </div>

        <!-- V2 §2 — Today's Actions (HIGHEST PRIORITY) -->
        <section class="v2-section">
          <div class="v2-section-head">
            <div class="v2-section-title">Today's Actions</div>
            <div class="v2-section-meta" id="v2-actions-meta">Top decisions for the next 24h</div>
          </div>
          <div class="v2-actions" id="v2-actions">
            <div class="v2-action-empty">Loading actions…</div>
          </div>
        </section>

        <!-- V2 §3 — Recovery Center -->
        <section class="v2-section" id="v2-recovery-section" style="display:none;">
          <div class="v2-section-head">
            <div class="v2-section-title">Recovery Center</div>
            <div class="v2-section-meta">Solutions, not warnings</div>
          </div>
          <div class="v2-recovery-grid" id="v2-recovery"></div>
        </section>

        <!-- V2 §4–5 — Winner + Opportunity -->
        <section class="v2-section">
          <div class="v2-spotlight-grid" id="v2-spotlight"></div>
        </section>

        <!-- V2 §6 — AI Insights -->
        <section class="v2-section" id="v2-insights-section" style="display:none;">
          <div class="v2-section-head">
            <div class="v2-section-title">AI Insights</div>
            <div class="v2-section-meta">Pattern observations</div>
          </div>
          <div class="v2-insights" id="v2-insights"></div>
        </section>

        <!-- V2 §7 — Advanced Analytics (collapsed) -->
        <details class="v2-advanced">
          <summary>
            Advanced Analytics
            <span>Charts · KPIs · Issues · Campaigns</span>
          </summary>
          <div class="v2-advanced-body">
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

            <!-- Issues + Campaigns -->
            <div class="bottom-grid">
              <div class="section-card">
                <div class="section-header">
                  <div class="section-title">Issues &amp; Alerts</div>
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
        </details>
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

  // ── V2 Decision Interface ─────────────────────────────────────────────────
  function severityToVerdict(s) {
    s = (s || 'good').toLowerCase();
    if (s === 'critical') return { cls: 'v2-verdict-critical', text: 'Critical' };
    if (s === 'high' || s === 'needs_attention') return { cls: 'v2-verdict-needs-attention', text: 'Needs Attention' };
    if (s === 'excellent') return { cls: 'v2-verdict-excellent', text: 'Excellent' };
    return { cls: 'v2-verdict-good', text: 'Good' };
  }
  function scoreToVerdict(score, band) {
    var s = Number(score) || 0;
    if (s >= 85) return { cls: 'v2-verdict-excellent', text: 'Excellent' };
    if (s >= 70) return { cls: 'v2-verdict-good', text: 'Good' };
    if (s >= 50) return { cls: 'v2-verdict-needs-attention', text: 'Needs Attention' };
    return { cls: 'v2-verdict-critical', text: 'Critical' };
  }

  function renderV2Health(health, issuesCount, oppsCount) {
    var s = Number(health && health.score) || 0;
    var v = scoreToVerdict(s, health && health.band);
    var ring = document.getElementById('health-ring-fg');
    var circumference = 2 * Math.PI * 22;
    var offset = circumference - (s / 100) * circumference;
    var color = s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--accent)' : s >= 40 ? 'var(--warning)' : 'var(--error)';
    ring.style.stroke = color;
    ring.style.strokeDashoffset = String(offset);
    document.getElementById('health-score-label').textContent = String(s);

    var verdictEl = document.getElementById('v2-health-verdict');
    verdictEl.textContent = v.text;
    verdictEl.className = 'v2-health-verdict ' + v.cls;

    document.getElementById('v2-health-big').innerHTML = s + ' <small>/ 100</small>';
    var parts = [];
    if (issuesCount > 0) parts.push(issuesCount + ' issue' + (issuesCount === 1 ? '' : 's') + ' detected');
    if (oppsCount > 0) parts.push(oppsCount + ' opportunit' + (oppsCount === 1 ? 'y' : 'ies') + ' found');
    if (parts.length === 0) parts.push('No issues detected');
    document.getElementById('v2-health-issues').textContent = parts.join(' · ');
  }

  // Map a backend issue → an actionable card
  function issueToAction(issue, priority) {
    var sev = (issue.severity || 'medium').toLowerCase();
    var rec = Array.isArray(issue.recommendations) ? issue.recommendations[0] : issue.recommendations;
    return {
      priority: priority,
      title: issue.title || issue.code || 'Action needed',
      decision: rec || 'Review and resolve',
      confidence: issue.confidence || (sev === 'critical' ? 92 : sev === 'high' ? 86 : 78),
      expectedImpact: issue.expectedImpact || (sev === 'critical' ? 'High' : sev === 'high' ? 'Medium-High' : 'Medium'),
      risk: sev === 'critical' ? 'low' : sev === 'high' ? 'low' : 'medium',
      buttonText: sev === 'critical' ? 'Fix Now' : 'Review',
    };
  }

  function renderTodayActions(actions) {
    var el = document.getElementById('v2-actions');
    if (!actions || actions.length === 0) {
      el.innerHTML = '<div class="v2-action-empty">No actions for today. Account is steady.</div>';
      document.getElementById('v2-actions-meta').textContent = 'All clear';
      return;
    }
    var top3 = actions.slice(0, 3);
    document.getElementById('v2-actions-meta').textContent =
      top3.length + ' decision' + (top3.length === 1 ? '' : 's') + ' for the next 24h';
    el.innerHTML = top3.map(function (a) {
      return '<div class="v2-action-row" data-pri="' + a.priority + '">'
        + '<div class="v2-action-priority">#' + a.priority + '</div>'
        + '<div class="v2-action-body">'
          + '<div class="v2-action-title">' + escHtml(a.title) + '</div>'
          + '<div class="v2-action-decision">' + escHtml(a.decision) + '</div>'
          + '<div class="v2-action-meta">'
            + '<span>Expected impact: <b>' + escHtml(a.expectedImpact) + '</b></span>'
            + '<span>Confidence: <b>' + escHtml(String(a.confidence)) + '%</b></span>'
            + '<span>Risk: <b class="' + (a.risk === 'low' ? 'ok' : '') + '">' + escHtml(a.risk) + '</b></span>'
          + '</div>'
        + '</div>'
        + '<button class="v2-action-btn" type="button">' + escHtml(a.buttonText) + '</button>'
      + '</div>';
    }).join('');
  }

  function issueToRecovery(issue) {
    var recs = Array.isArray(issue.recommendations)
      ? issue.recommendations
      : (issue.recommendations ? [issue.recommendations] : []);
    if (recs.length === 0) recs = ['Review affected campaigns', 'Adjust budget or creative', 'Pause if degradation continues'];
    return {
      patternName: issue.title || issue.code || 'Detected pattern',
      severity: (issue.severity || 'medium').toLowerCase(),
      confidence: issue.confidence || 85,
      steps: recs.slice(0, 4),
    };
  }

  function renderRecoveryCenter(plans) {
    var sec = document.getElementById('v2-recovery-section');
    var grid = document.getElementById('v2-recovery');
    if (!plans || plans.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    grid.innerHTML = plans.map(function (p) {
      var v = severityToVerdict(p.severity);
      return '<div class="v2-recovery-card">'
        + '<div class="v2-recovery-top">'
          + '<div>'
            + '<div class="v2-recovery-name">' + escHtml(p.patternName) + '</div>'
            + '<div class="v2-recovery-conf">Confidence ' + escHtml(String(p.confidence)) + '%</div>'
          + '</div>'
          + '<span class="v2-health-verdict ' + v.cls + '">' + escHtml(v.text) + '</span>'
        + '</div>'
        + '<div class="v2-recovery-steps">'
          + p.steps.map(function (step, i) {
              return '<div class="v2-recovery-step"><b>' + (i + 1) + '.</b> ' + escHtml(step) + '</div>';
            }).join('')
        + '</div>'
      + '</div>';
    }).join('');
  }

  function renderSpotlight(winner, opportunity) {
    var el = document.getElementById('v2-spotlight');
    var parts = [];
    if (winner) {
      var reason = winner.reason || ('Top performer · ' + (winner.objective || 'this period'));
      var conf = winner.confidence || 90;
      var score = winner.score != null ? winner.score : '—';
      parts.push(
        '<div class="v2-spotlight v2-winner">'
          + '<div class="v2-spotlight-tag">Best Campaign</div>'
          + '<div class="v2-spotlight-name">' + escHtml(winner.name || winner.campaignName || '—') + '</div>'
          + '<div class="v2-spotlight-reason">' + escHtml(reason) + '</div>'
          + '<div class="v2-spotlight-stat">'
            + '<span>Score <b>' + escHtml(String(score)) + '</b></span>'
            + '<span>Confidence <b>' + escHtml(String(conf)) + '%</b></span>'
          + '</div>'
          + '<button class="v2-spotlight-btn" type="button">Scale Safely</button>'
        + '</div>'
      );
    } else {
      parts.push(
        '<div class="v2-spotlight v2-winner">'
          + '<div class="v2-spotlight-tag">Best Campaign</div>'
          + '<div class="v2-spotlight-empty">No clear winner yet — let campaigns gather more data.</div>'
        + '</div>'
      );
    }
    if (opportunity) {
      parts.push(
        '<div class="v2-spotlight v2-opportunity">'
          + '<div class="v2-spotlight-tag">Opportunity</div>'
          + '<div class="v2-spotlight-name">' + escHtml(opportunity.title) + '</div>'
          + '<div class="v2-spotlight-reason">' + escHtml(opportunity.reason || '') + '</div>'
          + '<div class="v2-spotlight-stat">'
            + '<span>Expected gain <b>' + escHtml(opportunity.expectedGain || '+0%') + '</b></span>'
            + '<span>Confidence <b>' + escHtml(String(opportunity.confidence || 80)) + '%</b></span>'
          + '</div>'
          + '<button class="v2-spotlight-btn" type="button">Explore</button>'
        + '</div>'
      );
    } else {
      parts.push(
        '<div class="v2-spotlight v2-opportunity">'
          + '<div class="v2-spotlight-tag">Opportunity</div>'
          + '<div class="v2-spotlight-empty">No new opportunity detected today.</div>'
        + '</div>'
      );
    }
    el.innerHTML = parts.join('');
  }

  function renderInsights(insights) {
    var sec = document.getElementById('v2-insights-section');
    var el = document.getElementById('v2-insights');
    if (!insights || insights.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    el.innerHTML = insights.map(function (i) {
      return '<div class="v2-insight">'
        + '<div class="v2-insight-icon">' + (i.icon || '◆') + '</div>'
        + '<div class="v2-insight-title">' + escHtml(i.title) + '</div>'
        + '<div class="v2-insight-text">' + escHtml(i.text) + '</div>'
      + '</div>';
    }).join('');
  }

  // Derive a few static insights from the dashboard payload
  function buildInsights(dashData, kpis) {
    var out = [];
    if (dashData.priorityAction) {
      var paText = typeof dashData.priorityAction === 'string'
        ? dashData.priorityAction
        : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
      if (paText) out.push({ icon: '⚡', title: 'Priority focus', text: paText });
    }
    function findKpi(key) { return (kpis || []).find(function (k) { return (k.key || '').toLowerCase() === key; }); }
    var ctr = findKpi('ctr');
    if (ctr && ctr.deltaPct != null) {
      var up = ctr.direction === 'up';
      out.push({
        icon: up ? '↑' : '↓',
        title: 'CTR ' + (up ? 'improving' : 'softening'),
        text: 'Click-through rate moved ' + (up ? '+' : '-') + Math.abs(Number(ctr.deltaPct)).toFixed(1) + '% vs prior period.',
      });
    }
    var spend = findKpi('spend');
    if (spend && spend.deltaPct != null) {
      out.push({
        icon: '$',
        title: 'Spend trend',
        text: 'Total spend changed ' + (spend.direction === 'up' ? '+' : '-') + Math.abs(Number(spend.deltaPct)).toFixed(1) + '% vs prior period.',
      });
    }
    return out;
  }

  // Build top-3 actions from priorityAction + issues
  function buildTodayActions(dashData) {
    var actions = [];
    if (dashData.priorityAction) {
      var paText = typeof dashData.priorityAction === 'string'
        ? dashData.priorityAction
        : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
      if (paText) {
        actions.push({
          priority: 1,
          title: 'Priority Action',
          decision: paText,
          confidence: 92,
          expectedImpact: 'High',
          risk: 'low',
          buttonText: 'Act',
        });
      }
    }
    var issues = Array.isArray(dashData.issues) ? dashData.issues.slice() : [];
    issues.sort(function (a, b) {
      var order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[(a.severity || 'low').toLowerCase()] || 9) - (order[(b.severity || 'low').toLowerCase()] || 9);
    });
    for (var i = 0; i < issues.length && actions.length < 3; i++) {
      actions.push(issueToAction(issues[i], actions.length + 1));
    }
    return actions;
  }

  // Build recovery plans from issues
  function buildRecoveryPlans(issues) {
    if (!Array.isArray(issues)) return [];
    return issues.slice(0, 6).map(issueToRecovery);
  }

  // Derive opportunity from data if backend doesn't supply one
  function deriveOpportunity(dashData) {
    if (dashData.opportunity) return dashData.opportunity;
    if (dashData.bestCampaign) {
      return {
        title: 'Audience Expansion',
        reason: 'Top campaign performing well — broaden audience to scale safely.',
        expectedGain: '+12 messages/day',
        confidence: 85,
      };
    }
    return null;
  }

  // ── V6 Brain section renderers ───────────────────────────────────────────
  // Strangler Fig: when brain is absent from the dashboard DTO the three V6
  // sections stay hidden and V5 below is the only thing the user sees.
  function priorityClass(p) {
    if (p === 'CRITICAL') return 'v2-verdict-poor';
    if (p === 'HIGH') return 'v2-verdict-attention';
    return 'v2-verdict-good';
  }

  function renderBrainSection(brain) {
    if (!brain) return;
    // ── CMO Feed ──
    var feedHost = document.getElementById('brain-cmo-feed');
    var feedSection = document.getElementById('brain-cmo-feed-section');
    var meta = document.getElementById('brain-cmo-feed-meta');
    var items = (brain.cmoFeed || []);
    if (items.length === 0) {
      feedHost.innerHTML = '<div class="v2-action-empty">No active decisions today.</div>';
    } else {
      feedHost.innerHTML = items.map(function(it) {
        var hasNarration = !!it.narration;
        var title = hasNarration ? escHtml(it.narration.arabicTitle) : escHtml(it.campaignName);
        var body = hasNarration
          ? escHtml(it.narration.arabicNarration)
          : 'AI summary pending — action recommended: ' + escHtml(it.action);
        var dir = (it.narration && it.narration.creativeDirective)
          ? '<div style="margin-top:6px;font-size:12px;color:var(--text-3);"><strong>Creative directive:</strong> ' + escHtml(it.narration.creativeDirective) + '</div>'
          : '';
        return ''
          + '<div style="padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);">'
          +   '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
          +     '<span class="v2-health-verdict ' + priorityClass(it.priority) + '" style="font-size:11px;padding:2px 8px;">' + escHtml(it.priority) + '</span>'
          +     '<span style="font-size:13px;color:var(--text-3);">' + escHtml(it.campaignName) + ' · ' + escHtml(it.tickDate) + '</span>'
          +   '</div>'
          +   '<div style="font-size:15px;font-weight:600;color:var(--text);">' + title + '</div>'
          +   '<div style="font-size:13px;color:var(--text-2);margin-top:4px;line-height:1.5;">' + body + '</div>'
          +   dir
          + '</div>';
      }).join('');
    }
    meta.textContent = items.length + ' decision' + (items.length === 1 ? '' : 's') + ' for today';
    feedSection.style.display = 'block';

    // ── Live Pulse — initial render from full DTO; polling refreshes it ──
    applyPulse(brain.livePulse);
    document.getElementById('brain-pulse-section').style.display = 'block';

    // ── Interventions Ledger ──
    var ledger = brain.ledger;
    if (ledger) {
      document.getElementById('brain-ledger-saved').textContent = ledger.savedSpendDisplay || '—';
      var list = document.getElementById('brain-ledger-list');
      var rows = ledger.recentActions || [];
      if (rows.length === 0) {
        list.innerHTML = '<div class="v2-action-empty">No interventions in the last 7 days.</div>';
      } else {
        list.innerHTML = rows.map(function(r) {
          return ''
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);">'
            +   '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
            +     '<span class="v2-health-verdict ' + priorityClass(r.priority) + '" style="font-size:11px;padding:2px 8px;flex-shrink:0;">' + escHtml(r.priority) + '</span>'
            +     '<span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(r.campaignName) + '</span>'
            +   '</div>'
            +   '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">'
            +     '<span style="font-size:12px;color:var(--text-2);font-weight:600;">' + escHtml(r.action) + '</span>'
            +     '<span style="font-size:11px;color:var(--text-3);">' + escHtml(r.tickDate) + '</span>'
            +   '</div>'
            + '</div>';
        }).join('');
      }
      document.getElementById('brain-ledger-section').style.display = 'block';
    }
  }

  function applyPulse(pulse) {
    if (!pulse) return;
    document.getElementById('brain-pulse-burn').textContent = pulse.burnRateDisplay || '—';
    document.getElementById('brain-pulse-burn-n').textContent = String(pulse.campaignsObserved || 0);
    document.getElementById('brain-pulse-spendpct').textContent = (pulse.intraDaySpendPct !== null && pulse.intraDaySpendPct !== undefined)
      ? pulse.intraDaySpendPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-dna').textContent = (pulse.dnaMatchPct !== null && pulse.dnaMatchPct !== undefined)
      ? pulse.dnaMatchPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-tick').textContent = pulse.tickDate || 'no tick yet today';
  }

  function startPulsePolling(workspaceId) {
    var POLL_MS = 60000;
    async function tick() {
      try {
        var r = await apiFetch('/api/dashboard/pulse/' + workspaceId);
        if (r && !r.empty) applyPulse(r);
      } catch (e) {
        // Silent — polling failures shouldn't disrupt the rest of the page.
      }
    }
    setInterval(tick, POLL_MS);
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

      // Step 3: fetch dashboard + insights + campaigns + workspace status in parallel
      var [dashData, insights, campaigns, wsData] = await Promise.all([
        apiFetch('/api/dashboard/' + workspaceId),
        apiFetch('/api/workspaces/' + workspaceId + '/insights?days=30'),
        apiFetch('/api/workspaces/' + workspaceId + '/campaigns').catch(function() { return []; }),
        apiFetch('/api/workspaces/' + workspaceId).catch(function() { return null; }),
      ]);

      // Show stale-data banner if all ad accounts are paused / token expired
      var allPaused = wsData && Array.isArray(wsData.adAccounts)
        && wsData.adAccounts.length > 0
        && wsData.adAccounts.every(function(a) { return a.status !== 'ACTIVE'; });
      if (allPaused) {
        var banner = document.getElementById('stale-data-banner');
        if (banner) banner.style.display = 'flex';
      }

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

      // V6 Brain — three Strangler-Fig sections. Hidden when DTO has no brain.
      if (dashData.brain) {
        renderBrainSection(dashData.brain);
        startPulsePolling(workspaceId);
      }

      // V2 §1 — Health (replaces legacy renderHealth; ring still updated inside)
      var issuesCount = Array.isArray(dashData.issues) ? dashData.issues.length : 0;
      var oppCount = deriveOpportunity(dashData) ? 1 : 0;
      renderV2Health(dashData.health || { score: 0 }, issuesCount, oppCount);

      // V2 §2 — Today's Actions (top 3 derived from priorityAction + issues)
      var todayActions = buildTodayActions(dashData);
      renderTodayActions(todayActions);

      // V2 §3 — Recovery Center (one card per issue)
      renderRecoveryCenter(buildRecoveryPlans(dashData.issues));

      // V2 §4–5 — Winner + Opportunity
      renderSpotlight(dashData.bestCampaign, deriveOpportunity(dashData));

      // KPIs — prefer dashboard KPIs, fallback to insights
      var kpis = (dashData.kpis && dashData.kpis.length > 0)
        ? dashData.kpis
        : buildKpisFromInsights(insights || []);
      renderKpis(kpis);

      // V2 §6 — AI Insights (derived from KPIs + priorityAction)
      renderInsights(buildInsights(dashData, kpis));

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
