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
//    Full auto-refresh (90s, tab visible)         → dashboard + insights + campaigns
//    Live Pulse comes from dashboard DTO brain.livePulse (no separate pulse poll)
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function dashboardPage(): string {
  const extraHead = `<style>
    /* Premium spend hero cards */
    .hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 22px; }
    @media (max-width: 800px) { .hero-grid { grid-template-columns: 1fr; } }
    .hero-card {
      position: relative;
      background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px 22px;
      overflow: hidden;
      transition: border-color var(--transition), box-shadow var(--transition);
    }
    .hero-card::before {
      content: ''; position: absolute; inset: -1px;
      border-radius: var(--radius-lg);
      padding: 1px;
      background: linear-gradient(135deg, rgba(99,102,241,0.45), rgba(99,102,241,0) 60%);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
      opacity: 0.55; pointer-events: none;
    }
    .hero-card:hover { border-color: var(--accent); box-shadow: var(--shadow-lg); transform: translateY(-1px); }
    .hero-card.success::before { background: linear-gradient(135deg, rgba(34,197,94,0.4), rgba(34,197,94,0) 60%); }
    .hero-card.warning::before { background: linear-gradient(135deg, rgba(245,158,11,0.4), rgba(245,158,11,0) 60%); }
    .hero-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
    .hero-value { font-size: 32px; font-weight: 850; color: var(--text); letter-spacing: -0.9px; margin-top: 8px; line-height: 1.05; }
    .hero-sub   { font-size: 12px; color: var(--text-2); margin-top: 6px; }
    .hero-delta {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 10px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11.5px; font-weight: 700;
    }
    .hero-delta.up   { color: var(--success); background: var(--success-dim); }
    .hero-delta.down { color: var(--error);   background: var(--error-dim); }
    .hero-delta.flat { color: var(--text-3);  background: rgba(255,255,255,0.04); }

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
      content: 'مباشر'; position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      font-size: 10px; font-weight: 800; letter-spacing: normal;
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
    .ticker-item { font-size: 13px; color: var(--text); display: inline-flex; align-items: center; gap: 8px; line-height: 1.6; letter-spacing: normal; }
    .ticker-dot  { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
    .ticker-dot.success  { background: var(--success); }
    .ticker-dot.warning  { background: var(--warning); }
    .ticker-dot.critical { background: var(--error); }
    .ticker-badge { font-size: 11px; font-weight: 700; color: var(--text-2); letter-spacing: normal; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.05); }
    .ticker-text { letter-spacing: normal; line-height: 1.6; }
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
    .active-name { font-size: 13.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.6; letter-spacing: normal; }
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
    .strategy-body  { font-size: 12px; color: var(--text-2); line-height: 1.6; letter-spacing: normal; }

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
    .v2-section { margin-bottom: 26px; }
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
    .v2-advanced-body { padding: 18px 0 0; }

    /* Loading skeleton (presentational — no data bindings) */
    .dash-skeleton { width: 100%; padding: 4px 0; }
    .skeleton-hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
    @media (max-width: 800px) { .skeleton-hero-grid { grid-template-columns: 1fr; } }
    .skeleton-block {
      background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-hover) 50%, var(--surface-2) 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.2s ease-in-out infinite;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
    }
    .skeleton-hero { height: 112px; }
    .skeleton-chart { height: 300px; }
    @keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* Tier 1 — Executive Pulse Banner */
    .exec-pulse-banner {
      margin-bottom: 22px;
      padding: 18px 24px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .exec-pulse-banner::before {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .exec-pulse-banner.healthy { border-left: 4px solid var(--success); }
    .exec-pulse-banner.healthy::before { background: var(--success); box-shadow: 0 0 8px rgba(34,197,94,0.5); }
    .exec-pulse-banner.warning { border-left: 4px solid var(--warning); background: rgba(245,158,11,0.06); }
    .exec-pulse-banner.warning::before { background: var(--warning); }
    .exec-pulse-banner.critical { border-left: 4px solid var(--error); background: var(--error-dim); }
    .exec-pulse-banner.critical::before { background: var(--error); animation: blink-pulse 1.6s infinite; }
    .exec-pulse-text { font-size: 15px; font-weight: 650; color: var(--text); line-height: 1.55; letter-spacing: normal; }

    /* Tier 2 — Main Move unified focus card */
    .main-move-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .main-move-primary {
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .main-move-primary.has-critical { border-left: 4px solid var(--error); }
    .main-move-primary.has-warning { border-left: 4px solid var(--warning); }
    .main-move-tag {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent-2);
    }
    .main-move-title { font-size: 20px; font-weight: 800; color: var(--text); line-height: 1.35; letter-spacing: -0.3px; }
    .main-move-impact {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 700;
      color: var(--success);
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--success-dim);
      align-self: flex-start;
    }
    .main-move-why {
      font-size: 13.5px;
      color: var(--text-2);
      line-height: 1.65;
      letter-spacing: normal;
      padding-top: 4px;
      border-top: 1px solid var(--border);
      margin-top: 4px;
    }
    .main-move-cta-row { display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
    .main-move-cta {
      padding: 11px 22px;
      border-radius: 10px;
      background: var(--accent);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    .main-move-cta:hover { filter: brightness(1.1); }
    .main-move-cta.critical { background: var(--error); }
    .main-move-empty { padding: 28px 24px; text-align: center; color: var(--text-3); font-size: 14px; }
    .main-move-more { border-top: 1px solid var(--border); }
    .main-move-more summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 24px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-2);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .main-move-more summary::-webkit-details-marker { display: none; }
    .main-move-more summary::after { content: '▾'; color: var(--text-3); transition: transform 0.2s; }
    .main-move-more[open] summary::after { transform: rotate(180deg); }
    .main-move-secondary { padding: 0 24px 16px; display: flex; flex-direction: column; gap: 8px; }
    .main-move-secondary-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .main-move-secondary-pri {
      width: 24px; height: 24px; border-radius: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800; color: var(--text-3); flex-shrink: 0;
    }
    .main-move-secondary-body { flex: 1; min-width: 0; }
    .main-move-secondary-title { font-size: 13px; font-weight: 600; color: var(--text); }
    .main-move-secondary-decision { font-size: 12px; color: var(--text-3); margin-top: 2px; }

  </style>`;

  const content = `
    <div class="loading-overlay" id="loading-state">
      <div class="dash-skeleton" aria-hidden="true">
        <div class="skeleton-hero-grid">
          <div class="skeleton-block skeleton-hero"></div>
          <div class="skeleton-block skeleton-hero"></div>
          <div class="skeleton-block skeleton-hero"></div>
        </div>
        <div class="skeleton-block skeleton-chart"></div>
      </div>
    </div>

    <div id="error-state" style="display:none;">
      <div class="alert alert-error" id="error-msg">An error occurred.</div>
    </div>

    <div id="dashboard-content" style="display:none;">
      <div class="page-header">
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle" id="dash-subtitle">Overview of your ad performance · <span id="dash-last-updated" class="text-3">—</span></div>
      </div>

      <!-- Stale-data banner -->
      <div class="alert alert-warning" id="stale-banner">
        <div style="flex:1;">
          <div style="font-weight:600;">Showing cached data — token expired</div>
          <div style="font-size:12px;margin-top:2px;color:var(--text-2);">Your ad account token expired. These metrics are from your last sync.</div>
        </div>
        <a href="/workspace" class="btn btn-primary btn-sm">Reconnect</a>
      </div>

      <!-- 1 ▸ Financial hero cards -->
      <section class="hero-grid" id="hero-grid">
        <div class="hero-card" id="hero-30">
          <div class="hero-label">30-Day Spend</div>
          <div class="hero-value" id="hero-30-val">—</div>
          <div class="hero-sub">Past 30 days</div>
          <span class="hero-delta flat" id="hero-30-delta">→ —</span>
        </div>
        <div class="hero-card success" id="hero-7">
          <div class="hero-label">7-Day Spend</div>
          <div class="hero-value" id="hero-7-val">—</div>
          <div class="hero-sub">Past 7 days</div>
          <span class="hero-delta flat" id="hero-7-delta">→ —</span>
        </div>
        <div class="hero-card warning" id="hero-life">
          <div class="hero-label">Lifetime Spend</div>
          <div class="hero-value" id="hero-life-val">—</div>
          <div class="hero-sub" id="hero-life-sub">Account history (90-day window)</div>
          <span class="hero-delta flat">Account total</span>
        </div>
      </section>

      <!-- 2 ▸ Executive Pulse Banner (Tier 1) -->
      <section id="exec-pulse-section" class="exec-pulse-banner healthy" style="display:none;" dir="auto">
        <div class="exec-pulse-text" id="exec-pulse-text">—</div>
      </section>

      <!-- 3 ▸ AI Motion Ticker -->
      <section class="ticker-wrap" id="ticker-wrap" style="display:none;" dir="auto">
        <div class="ticker-track" id="ticker-track" dir="auto"></div>
      </section>

      <!-- 3 ▸ Active Ads Showcase -->
      <section class="active-section" id="active-section" style="display:none;">
        <div class="active-header">
          <div class="active-title">Active Ads · Now Spending</div>
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
            <div class="chart-panel-title">Performance · Spend Over Time</div>
            <div class="chart-panel-meta" id="chart-panel-meta">—</div>
          </div>
          <div class="chart-panel-canvas"><canvas id="chart-spend-main"></canvas></div>
        </div>
      </section>

      <!-- 5 ▸ V6 Brain detail (CMO Feed, Ledger) -->
      <section id="brain-cmo-feed-section" class="v2-section" style="display:none;">
        <div class="v2-section-head">
          <div class="v2-section-title">CMO Feed</div>
          <div class="v2-section-meta" id="brain-cmo-feed-meta">AI-narrated decisions for today</div>
        </div>
        <div id="brain-cmo-feed" dir="auto" style="display:flex;flex-direction:column;gap:10px;"></div>
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

      <!-- 6 ▸ Main Move — unified focus (Tier 2 + Tier 3 narrative) -->
      <section class="v2-section" id="main-move-section">
        <div class="v2-section-head">
          <div class="v2-section-title" id="main-move-label">Main Move</div>
          <div class="v2-section-meta" id="main-move-meta">—</div>
        </div>
        <div class="main-move-card" id="main-move-card">
          <div class="main-move-empty" id="main-move-empty">Loading…</div>
        </div>
      </section>

      <section class="v2-section">
        <div class="v2-spotlight-grid" id="v2-spotlight"></div>
      </section>

      <!-- 7 ▸ Advanced Analytics (collapsed) -->
      <details class="v2-advanced">
        <summary>
          Advanced Analytics
          <span>مؤشرات الأداء · تفاعل الإعلان · مرات الظهور · التنبيهات · الحملات</span>
        </summary>
        <div class="v2-advanced-body">
          <div class="v2-section" id="brain-pulse-section" style="display:none;margin-bottom:18px;">
            <div class="v2-section-head">
              <div class="v2-section-title">Live Pulse</div>
              <div class="v2-section-meta">Refreshes every 90s · <span id="brain-pulse-tick">—</span></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
              <div class="card" style="padding:14px;">
                <div id="brain-pulse-burn-label" class="kpi-label">Spend pace</div>
                <div id="brain-pulse-burn" class="kpi-value" style="font-size:20px;">—</div>
                <div class="text-xs text-3"><span id="brain-pulse-burn-n">0</span> <span id="brain-pulse-burn-meta">campaigns</span></div>
              </div>
              <div class="card" style="padding:14px;">
                <div id="brain-pulse-spend-label" class="kpi-label">Today's spend share</div>
                <div id="brain-pulse-spendpct" class="kpi-value" style="font-size:20px;">—</div>
                <div id="brain-pulse-spend-meta" class="text-xs text-3">of total daily budget</div>
              </div>
              <div class="card" style="padding:14px;">
                <div id="brain-pulse-dna-label" class="kpi-label">Match to your top campaigns</div>
                <div id="brain-pulse-dna" class="kpi-value" style="font-size:20px;">—</div>
                <div id="brain-pulse-dna-meta" class="text-xs text-3">compared to your top past campaigns</div>
              </div>
            </div>
          </div>

          <div class="kpi-grid" id="kpi-grid"></div>

          <div class="chart-grid">
            <div class="chart-card">
              <div class="chart-card-header"><div class="chart-card-title" id="chart-ctr-title">اتجاه تفاعل الإعلان</div></div>
              <div class="chart-canvas-wrap"><canvas id="chart-ctr"></canvas></div>
            </div>
            <div class="chart-card">
              <div class="chart-card-header"><div class="chart-card-title">Messages Trend</div></div>
              <div class="chart-canvas-wrap"><canvas id="chart-impressions"></canvas></div>
            </div>
          </div>

          <div class="card section-gap">
            <div class="card-title">Issues &amp; Alerts</div>
            <div id="issues-list"><div class="text-3 text-sm">No issues detected.</div></div>
          </div>

          <div class="table-wrap">
            <div class="table-header"><div class="table-title">Campaign Performance</div></div>
            <table>
              <thead><tr><th>Campaign</th><th>Status</th><th>Budget</th><th>Note</th></tr></thead>
              <tbody id="campaigns-tbody">
                <tr><td colspan="4" class="text-3" style="text-align:center;padding:18px;">Loading…</td></tr>
              </tbody>
            </table>
          </div>
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
  var REFRESH_MS = 90000;
  var refreshTimer = null;
  var chartInstances = {};
  var state = {
    currency: 'USD',
    minorFactor: 100,
    workspaceId: null,
    locale: 'EN',
  };

  function isArabic() { return state.locale === 'AR'; }
  function lbl(en, ar) { return isArabic() ? ar : en; }
  var KPI_LABELS_EN = {
    spend: 'Spend', impressions: 'Impressions', reach: 'Reach (latest day)',
    clicks: 'Clicks', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', messages: 'Messages',
  };
  var KPI_LABELS_AR = {
    spend: 'الإنفاق', impressions: 'مرات الظهور', reach: 'الوصول (آخر يوم)',
    clicks: 'النقرات', ctr: 'تفاعل الإعلان', cpc: 'تكلفة النقرة', cpm: 'تكلفة الوصول لألف شخص', messages: 'الرسائل',
  };
  function kpiLabel(key) {
    var map = isArabic() ? KPI_LABELS_AR : KPI_LABELS_EN;
    return map[key] || key;
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return d != null ? n.toFixed(d) : String(n);
  }
  function fmtPctLocal(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(2) + '%';
  }
  // Convert a BigInt-or-Number minor-unit value to a human currency string
  // honouring the connected ad-account's currency + minorFactor.
  function fmtCurrencyMinor(minorVal) {
    if (minorVal == null || isNaN(Number(minorVal))) return '—';
    var major = Number(minorVal) / state.minorFactor;
    if (state.minorFactor === 1) major = Math.round(major);
    return major.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: state.minorFactor === 1 ? 0 : 2, maximumFractionDigits: state.minorFactor === 1 ? 0 : 2 }) + ' ' + state.currency;
  }
  function fmtCurrencyMajor(n) {
    if (n == null || isNaN(n)) return '—';
    if (state.minorFactor === 1) {
      return Math.round(Number(n)).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + state.currency;
    }
    return Number(n).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + state.currency;
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
      ? ('Synced ' + formatLastUpdated(synced))
      : ('Updated ' + formatLastUpdated(new Date()));
  }

  // ── Chart.js wrapper ────────────────────────────────────────────────────
  function makeLineChart(canvasId, labels, datasets, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].data.labels = labels;
      chartInstances[canvasId].data.datasets = datasets;
      chartInstances[canvasId].update('none');
      return chartInstances[canvasId];
    }
    var ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
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
          x: { grid: { color: '#232326' }, ticks: { color: '#5a5a6a', maxTicksLimit: (opts && opts.maxTicks) || 7, font: { size: 11 } } },
          y: { grid: { color: '#232326' }, ticks: { color: '#5a5a6a', font: { size: 11 } } }
        },
        elements: { point: { radius: 0, hoverRadius: 4 } }
      }
    });
    return chartInstances[canvasId];
  }

  // ── Hero cards ──────────────────────────────────────────────────────────
  function findKpi(dashData, key) {
    return (dashData.kpis || []).find(function (k) { return k.key === key; });
  }
  function renderHero(dashData, insights90) {
    var arr = Array.isArray(insights90) ? insights90 : [];
    var spendKpi = findKpi(dashData, 'spend');
    var spend7 = sumMinor(arr.slice(0, 7));
    var spend90 = sumMinor(arr);

    // 30d hero: authoritative KPI from getDashboard DTO (single source of truth).
    if (spendKpi && spendKpi.display) {
      document.getElementById('hero-30-val').textContent = spendKpi.display;
    } else {
      document.getElementById('hero-30-val').textContent = fmtCurrencyMinor(sumMinor(arr.slice(0, 30)));
    }

    document.getElementById('hero-7-val').textContent = fmtCurrencyMinor(spend7);
    var lifeMinor = (dashData.lifetimeSpend && dashData.lifetimeSpend.syncedAt != null)
      ? dashData.lifetimeSpend.minor
      : spend90; // fallback if lifetime sync pending
    document.getElementById('hero-life-val').textContent = fmtCurrencyMinor(lifeMinor);

    function applyDelta(el, pct, goodWhenUp) {
      if (pct == null) { el.className = 'hero-delta flat'; el.textContent = '→ —'; return; }
      var up = pct >= 0;
      var arrow = up ? '↑' : '↓';
      var cls = (up === !!goodWhenUp) ? 'up' : 'down';
      // Spend going up is bad for cost-control; goodWhenUp = false
      el.className = 'hero-delta ' + cls;
      el.textContent = arrow + ' ' + Math.abs(pct).toFixed(1) + '% vs prior';
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
    document.getElementById('hero-life-sub').textContent =
      (dashData.lifetimeSpend && dashData.lifetimeSpend.syncedAt)
        ? 'Meta account lifetime total'
        : ('Account history (' + days + '-day window)');
  }

  // ── AI Motion Ticker ─────────────────────────────────────────────────────
  function tickerBadge(severity, kind) {
    if (kind === 'kpi') return 'تحسين';
    if (severity === 'critical' || severity === 'warning') return 'تنبيه';
    return 'تحسين';
  }
  function buildTickerItems(dashData) {
    var items = [];
    var cmoFeedV2 = (dashData.brain && Array.isArray(dashData.brain.cmoFeedV2)) ? dashData.brain.cmoFeedV2 : [];
    cmoFeedV2.slice(0, 6).forEach(function (it) {
      if (it.title) {
        var sev = it.severity === 'CRITICAL' ? 'critical' : it.severity === 'HIGH' ? 'warning' : 'success';
        items.push({
          badge: tickerBadge(sev, 'feed'),
          severity: sev,
          text: it.title + ' — ' + (it.campaignName || ''),
        });
      }
    });
    var issues = Array.isArray(dashData.issues) ? dashData.issues : [];
    issues.slice(0, 5).forEach(function (iss) {
      var sev = (iss.severity || 'low').toLowerCase();
      items.push({
        badge: 'تنبيه',
        severity: sev === 'critical' ? 'critical' : sev === 'high' ? 'warning' : sev === 'medium' ? 'warning' : 'success',
        text: (iss.title || iss.code || 'observation') + (iss.recommendations ? ' — ' + (Array.isArray(iss.recommendations) ? iss.recommendations[0] : iss.recommendations) : ''),
      });
    });
    var kpis = Array.isArray(dashData.kpis) ? dashData.kpis : [];
    kpis.slice(0, 4).forEach(function (k) {
      if (k.deltaPct == null) return;
      var dir = k.direction === 'up' ? 'ارتفاع' : 'انخفاض';
      items.push({
        badge: 'تحسين',
        severity: k.direction === 'up' ? (k.goodWhenUp === false ? 'warning' : 'success') : (k.goodWhenUp === false ? 'success' : 'warning'),
        text: (k.label || k.key) + ' ' + dir + ' ' + Math.abs(Number(k.deltaPct) * 100).toFixed(1) + '% — مراقبة وتحسين تلقائي',
      });
    });
    if (items.length === 0) {
      items.push({ badge: 'تحسين', severity: 'success', text: 'يراقب الذكاء الاصطناعي حسابك · لا توجد تنبيهات نشطة' });
    }
    return items;
  }
  function renderTicker(items) {
    if (!items || items.length === 0) return;
    var wrap = document.getElementById('ticker-wrap');
    var track = document.getElementById('ticker-track');
    var html = items.concat(items).map(function (it) {
      var badgeHtml = it.badge
        ? '<span class="ticker-badge">' + escHtml(it.badge) + '</span>'
        : '';
      return '<span class="ticker-item">'
        + '<span class="ticker-dot ' + it.severity + '"></span>'
        + badgeHtml
        + '<span class="ticker-text" dir="auto">' + escHtml(it.text) + '</span>'
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
          + '<span class="active-name" dir="auto" title="' + escHtml(c.name) + '">' + escHtml(c.name || '—') + '</span>'
        + '</div>'
        + '<div class="active-meta-row"><span>' + escHtml(c.objective || 'OBJECTIVE') + '</span><b>' + escHtml(budget) + '</b></div>'
      + '</div>';
    }).join('');
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
      list.innerHTML = '<div class="v2-action-empty">' + escHtml(lbl(
        'Account is steady — no strategic actions needed right now.',
        'الحساب مستقر — لا توجد إجراءات استراتيجية الآن.'
      )) + '</div>';
      sub.textContent = lbl('All clear', 'كل شيء مستقر');
      return;
    }
    list.innerHTML = cards.slice(0, 6).map(function (c) {
      return '<div class="strategy-card ' + c.sev + '">'
        + '<div class="strategy-head"><div class="strategy-title">' + escHtml(c.title) + '</div></div>'
        + '<div class="strategy-body">' + escHtml(c.body) + '</div>'
      + '</div>';
    }).join('');
    sub.textContent = cards.length + ' ' + lbl(cards.length === 1 ? 'insight' : 'insights', cards.length === 1 ? 'رؤية' : 'رؤى');
  }

  // ── Advanced: KPI / Issues / Campaign table ─────────────────────────────
  function renderKpis(kpis) {
    var grid = document.getElementById('kpi-grid');
    if (!kpis || kpis.length === 0) { grid.innerHTML = '<div class="text-3 text-sm">No KPI data available.</div>'; return; }
    grid.innerHTML = kpis.map(function (k) {
      var deltaClass = 'flat', arrow = '→';
      if (k.deltaPct != null) {
        var good = k.goodWhenUp !== false;
        var up = k.direction === 'up';
        if (up)   { deltaClass = good ? 'up-good' : 'up-bad'; arrow = '↑'; }
        else      { deltaClass = good ? 'down-bad' : 'down-good'; arrow = '↓'; }
      }
      // deltaPct is stored as a ratio (0.05 = 5%) — multiply before display.
      var deltaHtml = k.deltaPct != null
        ? '<div class="kpi-delta ' + deltaClass + '">' + arrow + ' ' + Math.abs(Number(k.deltaPct) * 100).toFixed(1) + '%</div>'
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
    el.innerHTML = issues.map(function (iss) {
      var sev = (iss.severity || 'low').toUpperCase();
      var causes = Array.isArray(iss.causes) ? iss.causes.join(', ') : (iss.causes || '');
      var recs = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      return '<div style="padding:10px 0;border-top:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'
          + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + escHtml(iss.title || iss.code) + '</div>'
          + severityBadge(sev)
        + '</div>'
        + (causes ? '<div class="text-sm text-2" style="margin-top:3px;">' + escHtml(causes) + '</div>' : '')
        + (recs ? '<div class="text-xs text-3" style="margin-top:2px;font-style:italic;">' + escHtml(recs) + '</div>' : '')
      + '</div>';
    }).join('');
  }

  function renderCampaignsTable(best, worst, allCampaigns) {
    var tbody = document.getElementById('campaigns-tbody');
    var rows = [];
    function row(c, note) {
      var budget = c.dailyBudget
        ? fmtCurrencyMinor(c.dailyBudget) + '/day'
        : (c.lifetimeBudget ? fmtCurrencyMinor(c.lifetimeBudget) + ' total' : '—');
      return '<tr>'
        + '<td><div style="font-weight:600;">' + escHtml(c.name || '—') + '</div>'
          + '<div class="text-xs text-3">' + escHtml(c.objective || '') + '</div></td>'
        + '<td>' + statusBadge(c.status || 'UNKNOWN') + '</td>'
        + '<td>' + escHtml(budget) + '</td>'
        + '<td class="text-xs text-3">' + escHtml(note || '') + '</td>'
      + '</tr>';
    }
    if (best)  rows.push(row(best,  '⭐ Best'));
    if (worst) rows.push(row(worst, '⚠ Worst'));
    var seen = new Set([best && best.id, worst && worst.id].filter(Boolean));
    (allCampaigns || []).forEach(function (c) { if (!seen.has(c.id)) rows.push(row(c, '')); });
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="4" class="text-3" style="text-align:center;padding:18px;">No campaigns found.</td></tr>';
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
  function renderMainMove(dashData, kpis) {
    var card = document.getElementById('main-move-card');
    var meta = document.getElementById('main-move-meta');
    var label = document.getElementById('main-move-label');
    if (!card) return;
    try {
    if (label) label.textContent = lbl('Main Move', 'الخطوة الأهم');
    var items = buildAllMoveItems(dashData);
    if (items.length === 0) {
      if (meta) meta.textContent = lbl('All clear', 'كل شيء مستقر');
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
    } catch (e) {
      console.error('[dashboard] renderMainMove failed:', e);
      card.innerHTML = '<div class="main-move-empty">' + escHtml(lbl(
        'No actions for today. Account is steady.',
        'لا توجد إجراءات اليوم. حسابك مستقر.'
      )) + '</div>';
    }
  }

  // ── V2: Spotlight ───────────────────────────────────────────────────────
  function deriveOpportunity(dashData) {
    if (!dashData) return null;
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
  function priorityBadgeClass(p) {
    if (p === 'CRITICAL') return 'badge-red';
    if (p === 'HIGH') return 'badge-yellow';
    return 'badge-green';
  }
  function renderBrainSection(brain, dashData) {
    if (!brain) return;
    var mainPrimary = dashData ? buildAllMoveItems(dashData)[0] : null;
    var skipTitle = mainPrimary ? mainPrimary.title : '';
    // CMO Feed
    var feedHost = document.getElementById('brain-cmo-feed');
    var feedSection = document.getElementById('brain-cmo-feed-section');
    var meta = document.getElementById('brain-cmo-feed-meta');
    var items = (brain.cmoFeedV2 || []).filter(function (it) {
      return !skipTitle || !textsOverlap(it.title, skipTitle);
    });
    var feedMeta = brain.cmoFeedMeta || {};
    var windowKey = feedMeta.window || 'today';
    var windowLabel = windowKey === 'rolling' ? 'most recent' : 'today';
    var shown = items.length;
    var total = feedMeta.total != null ? feedMeta.total : shown;
    if (items.length === 0) {
      feedHost.innerHTML = '<div class="empty-state" style="padding:24px 18px;">'
        + '<div class="empty-text">'
        + (windowKey === 'rolling' ? 'No recent decisions.' : 'No active decisions today.')
        + '</div></div>';
    } else {
      feedHost.innerHTML = items.map(function (it, idx) {
        var isPending = !it.generatedAt;
        var title = escHtml(it.title || it.campaignName || 'AI decision');
        var bodyInner;
        var expandBtn = '';
        if (isPending) {
          bodyInner = escHtml('AI summary pending…');
        } else {
          bodyInner = '<span class="cmo-feed-body-text">' + escHtml(it.body) + '</span>';
          if (it.bodyFull) {
            expandBtn = ' <button type="button" class="cmo-feed-expand" data-expanded="0" style="background:none;border:none;padding:0;font-size:13px;color:var(--accent);cursor:pointer;">عرض المزيد</button>';
          }
        }
        var dir = it.creativeDirective
          ? '<div style="margin-top:6px;font-size:12px;color:var(--text-3);"><strong>Creative directive:</strong> ' + escHtml(it.creativeDirective) + '</div>'
          : '';
        return '<div class="card" style="padding:14px;" data-key="' + escHtml(it.dedupeKey) + '" data-idx="' + idx + '">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
          +   '<span class="badge ' + priorityBadgeClass(it.severity) + '">' + escHtml(it.severity) + '</span>'
          +   '<span class="text-xs text-3">' + escHtml(it.campaignName) + ' · ' + escHtml(it.date) + '</span>'
          + '</div>'
          + '<div style="font-size:15px;font-weight:600;color:var(--text);">' + title + '</div>'
          + '<div class="cmo-feed-body" style="font-size:13px;color:var(--text-2);margin-top:4px;line-height:1.5;">' + bodyInner + expandBtn + '</div>'
          + dir
        + '</div>';
      }).join('');
      feedHost.onclick = function (e) {
        var btn = e.target.closest('.cmo-feed-expand');
        if (!btn) return;
        var card = btn.closest('[data-key]');
        if (!card) return;
        var idx = parseInt(card.getAttribute('data-idx'), 10);
        var it = items[idx];
        if (!it || !it.bodyFull) return;
        var textEl = card.querySelector('.cmo-feed-body-text');
        if (!textEl) return;
        var expanded = btn.getAttribute('data-expanded') === '1';
        if (expanded) {
          textEl.innerHTML = escHtml(it.body);
          btn.textContent = 'عرض المزيد';
          btn.setAttribute('data-expanded', '0');
        } else {
          textEl.innerHTML = escHtml(it.bodyFull);
          btn.textContent = 'عرض أقل';
          btn.setAttribute('data-expanded', '1');
        }
      };
    }
    if (total > shown) {
      meta.textContent = 'Showing ' + shown + ' of ' + total + ' decisions · ' + windowLabel;
    } else {
      meta.textContent = shown + ' decision' + (shown === 1 ? '' : 's') + ' · ' + windowLabel;
    }
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
  function updatePulseLabels() {
    var el;
    el = document.getElementById('brain-pulse-burn-label');
    if (el) el.textContent = lbl('Spend pace', 'سرعة الإنفاق');
    el = document.getElementById('brain-pulse-burn-meta');
    if (el) el.textContent = lbl('campaigns', 'حملات');
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
    function armTimer() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(refreshDashboard, REFRESH_MS);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refreshDashboard();
        armTimer();
      } else if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    });
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
  }

  // ── Render / refresh dashboard sections ─────────────────────────────────
  function applyDashboardData(dashData, insights, campaigns, wsData, isInitial) {
    dashData = dashData || {};
    insights = Array.isArray(insights) ? insights : [];
    campaigns = Array.isArray(campaigns) ? campaigns : [];
    try {
      if (dashData.workspace && dashData.workspace.locale) {
        state.locale = String(dashData.workspace.locale).toUpperCase();
      }
      hydrateCurrencyState(dashData, wsData);

      if (isInitial && wsData) {
        var allStale = Array.isArray(wsData.adAccounts)
          && wsData.adAccounts.length > 0
          && wsData.adAccounts.every(function (a) { return a.status !== 'ACTIVE'; });
        if (allStale) document.getElementById('stale-banner').style.display = 'flex';
      }

      var workspaceId = state.workspaceId;
      var wsName = (dashData.workspace && (dashData.workspace.name || dashData.workspace.id)) || workspaceId;
      var wsNameEl = document.getElementById('ws-name'); if (wsNameEl) wsNameEl.textContent = wsName;
      var subtitleEl = document.getElementById('dash-subtitle');
      if (subtitleEl) {
        subtitleEl.innerHTML = 'Past 30 days · ' + escHtml(wsName) + ' · <span id="dash-last-updated" class="text-3">—</span>';
      }
      document.getElementById('chart-panel-meta').textContent = state.currency;
      updateLastUpdatedLabel(dashData);

      renderHero(dashData, insights);
      renderExecutivePulse(dashData);
      renderTicker(buildTickerItems(dashData));
      renderActiveAds(campaigns);
      renderBrainBox(dashData);

      if (dashData.brain) {
        renderBrainSection(dashData.brain, dashData);
      }

      var dashKpis = Array.isArray(dashData.kpis) ? dashData.kpis : [];
      var kpis = dashKpis.length > 0 ? dashKpis : buildKpisFromInsights(insights);
      renderMainMove(dashData, kpis);
      renderSpotlight(dashData.bestCampaign, deriveOpportunity(dashData));

      renderKpis(kpis);

      var last30 = recentAsc(insights, 30);
      var labels = last30.map(function (d) { return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
      var spendSeriesMajor = last30.map(function (d) { return (Number(d.spend) || 0) / state.minorFactor; });
      var ctrSeries        = last30.map(function (d) { return Number(d.ctr) || 0; });
      var impSeries        = last30.map(function (d) { return Number(d.impressions) || 0; });

      if (dashData.trendSeries && Array.isArray(dashData.trendSeries.dates)) {
        var ts = dashData.trendSeries;
        var tsLabels = ts.dates.map(function (d) {
          var dateVal = d && typeof d === 'object' ? d.date : d;
          return new Date(dateVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        if (Array.isArray(ts.spend))    spendSeriesMajor = ts.spend.map(function (s) { return Number(s) / state.minorFactor; });
        if (Array.isArray(ts.ctr))      ctrSeries        = ts.ctr.map(Number);
        if (Array.isArray(ts.messages)) impSeries        = ts.messages.map(Number);
        labels = tsLabels;
      }

      makeLineChart('chart-spend-main', labels, [{ label: lbl('Spend', 'الإنفاق'), data: spendSeriesMajor, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.12)', fill: true, tension: 0.4, borderWidth: 2 }], { maxTicks: 10 });
      makeLineChart('chart-ctr',        labels, [{ label: lbl('Ad engagement (%)', 'تفاعل الإعلان (٪)'),  data: ctrSeries, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.4 }]);
      makeLineChart('chart-impressions', labels, [{ label: lbl('Messages', 'الرسائل'), data: impSeries, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.4 }]);

      renderIssues(Array.isArray(dashData.issues) ? dashData.issues : []);
      renderCampaignsTable(dashData.bestCampaign, dashData.worstCampaign, campaigns);
    } catch (e) {
      console.error('[dashboard] applyDashboardData failed:', e);
      if (isInitial) throw e;
    }
  }

  // ── Main init ───────────────────────────────────────────────────────────
  async function init() {
    try {
      forceRevealAfterTimeout('loading-state', 'dashboard-content', 5000);

      var token = getToken();
      if (!token) { window.location.href = '/login'; return; }

      // 1) Identify user — shared shell init (timeout-bounded)
      var me = await initAppShell();
      if (!me) return;
      state.locale = (me.locale || 'EN').toUpperCase();
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

      // 3) Parallel data fetch (each call bounded; failures degrade gracefully)
      var results = await Promise.all([
        apiFetchWithTimeout('/api/dashboard/' + workspaceId, {}, 15000).catch(function (e) { console.warn('[dashboard] dashboard fetch failed:', e); return {}; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/insights?days=90', {}, 15000).catch(function () { return []; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId + '/campaigns', {}, 15000).catch(function () { return []; }),
        apiFetchWithTimeout('/api/workspaces/' + workspaceId, {}, 15000).catch(function () { return null; }),
      ]);
      var dashData = results[0] || {};
      if (dashData.workspace && dashData.workspace.locale) {
        state.locale = String(dashData.workspace.locale).toUpperCase();
      }
      var insights = results[1] || [];
      var campaigns = results[2] || [];
      var wsData = results[3];

      // 4) Empty state — no ad account connected
      if (dashData.empty) {
        hideLoadingShowDashboard();
        document.getElementById('hero-grid').innerHTML =
          '<div class="empty-state" style="grid-column:1/-1;">'
          + '<div class="empty-icon">📊</div>'
          + '<div class="empty-title">' + lbl('Connect your Meta Ads account', 'اربط حساب إعلانات Meta') + '</div>'
          + '<div class="empty-text">' + lbl('Link your ad account to see spend, engagement, reach, and AI-powered recommendations.', 'اربط حسابك الإعلاني لرؤية الإنفاق وتفاعل الإعلان والوصول والتوصيات الذكية.') + '</div>'
          + '<a href="/workspace" class="btn btn-primary" style="margin-top:14px;">Go to Workspace</a>'
        + '</div>';
        return;
      }

      try {
        applyDashboardData(dashData, insights, campaigns, wsData, true);
        startAutoRefresh(workspaceId);
      } catch (renderErr) {
        console.error('[dashboard] init render failed:', renderErr);
      }
      hideLoadingShowDashboard();

    } catch (err) {
      console.error('[dashboard] init failed:', err);
      hideLoadingShowDashboard();
      showError('Failed to load dashboard: ' + (err.message || String(err)));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
</script>`;

  return layout({ title: 'Dashboard', active: 'dashboard', content, scripts, extraHead, mode: 'pro' });
}
