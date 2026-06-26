// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboardPage.ts
//
//  Dashboard — the premium overview. Shell is provided by layout(); this
//  file owns ONLY the page-specific markup and client logic.
//
//  Sections (top → bottom):
//    1. Financial Health row    — 30d / 7d / Lifetime (90d window) spend
//    2. AI Motion Ticker        — marquee feeding off brain.cmoFeed + issues
//    3. Active Ads Showcase     — green-blink grid of currently-spending campaigns
//    4. Split panel             — AI Brain Box (left) + Spend chart (right)
//    5. V6 Brain detail         — CMO Feed, Live Pulse, Interventions Ledger
//    6. V2 Decision interface   — Today's Actions, Recovery, Spotlight, Insights
//    7. Advanced Analytics      — collapsed KPI grid, charts, issues, campaigns
//
//  Data-binding contract (verified against schema + server.ts):
//    /api/dashboard/:wsId                       → brain, health, issues, kpis, ...
//    /api/workspaces/:wsId/insights?days=90     → DailyStat[] (DESC, spend BigInt MINOR)
//    /api/workspaces/:wsId/campaigns            → Campaign[] (budgets BigInt MINOR)
//    /api/workspaces/:wsId                      → adAccounts[currency, currencyMinorFactor]
//    /api/dashboard/pulse/:wsId  (polled 60s)   → Live Pulse tick
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function dashboardPage(): string {
  const extraHead = `<style>
    body.theme-light .page-content { padding: 24px 28px 48px; max-width: 1280px; }

    /* Ad Account / KPI cards — "My Cards" style */
    .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    @media (max-width: 1100px) { .hero-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 520px)  { .hero-grid { grid-template-columns: 1fr; } }
    .hero-card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px 22px;
      overflow: hidden;
      transition: box-shadow var(--transition), border-color var(--transition);
    }
    .hero-card:hover { box-shadow: var(--shadow-lg); border-color: var(--border-2); }
    .hero-card::after {
      content: ''; position: absolute; top: 0; right: 0;
      width: 80px; height: 80px; border-radius: 50%;
      opacity: 0.12; pointer-events: none;
      background: linear-gradient(135deg, #6366f1, #818cf8);
      transform: translate(30%, -30%);
    }
    .hero-card.accent-1::after { background: linear-gradient(135deg, #6366f1, #818cf8); }
    .hero-card.accent-2::after { background: linear-gradient(135deg, #3b82f6, #60a5fa); }
    .hero-card.accent-3::after { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
    .hero-card.success::after { background: linear-gradient(135deg, #16a34a, #4ade80); opacity: 0.15; }
    .hero-card.warning::after { background: linear-gradient(135deg, #d97706, #fbbf24); opacity: 0.15; }
    .hero-label { font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    .hero-value { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.8px; line-height: 1.1; }
    .hero-sub   { font-size: 12px; color: var(--text-2); margin-top: 4px; }
    .hero-delta {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px; font-weight: 700;
    }
    .hero-delta.up   { color: var(--success); background: var(--success-dim); }
    .hero-delta.down { color: var(--error);   background: var(--error-dim); }
    .hero-delta.flat { color: var(--text-3);  background: var(--surface-2); }

    /* Main layout — chart + list | right widgets */
    .dash-layout {
      display: grid; grid-template-columns: 1fr 300px; gap: 20px; margin-bottom: 24px;
    }
    @media (max-width: 960px) { .dash-layout { grid-template-columns: 1fr; } }
    .dash-main-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

    /* AI Motion Ticker — marquee */
    .ticker-wrap {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 10px 0;
      margin-bottom: 22px;
      overflow: hidden;
      mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
    }
    .ticker-wrap::before {
      content: 'AI · LIVE'; position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
      color: var(--accent-2);
      background: var(--accent-dim);
      padding: 3px 8px; border-radius: 4px;
      z-index: 2;
    }
    .ticker-track {
      display: inline-flex; gap: 38px;
      padding-left: 80px;
      white-space: nowrap;
      animation: ticker-slide 55s linear infinite;
    }
    .ticker-item { font-size: 13px; color: var(--text); display: inline-flex; align-items: center; gap: 8px; }
    .ticker-dot  { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .ticker-dot.success  { background: var(--success); }
    .ticker-dot.warning  { background: var(--warning); }
    .ticker-dot.critical { background: var(--error); }
    .ticker-layer { font-size: 11px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
    @keyframes ticker-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    .ticker-wrap:hover .ticker-track { animation-play-state: paused; }

    /* Active Ads Showcase Grid */
    .active-section { margin-bottom: 24px; }
    .active-header {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 12px;
    }
    .active-title { font-size: 13px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.08em; }
    .active-meta  { font-size: 12px; color: var(--text-3); }
    .active-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .active-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 14px 16px;
      display: flex; flex-direction: column; gap: 6px;
      transition: border-color var(--transition);
    }
    .active-card:hover { border-color: var(--accent); }
    .active-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .blink-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 0 0 rgba(34,197,94,0.5);
      animation: blink-pulse 1.6s infinite;
      flex-shrink: 0;
    }
    @keyframes blink-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
      70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
      100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    }
    .active-name { font-size: 13.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .active-meta-row { font-size: 12px; color: var(--text-3); display: flex; justify-content: space-between; gap: 8px; }
    .active-meta-row b { color: var(--text-2); font-weight: 600; }

    /* Bottom Split Panel */
    .split-grid {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 1000px) { .split-grid { grid-template-columns: 1fr; } }
    .brain-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 18px 20px;
      display: flex; flex-direction: column; gap: 12px;
      max-height: 460px; overflow-y: auto;
    }
    .brain-box-head { display: flex; align-items: center; gap: 8px; }
    .brain-box-icon {
      width: 28px; height: 28px; border-radius: 8px;
      background: var(--accent-dim);
      display: flex; align-items: center; justify-content: center;
      color: var(--accent-2); font-weight: 800; font-size: 13px;
    }
    .brain-box-title { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .brain-box-sub   { font-size: 11.5px; color: var(--text-3); margin-left: auto; }
    .strategy-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px;
      display: flex; flex-direction: column; gap: 5px;
    }
    .strategy-card.high     { border-left: 3px solid var(--warning); }
    .strategy-card.critical { border-left: 3px solid var(--error); }
    .strategy-card.medium   { border-left: 3px solid var(--accent); }
    .strategy-card.low      { border-left: 3px solid var(--text-3); }
    .strategy-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .strategy-title { font-size: 12.5px; font-weight: 700; color: var(--text); }
    .strategy-body  { font-size: 12px; color: var(--text-2); line-height: 1.55; }

    .chart-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      display: flex; flex-direction: column;
    }
    .chart-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .chart-panel-title { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .chart-panel-meta  { font-size: 11.5px; color: var(--text-3); }
    .chart-panel-canvas { position: relative; flex: 1; height: 380px; min-height: 280px; }

    /* Stale-data banner */
    #stale-banner { display: none; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }

    /* Re-used V2 / V6 sections (only what isn't in SHARED_CSS) */
    .v2-section { margin-bottom: 22px; }
    .v2-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
    .v2-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
    .v2-section-meta  { font-size: 12px; color: var(--text-3); }

    .v2-actions, .v2-recovery-card, .v2-spotlight, .v2-insight {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
    .v2-action-row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
    .v2-action-row:last-child { border-bottom: none; }
    .v2-action-priority { width: 28px; height: 28px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--text-2); flex-shrink: 0; }
    .v2-action-row[data-pri="1"] .v2-action-priority { background: var(--accent-dim); color: var(--accent-2); border-color: rgba(99,102,241,0.35); }
    .v2-action-body { flex: 1; min-width: 0; }
    .v2-action-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
    .v2-action-decision { font-size: 12.5px; color: var(--text-2); }
    .v2-action-meta { display: flex; gap: 16px; font-size: 11.5px; color: var(--text-3); margin-top: 6px; flex-wrap: wrap; }
    .v2-action-meta b { color: var(--text-2); font-weight: 600; }
    .v2-action-meta .ok { color: var(--success); font-weight: 700; }
    .v2-action-btn { padding: 8px 14px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 600; flex-shrink: 0; border: none; cursor: pointer; }
    .v2-action-btn:hover { filter: brightness(1.1); }
    .v2-action-empty { padding: 24px 18px; text-align: center; color: var(--text-3); font-size: 13px; }

    .v2-recovery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .v2-recovery-card { padding: 14px 16px; }
    .v2-recovery-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
    .v2-recovery-name { font-size: 13px; font-weight: 700; color: var(--text); }
    .v2-recovery-conf { font-size: 11px; color: var(--text-3); margin-top: 2px; }
    .v2-recovery-step { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-2); padding: 6px 8px; border-radius: 6px; background: var(--surface-2); margin-bottom: 5px; }
    .v2-recovery-step b { color: var(--text); font-weight: 600; }

    .v2-spotlight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 800px) { .v2-spotlight-grid { grid-template-columns: 1fr; } }
    .v2-spotlight { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
    .v2-spotlight-tag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
    .v2-winner .v2-spotlight-tag { color: var(--success); }
    .v2-opportunity .v2-spotlight-tag { color: var(--accent-2); }
    .v2-spotlight-name { font-size: 15px; font-weight: 700; color: var(--text); }
    .v2-spotlight-reason { font-size: 12.5px; color: var(--text-2); }
    .v2-spotlight-stat { display: flex; gap: 16px; font-size: 12px; color: var(--text-3); }
    .v2-spotlight-stat b { color: var(--text); font-weight: 700; }
    .v2-spotlight-empty { font-size: 12.5px; color: var(--text-3); padding: 4px 0; }

    .v2-insights { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .v2-insight { padding: 12px 14px; }
    .v2-insight-icon  { font-size: 16px; margin-bottom: 4px; }
    .v2-insight-title { font-size: 12.5px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
    .v2-insight-text  { font-size: 12px; color: var(--text-2); line-height: 1.5; }

    .v2-advanced summary { cursor: pointer; list-style: none; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--text); }
    .v2-advanced summary::-webkit-details-marker { display: none; }
    .v2-advanced summary::after { content: '▾'; color: var(--text-3); transition: transform 0.2s; }
    .v2-advanced[open] summary::after { transform: rotate(180deg); }
    .v2-advanced summary span { color: var(--text-3); font-weight: 500; font-size: 12px; }
    .v2-advanced-body { padding: 16px 0 0; }

    .chart-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px 24px;
      display: flex; flex-direction: column;
    }
    .chart-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .chart-panel-title { font-size: 15px; font-weight: 700; color: var(--text); }
    .chart-panel-meta  { font-size: 12px; color: var(--text-3); }
    .chart-panel-canvas { position: relative; flex: 1; height: 280px; min-height: 220px; }

    /* Right column widgets */
    .dash-right-col { display: flex; flex-direction: column; gap: 16px; }
    .widget-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 18px; padding: 20px 22px;
    }
    .widget-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 14px; }
    .widget-health-ring {
      display: flex; align-items: center; gap: 16px;
    }
    .widget-health-circle {
      width: 72px; height: 72px; border-radius: 50%;
      background: conic-gradient(var(--accent) calc(var(--pct, 0) * 1%), var(--surface-2) 0);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .widget-health-inner {
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--surface); display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 800; color: var(--text);
    }
    .widget-health-band { font-size: 13px; font-weight: 600; color: var(--text-2); }
    .widget-health-sub  { font-size: 12px; color: var(--text-3); margin-top: 2px; }
    .widget-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .widget-row:last-child { border-bottom: none; }
    .widget-row-label { font-size: 13px; color: var(--text-2); }
    .widget-row-val   { font-size: 14px; font-weight: 700; color: var(--text); }
    .widget-actions { display: flex; flex-direction: column; gap: 8px; }
    .widget-action-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 16px; border-radius: 12px;
      font-size: 13px; font-weight: 600; text-decoration: none;
      transition: all var(--transition); border: none; cursor: pointer; font-family: inherit;
    }
    .widget-action-btn.primary { background: var(--accent); color: #fff; }
    .widget-action-btn.primary:hover { background: #4f46e5; }
    .widget-action-btn.secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
    .widget-action-btn.secondary:hover { border-color: var(--border-2); background: var(--surface-hover); }

    /* Recent campaigns — transaction style */
    .campaign-list { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
    .campaign-list-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid var(--border); }
    .campaign-list-title { font-size: 15px; font-weight: 700; color: var(--text); }
    .campaign-list-meta  { font-size: 12px; color: var(--text-3); }
    .txn-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 22px; border-bottom: 1px solid var(--border);
      transition: background var(--transition);
    }
    .txn-row:last-child { border-bottom: none; }
    .txn-row:hover { background: var(--surface-hover); }
    .txn-icon {
      width: 42px; height: 42px; border-radius: 12px;
      background: var(--accent-dim); color: var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
    }
    .txn-icon.active { background: var(--success-dim); color: var(--success); }
    .txn-icon.paused { background: var(--warning-dim); color: var(--warning); }
    .txn-info { flex: 1; min-width: 0; }
    .txn-name { font-size: 14px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .txn-meta { font-size: 12px; color: var(--text-3); margin-top: 2px; }
    .txn-amount { font-size: 14px; font-weight: 700; flex-shrink: 0; text-align: right; }
    .txn-amount.positive { color: var(--success); }
    .txn-amount.negative { color: var(--error); }
    .txn-amount.neutral  { color: var(--text-2); }

    .dash-compact-actions { margin-bottom: 20px; }
    .dash-tip {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
      padding: 14px 18px; margin-bottom: 8px;
    }
    .dash-tip-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
    .dash-tip-body  { font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
    .dash-expand-btn { background: none; border: none; color: var(--accent-2); font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 0; margin-top: 4px; }

    .text-clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  </style>`;

  const content = `
    <div class="loading-overlay" id="loading-state">
      <div class="spinner"></div>
      <span class="loading-text">Loading dashboard…</span>
    </div>

    <div id="error-state" style="display:none;">
      <div class="alert alert-error" id="error-msg">An error occurred.</div>
    </div>

    <div id="dashboard-content" style="display:none;">

      <!-- Stale-data banner -->
      <div class="alert alert-warning" id="stale-banner">
        <div style="flex:1;">
          <div style="font-weight:600;">Showing cached data — token expired</div>
          <div style="font-size:12px;margin-top:2px;color:var(--text-2);">Your ad account token expired. These metrics are from your last sync.</div>
        </div>
        <a href="/workspace" class="btn btn-primary btn-sm">Reconnect</a>
      </div>

      <!-- KPI / Ad Account cards -->
      <section class="hero-grid" id="primary-kpi-grid"></section>

      <!-- Main layout: chart + campaigns | right widgets -->
      <div class="dash-layout">
        <div class="dash-main-col">
          <div class="chart-panel">
            <div class="chart-panel-head">
              <div class="chart-panel-title">Statistics</div>
              <div class="chart-panel-meta" id="chart-panel-meta">Last 30 days</div>
            </div>
            <div class="chart-panel-canvas"><canvas id="chart-spend-main"></canvas></div>
          </div>

          <section class="campaign-list">
            <div class="campaign-list-head">
              <div class="campaign-list-title">Recent Campaigns</div>
              <div class="campaign-list-meta" id="campaign-list-meta">—</div>
            </div>
            <div id="campaign-list-body"></div>
          </section>
        </div>

        <aside class="dash-right-col" id="dash-right-col">
          <div class="widget-card" id="widget-health">
            <div class="widget-title">Health Score</div>
            <div class="widget-health-ring">
              <div class="widget-health-circle" id="health-circle" style="--pct:0;">
                <div class="widget-health-inner" id="sum-health">—</div>
              </div>
              <div>
                <div class="widget-health-band" id="sum-health-band">—</div>
                <div class="widget-health-sub" id="sum-health-sub">Account performance</div>
              </div>
            </div>
          </div>
          <div class="widget-card">
            <div class="widget-title">Monthly Summary</div>
            <div class="widget-row"><span class="widget-row-label">Total spend</span><span class="widget-row-val" id="sum-spend">—</span></div>
            <div class="widget-row"><span class="widget-row-label">Active campaigns</span><span class="widget-row-val" id="sum-active">—</span></div>
            <div class="widget-row"><span class="widget-row-label">Open issues</span><span class="widget-row-val" id="sum-issues">—</span></div>
            <div class="widget-row"><span class="widget-row-label">Currency</span><span class="widget-row-val" id="sum-currency">—</span></div>
          </div>
          <div class="widget-card">
            <div class="widget-title">Quick Actions</div>
            <div class="widget-actions">
              <button type="button" class="widget-action-btn secondary" id="btn-sync">↻ Sync Data</button>
              <a href="/workspace" class="widget-action-btn primary">+ Connect Account</a>
            </div>
          </div>
        </aside>
      </div>

      <!-- Top tips -->
      <section class="dash-compact-actions" id="dash-compact-actions"></section>

      <!-- 5 ▸ More details (AI, advanced metrics, issues) -->
      <details class="v2-advanced" id="more-details">
        <summary>
          More details
          <span>AI insights · extra metrics · issues</span>
        </summary>
        <div class="v2-advanced-body">

      <!-- AI Motion Ticker -->
      <section class="ticker-wrap" id="ticker-wrap" style="display:none;">
        <div class="ticker-track" id="ticker-track"></div>
      </section>

      <!-- Active Ads Showcase -->
      <section class="active-section" id="active-section" style="display:none;">
        <div class="active-header">
          <div class="active-title">Active Ads · Now Spending</div>
          <div class="active-meta" id="active-meta">—</div>
        </div>
        <div class="active-grid" id="active-grid"></div>
      </section>

      <!-- Split panel — AI Brain Box + secondary chart -->
      <section class="split-grid">
        <div class="brain-box">
          <div class="brain-box-head">
            <div class="brain-box-icon">AI</div>
            <div class="brain-box-title">AI Tips</div>
            <div class="brain-box-sub" id="brain-box-sub">—</div>
          </div>
          <div id="strategy-list">
            <div class="v2-action-empty">Analyzing…</div>
          </div>
        </div>
        <div class="chart-panel">
          <div class="chart-panel-head">
            <div class="chart-panel-title">Results trend</div>
            <div class="chart-panel-meta">Messages</div>
          </div>
          <div class="chart-panel-canvas" style="height:220px;"><canvas id="chart-results-secondary"></canvas></div>
        </div>
      </section>

      <!-- 5 ▸ V6 Brain detail (CMO Feed, Live Pulse, Ledger) -->
      <section id="brain-cmo-feed-section" class="v2-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">CMO Feed</div>
          <div class="v2-section-meta" id="brain-cmo-feed-meta">AI-narrated decisions for today</div>
        </div>
        <div id="brain-cmo-feed" style="display:flex;flex-direction:column;gap:10px;"></div>
      </section>

      <section id="brain-pulse-section" class="v2-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">Live Pulse</div>
          <div class="v2-section-meta">Auto-refresh 60s · <span id="brain-pulse-tick">—</span></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
          <div class="card" style="padding:14px;">
            <div class="kpi-label">Burn Rate</div>
            <div id="brain-pulse-burn" class="kpi-value" style="font-size:20px;">—</div>
            <div class="text-xs text-3"><span id="brain-pulse-burn-n">0</span> campaigns</div>
          </div>
          <div class="card" style="padding:14px;">
            <div class="kpi-label">Intra-day Spend</div>
            <div id="brain-pulse-spendpct" class="kpi-value" style="font-size:20px;">—</div>
            <div class="text-xs text-3">of total daily budget</div>
          </div>
          <div class="card" style="padding:14px;">
            <div class="kpi-label">DNA Match</div>
            <div id="brain-pulse-dna" class="kpi-value" style="font-size:20px;">—</div>
            <div class="text-xs text-3">vs gold-standard winners</div>
          </div>
        </div>
      </section>

      <section id="brain-ledger-section" class="v2-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">Interventions Ledger</div>
          <div class="v2-section-meta">Last 7 days</div>
        </div>
        <div class="card" style="margin-bottom:12px;">
          <div class="kpi-label">Estimated wasted spend prevented</div>
          <div id="brain-ledger-saved" style="font-size:26px;font-weight:800;color:var(--success);margin-top:4px;">—</div>
        </div>
        <div id="brain-ledger-list" style="display:flex;flex-direction:column;gap:6px;"></div>
      </section>

      <!-- 6 ▸ V2 — Today's Actions + Recovery + Spotlight + Insights -->
      <section class="v2-section">
        <div class="v2-section-head">
          <div class="v2-section-title">Today's Actions</div>
          <div class="v2-section-meta" id="v2-actions-meta">Top decisions for the next 24h</div>
        </div>
        <div class="v2-actions" id="v2-actions">
          <div class="v2-action-empty">Loading actions…</div>
        </div>
      </section>

      <section class="v2-section" id="v2-recovery-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">Recovery Center</div>
          <div class="v2-section-meta">Solutions, not warnings</div>
        </div>
        <div class="v2-recovery-grid" id="v2-recovery"></div>
      </section>

      <section class="v2-section">
        <div class="v2-spotlight-grid" id="v2-spotlight"></div>
      </section>

      <section class="v2-section" id="v2-insights-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">AI Insights</div>
          <div class="v2-section-meta">Pattern observations</div>
        </div>
        <div class="v2-insights" id="v2-insights"></div>
      </section>

      <!-- Advanced Analytics (nested) -->
      <details class="v2-advanced" style="margin-top:16px;">
        <summary>
          Advanced Analytics
          <span>All KPIs · CTR chart · issues table</span>
        </summary>
        <div class="v2-advanced-body">
          <div class="kpi-grid" id="kpi-grid"></div>

          <div class="chart-grid">
            <div class="chart-card">
              <div class="chart-card-header"><div class="chart-card-title">CTR Trend</div></div>
              <div class="chart-canvas-wrap"><canvas id="chart-ctr"></canvas></div>
            </div>
          </div>

          <div class="card section-gap">
            <div class="card-title">Issues &amp; Alerts</div>
            <div id="issues-list"><div class="text-3 text-sm">No issues detected.</div></div>
          </div>
        </div>
      </details>

        </div>
      </details>
    </div>
  `;

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  var state = {
    currency: 'USD',
    minorFactor: 100,
    workspaceId: null,
  };

  var TRUNC_LEN = 140;
  var PRIMARY_KPI_KEYS = ['spend', 'messages', 'ctr', 'cpm'];

  // ── helpers ─────────────────────────────────────────────────────────────
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function truncText(text, max) {
    if (!text) return { short: '', full: '', truncated: false };
    if (text.length <= max) return { short: text, full: text, truncated: false };
    return { short: text.slice(0, max).trim() + '…', full: text, truncated: true };
  }
  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return d != null ? n.toFixed(d) : String(Math.round(n));
  }
  function fmtPctLocal(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(Number(n)) + '%';
  }
  function fmtCurrencyMinor(minorVal) {
    if (minorVal == null || isNaN(Number(minorVal))) return '—';
    var major = Number(minorVal) / state.minorFactor;
    if (state.currency === 'USD') {
      return '$' + major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (state.currency === 'IQD') {
      return Math.round(major).toLocaleString('en-US') + ' IQD';
    }
    var dec = state.minorFactor === 1 ? 0 : 2;
    return major.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ' + state.currency;
  }
  function fmtCurrencyMajor(n) {
    if (n == null || isNaN(n)) return '—';
    if (state.currency === 'USD') {
      return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (state.currency === 'IQD') {
      return Math.round(Number(n)).toLocaleString('en-US') + ' IQD';
    }
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + state.currency;
  }
  // Prefer dashboard DTO (authoritative) then workspace adAccounts for currency state.
  function hydrateCurrencyState(dashData, wsData) {
    var currency = null;
    var factor = null;
    if (dashData && dashData.workspace) {
      if (dashData.workspace.currency) currency = dashData.workspace.currency;
      if (dashData.workspace.currencyMinorFactor != null) {
        factor = Number(dashData.workspace.currencyMinorFactor);
      }
    }
    if (wsData && Array.isArray(wsData.adAccounts) && wsData.adAccounts.length > 0) {
      var primary = wsData.adAccounts[0];
      if (!currency && primary.currency) currency = primary.currency;
      if (factor == null && primary.currencyMinorFactor != null) {
        factor = Number(primary.currencyMinorFactor);
      }
    }
    if (currency) state.currency = currency;
    // IQD has no minor unit — never divide by a stale factor=100 from DB.
    if (currency === 'IQD') state.minorFactor = 1;
    else if (factor != null && factor > 0) state.minorFactor = factor;
  }
  // Sum BigInt-or-Number spend over an insights slice (already in minor units).
  function sumMinor(rows) {
    var s = 0;
    for (var i = 0; i < rows.length; i++) s += Number(rows[i].spend) || 0;
    return s;
  }
  // recentAsc: DailyStats arrive date-DESC. Take the first N (= most recent N),
  // then reverse so charts render oldest → newest left-to-right.
  function recentAsc(arr, n) {
    if (!Array.isArray(arr)) return [];
    var head = arr.slice(0, n);
    return head.slice().reverse();
  }
  function initialsOf(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2);
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-msg').textContent = msg;
  }

  // ── Chart.js wrapper ────────────────────────────────────────────────────
  function makeLineChart(canvasId, labels, datasets, opts) {
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
            backgroundColor: '#1a1d26',
            borderColor: '#e8ecf1',
            borderWidth: 1,
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            padding: 10,
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: (opts && opts.maxTicks) || 6, font: { size: 11 } } },
          y: { grid: { color: '#e8ecf1' }, ticks: { color: '#94a3b8', maxTicksLimit: 5, font: { size: 11 } } }
        },
        elements: { point: { radius: 0, hoverRadius: 4 } }
      }
    });
  }

  // ── Primary KPI cards ───────────────────────────────────────────────────
  function renderPrimaryKpis(kpis, health) {
    var grid = document.getElementById('primary-kpi-grid');
    var cards = [];

    function findKpi(key) { return (kpis || []).find(function (k) { return k.key === key; }); }

    PRIMARY_KPI_KEYS.forEach(function (key, idx) {
      var k = findKpi(key);
      if (!k) return;
      var deltaHtml = '';
      if (k.deltaPct != null && k.direction !== 'flat') {
        var good = k.goodWhenUp !== false;
        var up = k.direction === 'up';
        var cls = (up === good) ? 'up' : 'down';
        var arrow = up ? '↑' : '↓';
        deltaHtml = '<span class="hero-delta ' + cls + '">' + arrow + ' ' + Math.round(Math.abs(Number(k.deltaPct) * 100)) + '%</span>';
      }
      var label = key === 'spend' ? 'Spend' : key === 'messages' ? 'Results' : key === 'ctr' ? 'CTR' : 'CPM';
      var display = k.display || String(k.value || '—');
      if (key === 'ctr' && k.value != null) display = fmtPctLocal(k.value);
      var accentCls = 'accent-' + ((idx % 3) + 1);
      cards.push('<div class="hero-card ' + accentCls + '">'
        + '<div class="hero-label">' + label + '</div>'
        + '<div class="hero-value">' + escHtml(display) + '</div>'
        + '<div class="hero-sub">Last 30 days</div>'
        + deltaHtml
      + '</div>');
    });

    if (health) {
      var bandLabel = { excellent: 'Excellent', good: 'Good', attention: 'Needs attention', poor: 'Poor', none: '—' };
      var bandCls = health.band === 'poor' ? 'warning' : health.band === 'attention' ? 'warning' : 'success';
      cards.push('<div class="hero-card ' + bandCls + '">'
        + '<div class="hero-label">Health</div>'
        + '<div class="hero-value">' + Math.round(health.score || 0) + '</div>'
        + '<div class="hero-sub">' + (bandLabel[health.band] || '—') + '</div>'
      + '</div>');
    }

    grid.innerHTML = cards.length ? cards.join('') : '<div class="text-3 text-sm">No metrics yet.</div>';
  }

  function renderRightWidgets(dashData, kpis) {
    var health = dashData.health || { score: 0, band: 'none' };
    var bandLabel = { excellent: 'Excellent', good: 'Good', attention: 'Needs attention', poor: 'Poor', none: '—' };
    var score = Math.round(health.score || 0);
    var healthEl = document.getElementById('sum-health');
    var circleEl = document.getElementById('health-circle');
    if (healthEl) healthEl.textContent = String(score);
    if (circleEl) circleEl.style.setProperty('--pct', String(score));
    var bandEl = document.getElementById('sum-health-band');
    if (bandEl) bandEl.textContent = bandLabel[health.band] || '—';
    document.getElementById('sum-active').textContent = String((dashData.workspace && dashData.workspace.activeCampaigns) || 0);
    document.getElementById('sum-issues').textContent = String((dashData.issues || []).length);
    document.getElementById('sum-currency').textContent = state.currency;
    var spendKpi = (kpis || []).find(function (k) { return k.key === 'spend'; });
    document.getElementById('sum-spend').textContent = spendKpi ? (spendKpi.display || '—') : '—';
  }

  function campaignIcon(status) {
    if (status === 'ACTIVE') return '▶';
    if (status === 'PAUSED') return '⏸';
    return '📣';
  }
  function amountClass(status) {
    if (status === 'ACTIVE') return 'positive';
    if (status === 'PAUSED') return 'negative';
    return 'neutral';
  }

  function renderCampaignListSimple(campaigns) {
    var body = document.getElementById('campaign-list-body');
    var meta = document.getElementById('campaign-list-meta');
    if (!campaigns || campaigns.length === 0) {
      body.innerHTML = '<div class="txn-row"><span class="text-3 text-sm">No campaigns found.</span></div>';
      meta.textContent = '';
      return;
    }
    meta.textContent = campaigns.length + ' total';
    body.innerHTML = campaigns.slice(0, 10).map(function (c) {
      var amt = c.dailyBudget
        ? fmtCurrencyMinor(c.dailyBudget) + '/day'
        : (c.lifetimeBudget ? fmtCurrencyMinor(c.lifetimeBudget) : '—');
      var st = (c.status || 'UNKNOWN').toUpperCase();
      var iconCls = st === 'ACTIVE' ? 'active' : st === 'PAUSED' ? 'paused' : '';
      return '<div class="txn-row">'
        + '<div class="txn-icon ' + iconCls + '">' + campaignIcon(st) + '</div>'
        + '<div class="txn-info">'
          + '<div class="txn-name" title="' + escHtml(c.name) + '">' + escHtml(c.name || '—') + '</div>'
          + '<div class="txn-meta">' + escHtml(st) + (c.objective ? ' · ' + escHtml(c.objective) : '') + '</div>'
        + '</div>'
        + '<div class="txn-amount ' + amountClass(st) + '">' + escHtml(amt) + '</div>'
      + '</div>';
    }).join('');
  }

  function renderCompactTips(dashData) {
    var host = document.getElementById('dash-compact-actions');
    var tips = [];
    if (dashData.priorityAction) {
      var paText = typeof dashData.priorityAction === 'string'
        ? dashData.priorityAction
        : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
      if (paText) tips.push({ title: 'Top priority', body: paText });
    }
    var issues = Array.isArray(dashData.issues) ? dashData.issues.slice(0, 2) : [];
    issues.forEach(function (iss) {
      var rec = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      tips.push({ title: iss.title || iss.code || 'Note', body: rec || 'Review this campaign.' });
    });
    if (tips.length === 0) { host.innerHTML = ''; return; }
    host.innerHTML = tips.slice(0, 2).map(function (t, idx) {
      var tr = truncText(t.body, TRUNC_LEN);
      var expandId = 'tip-expand-' + idx;
      return '<div class="dash-tip">'
        + '<div class="dash-tip-title">' + escHtml(t.title) + '</div>'
        + '<div class="dash-tip-body" id="tip-body-' + idx + '">' + escHtml(tr.short) + '</div>'
        + (tr.truncated ? '<button type="button" class="dash-expand-btn" id="' + expandId + '">Read more</button>' : '')
      + '</div>';
    }).join('');
    tips.slice(0, 2).forEach(function (t, idx) {
      var tr = truncText(t.body, TRUNC_LEN);
      if (!tr.truncated) return;
      document.getElementById('tip-expand-' + idx).addEventListener('click', function () {
        document.getElementById('tip-body-' + idx).textContent = tr.full;
        this.style.display = 'none';
      });
    });
  }

  // ── AI Motion Ticker ─────────────────────────────────────────────────────
  function buildTickerItems(dashData) {
    var items = [];
    // From V6 brain.cmoFeed: Arabic narration is the gold standard
    var cmoFeed = (dashData.brain && Array.isArray(dashData.brain.cmoFeed)) ? dashData.brain.cmoFeed : [];
    cmoFeed.slice(0, 6).forEach(function (it) {
      if (it.narration && it.narration.arabicTitle) {
        items.push({
          layer: 'BRAIN',
          severity: it.priority === 'CRITICAL' ? 'critical' : it.priority === 'HIGH' ? 'warning' : 'success',
          text: it.narration.arabicTitle + ' — ' + (it.campaignName || ''),
        });
      }
    });
    // From issues: synthesize layer labels by severity-bucket
    var issues = Array.isArray(dashData.issues) ? dashData.issues : [];
    issues.slice(0, 5).forEach(function (iss, idx) {
      var sev = (iss.severity || 'low').toLowerCase();
      items.push({
        layer: 'L' + (3 + idx),
        severity: sev === 'critical' ? 'critical' : sev === 'high' ? 'warning' : sev === 'medium' ? 'warning' : 'success',
        text: (iss.title || iss.code || 'observation') + (iss.recommendations ? ' — ' + (Array.isArray(iss.recommendations) ? iss.recommendations[0] : iss.recommendations) : ''),
      });
    });
    // From KPIs: a CTR / spend movement summary
    var kpis = Array.isArray(dashData.kpis) ? dashData.kpis : [];
    kpis.slice(0, 4).forEach(function (k) {
      if (k.deltaPct == null) return;
      var dir = k.direction === 'up' ? 'صعود' : 'هبوط';
      // deltaPct is stored as a ratio (0.05 = 5%) — multiply before display.
      items.push({
        layer: 'L7',
        severity: k.direction === 'up' ? (k.goodWhenUp === false ? 'warning' : 'success') : (k.goodWhenUp === false ? 'success' : 'warning'),
        text: (k.label || k.key) + ' ' + dir + ' ' + Math.abs(Number(k.deltaPct) * 100).toFixed(1) + '% — رصد تلقائي للطبقة السابعة',
      });
    });
    // Always include at least one steady-state insight if nothing else fired
    if (items.length === 0) {
      items.push({ layer: 'AI', severity: 'success', text: 'الذكاء الاصطناعي يراقب حسابك · لم تُرصد تنبيهات نشطة' });
    }
    return items;
  }
  function renderTicker(items) {
    if (!items || items.length === 0) return;
    var wrap = document.getElementById('ticker-wrap');
    var track = document.getElementById('ticker-track');
    // Duplicate the items so the CSS translate(-50%) wraps seamlessly
    var html = items.concat(items).map(function (it) {
      return '<span class="ticker-item">'
        + '<span class="ticker-dot ' + it.severity + '"></span>'
        + '<span class="ticker-layer">' + escHtml(it.layer) + '</span>'
        + '<span>' + escHtml(it.text) + '</span>'
      + '</span>';
    }).join('');
    track.innerHTML = html;
    wrap.style.display = 'block';
  }

  // ── Active Ads Showcase ─────────────────────────────────────────────────
  function renderActiveAds(campaigns) {
    var active = (campaigns || []).filter(function (c) { return c.status === 'ACTIVE'; });
    var sec = document.getElementById('active-section');
    var grid = document.getElementById('active-grid');
    var meta = document.getElementById('active-meta');
    if (active.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    meta.textContent = active.length + ' campaign' + (active.length === 1 ? '' : 's') + ' currently spending';
    grid.innerHTML = active.slice(0, 12).map(function (c) {
      var budget = c.dailyBudget
        ? fmtCurrencyMinor(c.dailyBudget) + '/day'
        : (c.lifetimeBudget ? fmtCurrencyMinor(c.lifetimeBudget) + ' total' : 'No budget set');
      return '<div class="active-card">'
        + '<div class="active-top">'
          + '<span class="blink-dot"></span>'
          + '<span class="active-name" title="' + escHtml(c.name) + '">' + escHtml(c.name || '—') + '</span>'
        + '</div>'
        + '<div class="active-meta-row"><span>' + escHtml(c.objective || 'OBJECTIVE') + '</span><b>' + escHtml(budget) + '</b></div>'
      + '</div>';
    }).join('');
  }

  // ── AI Brain Box (strategy cards) ───────────────────────────────────────
  function renderBrainBox(dashData) {
    var list = document.getElementById('strategy-list');
    var sub  = document.getElementById('brain-box-sub');
    var cards = [];

    // 1) Priority action (always first if present)
    if (dashData.priorityAction) {
      var paText = typeof dashData.priorityAction === 'string'
        ? dashData.priorityAction
        : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
      if (paText) cards.push({ sev: 'critical', title: '⚡ الأولوية القصوى', body: paText });
    }

    // 2) Brain narrated decisions → strategy cards
    var feed = (dashData.brain && Array.isArray(dashData.brain.cmoFeed)) ? dashData.brain.cmoFeed : [];
    feed.slice(0, 3).forEach(function (it) {
      var sev = it.priority === 'CRITICAL' ? 'critical' : it.priority === 'HIGH' ? 'high' : 'medium';
      var title = (it.narration && it.narration.arabicTitle) || it.campaignName || 'AI decision';
      var body = (it.narration && it.narration.arabicNarration) || ('Action recommended: ' + (it.action || ''));
      cards.push({ sev: sev, title: title, body: body });
    });

    // 3) Top issues → actionable cards
    var issues = Array.isArray(dashData.issues) ? dashData.issues.slice() : [];
    issues.sort(function (a, b) {
      var order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[(a.severity || 'low').toLowerCase()] || 9) - (order[(b.severity || 'low').toLowerCase()] || 9);
    });
    issues.slice(0, 4).forEach(function (iss) {
      var sev = (iss.severity || 'medium').toLowerCase();
      var rec = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      cards.push({
        sev: sev,
        title: iss.title || iss.code || 'Observation',
        body: rec || 'Review affected campaigns and adjust strategy.',
      });
    });

    if (cards.length === 0) {
      list.innerHTML = '<div class="v2-action-empty">Account is steady — no strategic actions needed right now.</div>';
      sub.textContent = 'All clear';
      return;
    }
    list.innerHTML = cards.slice(0, 5).map(function (c, idx) {
      var tr = truncText(c.body, TRUNC_LEN);
      return '<div class="strategy-card ' + c.sev + '">'
        + '<div class="strategy-head"><div class="strategy-title">' + escHtml(c.title) + '</div></div>'
        + '<div class="strategy-body" id="strat-body-' + idx + '">' + escHtml(tr.short) + '</div>'
        + (tr.truncated ? '<button type="button" class="dash-expand-btn strat-expand" data-idx="' + idx + '">Read more</button>' : '')
      + '</div>';
    }).join('');
    cards.slice(0, 5).forEach(function (c, idx) {
      var tr = truncText(c.body, TRUNC_LEN);
      if (!tr.truncated) return;
      var btn = document.querySelector('.strat-expand[data-idx="' + idx + '"]');
      if (btn) btn.addEventListener('click', function () {
        document.getElementById('strat-body-' + idx).textContent = tr.full;
        this.style.display = 'none';
      });
    });
    sub.textContent = cards.length + ' insight' + (cards.length === 1 ? '' : 's');
  }

  // ── Advanced: KPI / Issues / Campaign table ─────────────────────────────
  function renderKpis(kpis) {
    var grid = document.getElementById('kpi-grid');
    var secondary = (kpis || []).filter(function (k) {
      return PRIMARY_KPI_KEYS.indexOf(k.key) === -1;
    });
    if (secondary.length === 0) { grid.innerHTML = '<div class="text-3 text-sm">No additional KPI data.</div>'; return; }
    grid.innerHTML = secondary.map(function (k) {
      var deltaClass = 'flat', arrow = '→';
      if (k.deltaPct != null) {
        var good = k.goodWhenUp !== false;
        var up = k.direction === 'up';
        if (up)   { deltaClass = good ? 'up-good' : 'up-bad'; arrow = '↑'; }
        else      { deltaClass = good ? 'down-bad' : 'down-good'; arrow = '↓'; }
      }
      // deltaPct is stored as a ratio (0.05 = 5%) — multiply before display.
      var deltaHtml = k.deltaPct != null
        ? '<div class="kpi-delta ' + deltaClass + '">' + arrow + ' ' + Math.round(Math.abs(Number(k.deltaPct) * 100)) + '%</div>'
        : '';
      return '<div class="kpi-card">'
        + '<div class="kpi-label">' + escHtml(k.label || k.key) + '</div>'
        + '<div class="kpi-value">' + escHtml(String(k.display || k.value || '—')) + '</div>'
        + deltaHtml
      + '</div>';
    }).join('');
  }

  function renderIssues(issues) {
    var el = document.getElementById('issues-list');
    if (!issues || issues.length === 0) {
      el.innerHTML = '<div class="text-3 text-sm">No issues detected. Your account looks healthy.</div>';
      return;
    }
    el.innerHTML = issues.map(function (iss, idx) {
      var sev = (iss.severity || 'low').toUpperCase();
      var recs = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      var tr = truncText(recs, TRUNC_LEN);
      return '<div style="padding:10px 0;border-top:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'
          + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + escHtml(iss.title || iss.code) + '</div>'
          + severityBadge(sev)
        + '</div>'
        + (recs ? '<div class="text-sm text-2" style="margin-top:3px;" id="iss-rec-' + idx + '">' + escHtml(tr.short) + '</div>' : '')
        + (tr.truncated ? '<button type="button" class="dash-expand-btn iss-expand" data-idx="' + idx + '">Read more</button>' : '')
      + '</div>';
    }).join('');
    issues.forEach(function (iss, idx) {
      var recs = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      var tr = truncText(recs, TRUNC_LEN);
      if (!tr.truncated) return;
      var btn = document.querySelector('.iss-expand[data-idx="' + idx + '"]');
      if (btn) btn.addEventListener('click', function () {
        document.getElementById('iss-rec-' + idx).textContent = tr.full;
        this.style.display = 'none';
      });
    });
  }

  // ── V2: Today's Actions / Recovery / Spotlight / AI Insights ────────────
  function severityToVerdict(s) {
    s = (s || 'good').toLowerCase();
    if (s === 'critical') return { cls: 'badge-red', text: 'Critical' };
    if (s === 'high' || s === 'needs_attention') return { cls: 'badge-yellow', text: 'Needs Attention' };
    if (s === 'excellent') return { cls: 'badge-green', text: 'Excellent' };
    return { cls: 'badge-green', text: 'Good' };
  }
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
            + '<span>Impact: <b>' + escHtml(a.expectedImpact) + '</b></span>'
            + '<span>Confidence: <b>' + escHtml(String(a.confidence)) + '%</b></span>'
            + '<span>Risk: <b class="' + (a.risk === 'low' ? 'ok' : '') + '">' + escHtml(a.risk) + '</b></span>'
          + '</div>'
        + '</div>'
        + '<button class="v2-action-btn" type="button">' + escHtml(a.buttonText) + '</button>'
      + '</div>';
    }).join('');
  }
  function buildTodayActions(dashData) {
    var actions = [];
    if (dashData.priorityAction) {
      var paText = typeof dashData.priorityAction === 'string'
        ? dashData.priorityAction
        : (dashData.priorityAction.text || dashData.priorityAction.actionCode || '');
      if (paText) actions.push({ priority: 1, title: 'Priority Action', decision: paText, confidence: 92, expectedImpact: 'High', risk: 'low', buttonText: 'Act' });
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
  function buildRecoveryPlans(issues) {
    if (!Array.isArray(issues)) return [];
    return issues.slice(0, 6).map(function (iss) {
      var recs = Array.isArray(iss.recommendations) ? iss.recommendations : (iss.recommendations ? [iss.recommendations] : []);
      if (recs.length === 0) recs = ['Review affected campaigns', 'Adjust budget or creative', 'Pause if degradation continues'];
      return { patternName: iss.title || iss.code || 'Detected pattern', severity: (iss.severity || 'medium').toLowerCase(), confidence: iss.confidence || 85, steps: recs.slice(0, 4) };
    });
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
          + '<div><div class="v2-recovery-name">' + escHtml(p.patternName) + '</div>'
          + '<div class="v2-recovery-conf">Confidence ' + escHtml(String(p.confidence)) + '%</div></div>'
          + '<span class="badge ' + v.cls + '">' + escHtml(v.text) + '</span>'
        + '</div>'
        + p.steps.map(function (step, i) { return '<div class="v2-recovery-step"><b>' + (i + 1) + '.</b> ' + escHtml(step) + '</div>'; }).join('')
      + '</div>';
    }).join('');
  }
  function deriveOpportunity(dashData) {
    if (dashData.opportunity) return dashData.opportunity;
    if (dashData.bestCampaign) {
      return { title: 'Audience Expansion', reason: 'Top campaign performing well — broaden audience to scale safely.', expectedGain: '+12 messages/day', confidence: 85 };
    }
    return null;
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
          + '<button class="btn btn-primary btn-sm" type="button" style="align-self:flex-start;">Scale Safely</button>'
        + '</div>'
      );
    } else {
      parts.push('<div class="v2-spotlight v2-winner"><div class="v2-spotlight-tag">Best Campaign</div><div class="v2-spotlight-empty">No clear winner yet — let campaigns gather more data.</div></div>');
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
          + '<button class="btn btn-primary btn-sm" type="button" style="align-self:flex-start;">Explore</button>'
        + '</div>'
      );
    } else {
      parts.push('<div class="v2-spotlight v2-opportunity"><div class="v2-spotlight-tag">Opportunity</div><div class="v2-spotlight-empty">No new opportunity detected today.</div></div>');
    }
    el.innerHTML = parts.join('');
  }
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
      out.push({ icon: up ? '↑' : '↓', title: 'CTR ' + (up ? 'improving' : 'softening'), text: 'CTR moved ' + (up ? '+' : '-') + Math.abs(Number(ctr.deltaPct)).toFixed(1) + '% vs prior period.' });
    }
    var spend = findKpi('spend');
    if (spend && spend.deltaPct != null) {
      out.push({ icon: '$', title: 'Spend trend', text: 'Total spend changed ' + (spend.direction === 'up' ? '+' : '-') + Math.abs(Number(spend.deltaPct)).toFixed(1) + '% vs prior period.' });
    }
    return out;
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

  // ── V6 Brain sections (CMO Feed / Live Pulse / Ledger) ──────────────────
  function priorityBadgeClass(p) {
    if (p === 'CRITICAL') return 'badge-red';
    if (p === 'HIGH') return 'badge-yellow';
    return 'badge-green';
  }
  function renderBrainSection(brain) {
    if (!brain) return;
    // CMO Feed
    var feedHost = document.getElementById('brain-cmo-feed');
    var feedSection = document.getElementById('brain-cmo-feed-section');
    var meta = document.getElementById('brain-cmo-feed-meta');
    var items = (brain.cmoFeed || []);
    if (items.length === 0) {
      feedHost.innerHTML = '<div class="v2-action-empty">No active decisions today.</div>';
    } else {
      feedHost.innerHTML = items.map(function (it) {
        var hasNarration = !!it.narration;
        var title = hasNarration ? escHtml(it.narration.arabicTitle) : escHtml(it.campaignName);
        var body = hasNarration
          ? escHtml(it.narration.arabicNarration)
          : 'AI summary pending — action recommended: ' + escHtml(it.action);
        var dir = (it.narration && it.narration.creativeDirective)
          ? '<div style="margin-top:6px;font-size:12px;color:var(--text-3);"><strong>Creative directive:</strong> ' + escHtml(it.narration.creativeDirective) + '</div>'
          : '';
        return '<div class="card" style="padding:14px;">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
          +   '<span class="badge ' + priorityBadgeClass(it.priority) + '">' + escHtml(it.priority) + '</span>'
          +   '<span class="text-xs text-3">' + escHtml(it.campaignName) + ' · ' + escHtml(it.tickDate) + '</span>'
          + '</div>'
          + '<div style="font-size:15px;font-weight:600;color:var(--text);">' + title + '</div>'
          + '<div style="font-size:13px;color:var(--text-2);margin-top:4px;line-height:1.5;">' + body + '</div>'
          + dir
        + '</div>';
      }).join('');
    }
    meta.textContent = items.length + ' decision' + (items.length === 1 ? '' : 's') + ' for today';
    feedSection.style.display = 'block';

    applyPulse(brain.livePulse);
    document.getElementById('brain-pulse-section').style.display = 'block';

    var ledger = brain.ledger;
    if (ledger) {
      document.getElementById('brain-ledger-saved').textContent = ledger.savedSpendDisplay || '—';
      var list = document.getElementById('brain-ledger-list');
      var rows = ledger.recentActions || [];
      if (rows.length === 0) {
        list.innerHTML = '<div class="v2-action-empty">No interventions in the last 7 days.</div>';
      } else {
        list.innerHTML = rows.map(function (r) {
          return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;">'
            + '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
            +   '<span class="badge ' + priorityBadgeClass(r.priority) + '">' + escHtml(r.priority) + '</span>'
            +   '<span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(r.campaignName) + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">'
            +   '<span class="text-sm font-semibold text-2">' + escHtml(r.action) + '</span>'
            +   '<span class="text-xs text-3">' + escHtml(r.tickDate) + '</span>'
            + '</div>'
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
    document.getElementById('brain-pulse-spendpct').textContent = (pulse.intraDaySpendPct != null) ? pulse.intraDaySpendPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-dna').textContent = (pulse.dnaMatchPct != null) ? pulse.dnaMatchPct.toFixed(1) + '%' : '—';
    document.getElementById('brain-pulse-tick').textContent = pulse.tickDate || 'no tick yet today';
  }
  function startPulsePolling(workspaceId) {
    var POLL_MS = 60000;
    async function tick() {
      try {
        var r = await apiFetch('/api/dashboard/pulse/' + workspaceId);
        if (r && !r.empty) applyPulse(r);
      } catch (e) { /* silent */ }
    }
    setInterval(tick, POLL_MS);
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
      { key: 'spend', label: 'Spend', value: spendMajor, display: fmtCurrencyMinor(totals.spendMinor), goodWhenUp: false },
      { key: 'impressions', label: 'Impressions', value: totals.impressions, display: fmtNum(totals.impressions), goodWhenUp: true },
      { key: 'reach', label: 'Reach (latest day)', value: latestReach, display: fmtNum(latestReach), goodWhenUp: true },
      { key: 'clicks', label: 'Clicks', value: totals.clicks, display: fmtNum(totals.clicks), goodWhenUp: true },
      { key: 'ctr', label: 'CTR', value: ctr, display: fmtPctLocal(ctr), goodWhenUp: true },
      { key: 'cpc', label: 'CPC', value: cpc, display: fmtCurrencyMajor(cpc), goodWhenUp: false },
      { key: 'cpm', label: 'CPM', value: cpm, display: fmtCurrencyMajor(cpm), goodWhenUp: false },
      { key: 'messages', label: 'Messages', value: totals.messages, display: fmtNum(totals.messages), goodWhenUp: true },
    ];
  }

  // ── Main init ───────────────────────────────────────────────────────────
  async function init() {
    var token = getToken();
    if (!token) { window.location.href = '/login'; return; }

    try {
      // 1) Identify user — populates shared sidebar avatar/name/email
      var me = await apiFetch('/api/auth/me');
      if (!me) return;
      var userName = me.name || me.email || 'User';
      var userInitials = initialsOf(userName);
      var avEl = document.getElementById('user-avatar');     if (avEl) avEl.textContent = userInitials;
      var topAv = document.getElementById('topbar-avatar');  if (topAv) topAv.textContent = userInitials;
      var nameEl = document.getElementById('user-name');     if (nameEl) nameEl.textContent = userName;
      var emailEl = document.getElementById('user-email');   if (emailEl) emailEl.textContent = me.email || '';
      var greetEl = document.getElementById('dash-greeting');
      if (greetEl) {
        var hr = new Date().getHours();
        var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
        greetEl.textContent = greet + ', ' + userName.split(' ')[0];
      }

      // 2) Resolve workspace
      var workspaceId = getWsId();
      if (!workspaceId && me.memberships && me.memberships.length > 0) {
        workspaceId = me.memberships[0].workspaceId || (me.memberships[0].workspace && me.memberships[0].workspace.id);
        if (workspaceId) setWsId(workspaceId);
      }
      if (!workspaceId) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
        document.getElementById('kpi-grid').innerHTML = '<div class="empty-state"><div class="empty-title">No workspace found</div><div class="empty-text">Create or join a workspace to see your dashboard.</div></div>';
        return;
      }
      state.workspaceId = workspaceId;

      // 3) Parallel data fetch
      //    Insights: request 90 days (server-side cap) so we can compute
      //    7d/30d/lifetime hero totals + prior-period deltas from one payload.
      var results = await Promise.all([
        apiFetch('/api/dashboard/' + workspaceId),
        apiFetch('/api/workspaces/' + workspaceId + '/insights?days=90'),
        apiFetch('/api/workspaces/' + workspaceId + '/campaigns').catch(function () { return []; }),
        apiFetch('/api/workspaces/' + workspaceId).catch(function () { return null; }),
      ]);
      var dashData = results[0] || {};
      var insights = results[1] || [];
      var campaigns = results[2] || [];
      var wsData = results[3];

      // 4) Hydrate currency state (DTO first — survives ws fetch failures)
      hydrateCurrencyState(dashData, wsData);

      // 5) Stale data banner — all ad accounts non-ACTIVE
      var allStale = wsData && Array.isArray(wsData.adAccounts)
        && wsData.adAccounts.length > 0
        && wsData.adAccounts.every(function (a) { return a.status !== 'ACTIVE'; });
      if (allStale) document.getElementById('stale-banner').style.display = 'flex';

      // 6) Empty state — no ad account connected
      if (dashData.empty) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
        document.getElementById('primary-kpi-grid').innerHTML =
          '<div class="empty-state" style="grid-column:1/-1;">'
          + '<div class="empty-icon">📊</div>'
          + '<div class="empty-title">Connect your Meta Ads account</div>'
          + '<div class="empty-text">Link your ad account to see spend, CTR, reach, and AI-powered recommendations.</div>'
          + '<a href="/workspace" class="btn btn-primary" style="margin-top:14px;">Go to Workspace</a>'
        + '</div>';
        return;
      }

      // 7) Workspace name in topbar (provided by shared layout)
      var wsName = (dashData.workspace && (dashData.workspace.name || dashData.workspace.id)) || workspaceId;
      var wsNameEl = document.getElementById('ws-name'); if (wsNameEl) wsNameEl.textContent = wsName;
      document.getElementById('dash-subtitle').textContent = 'Last 30 days · ' + wsName;
      document.getElementById('chart-panel-meta').textContent = state.currency + ' · 30 days';

      // Sync button — reload dashboard data
      var syncBtn = document.getElementById('btn-sync');
      if (syncBtn) syncBtn.addEventListener('click', function () { window.location.reload(); });

      // 8) KPIs — prefer dashboard KPIs, else compute from insights
      var kpis = (dashData.kpis && dashData.kpis.length > 0) ? dashData.kpis : buildKpisFromInsights(insights);
      renderPrimaryKpis(kpis, dashData.health);
      renderRightWidgets(dashData, kpis);
      renderCampaignListSimple(campaigns);
      renderCompactTips(dashData);

      // 9) AI Motion Ticker (inside More details)
      renderTicker(buildTickerItems(dashData));

      // 10) Active Ads Showcase
      renderActiveAds(campaigns);

      // 11) AI Brain Box (left of split panel)
      renderBrainBox(dashData);

      // 12) V6 Brain sections + start polling
      if (dashData.brain) {
        renderBrainSection(dashData.brain);
        startPulsePolling(workspaceId);
      }

      // 13) V2 Decision interface — Today's Actions, Recovery, Spotlight, Insights
      renderTodayActions(buildTodayActions(dashData));
      renderRecoveryCenter(buildRecoveryPlans(dashData.issues));
      renderSpotlight(dashData.bestCampaign, deriveOpportunity(dashData));

      // 14) KPIs (advanced secondary only)
      renderKpis(kpis);
      renderInsights(buildInsights(dashData, kpis));

      // 15) Charts — main spend + secondary results (inside More details)
      var last30 = recentAsc(insights, 30);
      var labels = last30.map(function (d) { return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
      var spendSeriesMajor = last30.map(function (d) { return (Number(d.spend) || 0) / state.minorFactor; });
      var msgSeries        = last30.map(function (d) { return Number(d.messages) || 0; });
      var ctrSeries        = last30.map(function (d) { return Number(d.ctr) || 0; });

      if (dashData.trendSeries && dashData.trendSeries.dates && dashData.trendSeries.dates.length > 0) {
        var ts = dashData.trendSeries;
        labels = ts.dates.map(function (d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
        if (ts.spend)    spendSeriesMajor = ts.spend.map(function (s) { return Number(s) / state.minorFactor; });
        if (ts.messages) msgSeries        = ts.messages.map(Number);
        if (ts.ctr)      ctrSeries        = ts.ctr.map(Number);
      }

      makeLineChart('chart-spend-main', labels, [{ label: 'Spend', data: spendSeriesMajor, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.10)', fill: true, tension: 0.35, borderWidth: 2 }], { maxTicks: 6 });
      makeLineChart('chart-results-secondary', labels, [{ label: 'Messages', data: msgSeries, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.35 }]);
      makeLineChart('chart-ctr', labels, [{ label: 'CTR (%)', data: ctrSeries, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.35 }]);

      // 16) Issues (advanced)
      renderIssues(dashData.issues || []);

      // 17) Reveal
      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('dashboard-content').style.display = 'block';

    } catch (err) {
      showError('Failed to load dashboard: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({
    title: 'Dashboard',
    active: 'dashboard',
    content,
    scripts,
    extraHead,
    mode: 'pro',
    theme: 'light',
    sidebarCompact: true,
    topbarVariant: 'dashboard',
  });
}
