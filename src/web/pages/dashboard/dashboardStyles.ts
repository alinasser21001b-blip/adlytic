// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/dashboardStyles.ts
//
//  Dashboard-page CSS. Consumed as `extraHead` by dashboardPage composer.
//  Extracted from dashboardPage.ts as part of the modular refactor.
//  Contains ONLY presentational rules — no data bindings, no logic.
// ════════════════════════════════════════════════════════════════════════

export const dashboardStyles = `<style>
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
      align-items: start;
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
      max-height: 420px;
      align-self: start;
      overflow: hidden;
    }
    .chart-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-shrink: 0; }
    .chart-panel-title { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .chart-panel-meta  { font-size: 11.5px; color: var(--text-3); }
    .chart-panel-canvas {
      position: relative;
      flex: 0 0 auto;
      height: 300px;
      max-height: 300px;
      min-height: 240px;
      overflow: hidden;
    }
    .chart-panel-canvas canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
      max-height: 300px;
    }

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

    /* Onboarding sync overlay */
    .onboarding-overlay {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(10,10,11,0.92);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .onboarding-card {
      width: 100%; max-width: 440px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 36px 32px;
      text-align: center;
    }
    .onboarding-icon {
      width: 56px; height: 56px; margin: 0 auto 18px;
      background: var(--accent-dim);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px;
    }
    .onboarding-title { font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
    .onboarding-msg { font-size: 14px; color: var(--text-2); line-height: 1.6; min-height: 44px; margin-bottom: 20px; }
    .onboarding-progress {
      height: 6px; background: var(--surface-2);
      border-radius: 999px; overflow: hidden; margin-bottom: 10px;
    }
    .onboarding-progress-bar {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      border-radius: 999px;
      transition: width 0.6s ease;
    }
    .onboarding-meta { font-size: 12px; color: var(--text-3); }

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
    .main-move-primary.steady { border-left: 4px solid var(--success); }
    .main-move-steady-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .main-move-steady-item {
      font-size: 12.5px; color: var(--text-2); line-height: 1.55;
      padding: 8px 10px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border);
    }
    .main-move-steady-item b { color: var(--text); font-weight: 600; }
    .main-move-benchmarks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
    .main-move-benchmark {
      font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
    }
    .main-move-benchmark.positive { color: var(--success); background: var(--success-dim); border-color: rgba(34,197,94,0.25); }
    .main-move-benchmark.negative { color: var(--warning); background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.25); }
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

    .main-move-cta:disabled { opacity: 0.55; cursor: default; filter: none; }

    .below-chart-section { margin-top: 4px; }
    .below-chart-section + .below-chart-section { margin-top: 18px; }
    #main-move-section { margin-top: 18px; }
    .action-modal-steps { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .action-modal-step {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 12px; border-radius: 8px;
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: 13px; color: var(--text-2); line-height: 1.55;
    }
    .action-modal-step b {
      width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
      background: var(--accent-dim); color: var(--accent-2);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800;
    }

  </style>`;
