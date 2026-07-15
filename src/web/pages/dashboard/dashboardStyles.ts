// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/dashboardStyles.ts
//
//  Dashboard-page CSS. Consumed as `extraHead` by dashboardPage composer.
//  Extracted from dashboardPage.ts as part of the modular refactor.
//  Contains ONLY presentational rules — no data bindings, no logic.
// ════════════════════════════════════════════════════════════════════════

export const dashboardStyles = `<style>
    /* Dashboard shell — centered reading column inside already-centered page-content */
    #dashboard-content {
      max-width: 1180px;
      width: 100%;
      margin-left: auto;
      margin-right: auto;
    }
    #dashboard-content .page-header { margin-bottom: 18px; }
    #dashboard-content .page-title { font-size: 24px; letter-spacing: -0.03em; }
    #dashboard-content .page-subtitle { font-size: 13px; color: var(--text-3); margin-top: 4px; }

    /* Premium spend hero cards */
    .hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
    @media (max-width: 800px) { .hero-grid { grid-template-columns: 1fr; } }
    .hero-card {
      position: relative;
      background: linear-gradient(160deg, rgba(255,255,255,0.03) 0%, var(--surface) 45%, var(--surface-2) 100%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 18px 20px 16px;
      overflow: hidden;
      transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
    }
    .hero-card::before {
      content: ''; position: absolute; inset-inline-start: 0; top: 14px; bottom: 14px; width: 3px;
      border-radius: 999px;
      background: linear-gradient(180deg, var(--accent), transparent);
      opacity: 0.85; pointer-events: none;
    }
    .hero-card:hover { border-color: rgba(217,167,89,0.35); box-shadow: 0 10px 28px rgba(0,0,0,0.22), var(--shadow-inner-glow); transform: translateY(-3px); }
    .hero-card.success::before { background: linear-gradient(180deg, var(--success), transparent); }
    .hero-card.warning::before { background: linear-gradient(180deg, var(--warning), transparent); }
    .hero-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-3); }
    .hero-value {
      font-family: var(--font-display);
      font-size: 30px; font-weight: 800; color: var(--accent-2);
      letter-spacing: -0.04em; margin-top: 10px; line-height: 1.05;
      font-variant-numeric: tabular-nums;
    }
    .hero-sub   { font-size: 12px; color: var(--text-3); margin-top: 6px; }
    .hero-delta {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px; font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .hero-delta.up   { color: var(--success); background: var(--success-dim); }
    .hero-delta.down { color: var(--error);   background: var(--error-dim); }
    .hero-delta.flat { color: var(--text-3);  background: rgba(255,255,255,0.04); }

    /* AI Monitor — readable signal grid (replaces scrolling marquee) */
    .ticker-wrap {
      position: relative;
      background:
        linear-gradient(165deg, rgba(217,167,89,0.05), transparent 40%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 0;
      margin-bottom: 18px;
      overflow: hidden;
      box-shadow: var(--shadow-inner-glow);
    }
    .ticker-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .ticker-header-left { display: flex; align-items: center; gap: 8px; }
    .ticker-live-dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--success);
      box-shadow: 0 0 0 4px rgba(52,168,113,0.14);
      animation: ticker-pulse 2s ease-in-out infinite;
    }
    @keyframes ticker-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.88); } }
    .ticker-header-title { font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--text); }
    .ticker-freshness {
      font-size: 11px; color: var(--text-3); display: flex; align-items: center; gap: 6px;
      padding: 3px 9px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03);
      font-variant-numeric: tabular-nums;
    }
    .ticker-freshness-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--success); flex-shrink: 0; }
    .ticker-freshness-dot.stale { background: var(--warning); }
    .ticker-scroll-area { padding: 12px 14px 14px; overflow: visible; mask-image: none; }
    .ticker-track {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 0;
      white-space: normal;
      animation: none;
    }
    .ticker-item {
      display: flex; flex-direction: column; gap: 8px;
      min-width: 0;
      font-size: 13px; color: var(--text);
      padding: 12px 13px; border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
      cursor: default; position: relative;
    }
    .ticker-item:hover {
      border-color: rgba(217,167,89,0.28);
      background: rgba(217,167,89,0.05);
      transform: translateY(-1px);
    }
    .ticker-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ticker-icon {
      width: 28px; height: 28px; border-radius: 9px;
      display: grid; place-items: center;
      background: rgba(217,167,89,0.1); color: var(--accent-2);
      font-size: 13px; flex-shrink: 0;
    }
    .ticker-dot  { display: none; }
    .ticker-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
      padding: 3px 8px; border-radius: 999px; white-space: nowrap;
    }
    .ticker-badge.cat-strategy { color: var(--accent-2); background: var(--accent-dim); }
    .ticker-badge.cat-alert { color: var(--warning); background: rgba(199,122,31,0.12); }
    .ticker-badge.cat-performance { color: var(--success); background: rgba(52,168,113,0.1); }
    .ticker-badge.cat-insight { color: var(--text-2); background: rgba(255,255,255,0.05); }
    .ticker-text {
      font-size: 13px; font-weight: 700; color: var(--text);
      line-height: 1.35; letter-spacing: -0.01em;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      font-variant-numeric: tabular-nums;
    }
    .ticker-explain {
      font-size: 11px; color: var(--text-3); line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ticker-tooltip { display: none; }
    @media (max-width: 980px) { .ticker-track { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .ticker-track { grid-template-columns: 1fr; } }

    /* AI Context Strip — structured account snapshot tiles */

    /* Active Ads Showcase Grid */
    .active-section { margin-bottom: 22px; }
    .active-header {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 12px; gap: 10px;
    }
    .active-title { font-size: 12px; font-weight: 800; color: var(--text-3); letter-spacing: 0.06em; }
    .active-meta  { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
    .active-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px;
    }
    .active-card {
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      padding: 13px 14px;
      display: flex; flex-direction: column; gap: 8px;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .active-card:hover { border-color: rgba(217,167,89,0.3); transform: translateY(-1px); }
    .active-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .blink-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 0 0 rgba(52,168,113,0.5);
      animation: blink-pulse 1.6s infinite;
      flex-shrink: 0;
    }
    @keyframes blink-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(52,168,113,0.55); }
      70%  { box-shadow: 0 0 0 8px rgba(52,168,113,0); }
      100% { box-shadow: 0 0 0 0 rgba(52,168,113,0); }
    }
    .active-name { font-size: 13.5px; font-weight: 650; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.45; }
    .active-meta-row { font-size: 12px; color: var(--text-3); display: flex; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
    .active-meta-row b { color: var(--accent-2); font-weight: 700; }

    /* Bottom Split Panel */
    .split-grid {
      display: grid;
      grid-template-columns: minmax(300px, 0.95fr) 1.35fr;
      gap: 14px;
      margin-bottom: 22px;
      align-items: stretch;
    }
    @media (max-width: 1000px) { .split-grid { grid-template-columns: 1fr; } }
    .split-grid.chart-only { grid-template-columns: 1fr; }
    .brain-box {
      background:
        linear-gradient(165deg, rgba(217,167,89,0.04), transparent 38%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 16px 16px 14px;
      display: flex; flex-direction: column; gap: 10px;
      max-height: 420px; overflow-y: auto;
      box-shadow: var(--shadow-inner-glow);
    }
    .brain-box-head {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .brain-box-icon {
      width: 30px; height: 30px; border-radius: 10px;
      background: var(--accent-dim);
      display: flex; align-items: center; justify-content: center;
      color: var(--accent-2); font-weight: 800; font-size: 11px;
      letter-spacing: 0.04em;
    }
    .brain-box-title { font-family: var(--font-display); font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
    .brain-box-sub {
      font-size: 11px; color: var(--text-3); margin-inline-start: auto;
      padding: 3px 9px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03);
      font-variant-numeric: tabular-nums;
    }
    .strategy-card {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 12px 13px;
      display: flex; flex-direction: column; gap: 6px;
      border-inline-start: 3px solid transparent;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .strategy-card:hover { background: rgba(255,255,255,0.035); transform: translateX(-2px); }
    .strategy-card.high     { border-inline-start-color: var(--warning); }
    .strategy-card.critical { border-inline-start-color: var(--error); }
    .strategy-card.medium   { border-inline-start-color: var(--accent); }
    .strategy-card.low      { border-inline-start-color: rgba(52,168,113,0.55); }
    .strategy-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .strategy-title { font-size: 13px; font-weight: 750; color: var(--text); line-height: 1.35; }
    .strategy-sev {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
      white-space: nowrap; flex-shrink: 0; color: var(--text-3); background: rgba(255,255,255,0.04);
    }
    .strategy-card.critical .strategy-sev { color: var(--error); background: var(--error-dim); }
    .strategy-card.high .strategy-sev { color: var(--warning); background: rgba(199,122,31,0.1); }
    .strategy-card.medium .strategy-sev { color: var(--accent-2); background: var(--accent-dim); }
    .strategy-card.low .strategy-sev { color: var(--success); background: var(--success-dim); }
    .strategy-body  { font-size: 12px; color: var(--text-2); line-height: 1.55; }
    .strategy-metric {
      margin-top: 2px; font-family: var(--font-display); font-size: 15px; font-weight: 800; color: var(--accent-2);
      letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
    }

    .chart-panel {
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 18px 18px 16px;
      display: block;
      align-self: stretch;
      overflow: hidden;
      box-shadow: var(--shadow-inner-glow);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .chart-panel:hover { border-color: rgba(255,255,255,0.12); box-shadow: var(--shadow-lg), var(--shadow-inner-glow); }
    .chart-panel-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .chart-panel-title { font-family: var(--font-display); font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
    .chart-panel-meta  { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
    .chart-panel-canvas {
      position: relative;
      height: 280px;
      max-height: 280px;
      min-height: 280px;
      width: 100%;
      overflow: hidden;
      contain: layout size style;
    }
    .chart-panel-canvas > canvas {
      display: block;
      max-width: 100%;
    }
    .chart-empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: var(--text-3); font-size: 13px; text-align: center; direction: rtl;
      background: var(--surface); border-radius: 8px;
    }

    /* Stale-data banner */
    #stale-banner { display: none; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }

    /* Re-used V2 / V6 sections (only what isn't in SHARED_CSS) */
    .v2-section { margin-bottom: 22px; }
    .v2-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .v2-section-kicker {
      font-size: 11px; font-weight: 800; color: var(--accent-2);
      letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .v2-section-title { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: var(--text); }
    .v2-section-sub { font-size: 12.5px; color: var(--text-3); margin-top: 4px; line-height: 1.4; }
    .v2-section-meta  { font-size: 12px; color: var(--text-3); flex-shrink: 0; padding-top: 4px; }
    #main-move-section.main-move-above-fold .v2-section-title { font-size: 20px; }

    .v2-actions, .v2-recovery-card, .v2-insight {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
    .v2-action-row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
    .v2-action-row:last-child { border-bottom: none; }
    .v2-action-priority { width: 28px; height: 28px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--text-2); flex-shrink: 0; }
    .v2-action-row[data-pri="1"] .v2-action-priority { background: var(--accent-dim); color: var(--accent-2); border-color: rgba(217,167,89,0.35); }
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


    .v2-insights { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .v2-insight { padding: 12px 14px; }
    .v2-insight-icon  { font-size: 16px; margin-bottom: 4px; }
    .v2-insight-title { font-size: 12.5px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
    .v2-insight-text  { font-size: 12px; color: var(--text-2); line-height: 1.5; }

    .v2-advanced {
      margin-top: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      background: rgba(255,255,255,0.015);
      overflow: hidden;
    }
    .v2-advanced summary {
      cursor: pointer; list-style: none;
      padding: 14px 18px;
      background: var(--surface);
      border-bottom: 1px solid transparent;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      font-size: 14px; font-weight: 800; color: var(--text);
    }
    .v2-advanced[open] summary { border-bottom-color: rgba(255,255,255,0.06); }
    .v2-advanced summary::-webkit-details-marker { display: none; }
    .v2-advanced summary::after { content: '▾'; color: var(--text-3); transition: transform 0.2s; flex-shrink: 0; }
    .v2-advanced[open] summary::after { transform: rotate(180deg); }
    .v2-advanced summary span { color: var(--text-3); font-weight: 500; font-size: 12px; }
    .v2-advanced-body { padding: 0; }

    /* Centered advanced analytics shell — one clear reading column */
    .adv-shell {
      max-width: 980px;
      margin: 0 auto;
      padding: 20px 18px 28px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      direction: rtl;
    }
    .adv-panel {
      background:
        linear-gradient(175deg, rgba(255,255,255,0.015) 0%, transparent 40%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 18px;
      padding: 20px 20px 18px;
      width: 100%;
      box-shadow: var(--shadow-inner-glow);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .adv-panel:hover { border-color: rgba(255,255,255,0.12); box-shadow: 0 6px 24px rgba(0,0,0,0.15), var(--shadow-inner-glow); }
    .adv-panel-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
    }
    .adv-panel-kicker {
      font-size: 10.5px; font-weight: 800; color: var(--accent-2);
      letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .adv-panel-title { font-family: var(--font-display); font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
    .adv-panel-sub { font-size: 12.5px; color: var(--text-3); margin-top: 4px; line-height: 1.45; }
    .adv-panel-meta {
      font-size: 11.5px; color: var(--text-3);
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03);
      font-variant-numeric: tabular-nums;
    }

    .adv-pulse-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    @media (max-width: 720px) {
      .adv-pulse-grid { grid-template-columns: 1fr; }
    }
    .adv-pulse-card {
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      padding: 14px 14px 12px;
      min-width: 0;
    }
    .adv-pulse-label { font-size: 11.5px; font-weight: 700; color: var(--text-3); margin-bottom: 8px; }
    .adv-pulse-value {
      font-family: var(--font-display);
      font-size: 22px; font-weight: 800; color: var(--accent-2);
      letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1.1;
    }
    .adv-pulse-sub { font-size: 11.5px; color: var(--text-3); margin-top: 6px; }

    .adv-kpi-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-bottom: 0;
    }
    @media (max-width: 900px) {
      .adv-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .adv-kpi-grid { grid-template-columns: 1fr; }
    }

    .adv-chart-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-bottom: 0;
    }
    @media (max-width: 1100px) {
      .adv-chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 700px) {
      .adv-chart-grid { grid-template-columns: 1fr; }
    }
    .chart-card-sub {
      font-size: 11px;
      color: var(--text-3);
      margin-top: 2px;
      font-weight: 500;
      line-height: 1.35;
    }

    .adv-shell .diagnosis-grid {
      grid-template-columns: 1fr;
      margin-bottom: 0;
    }
    @media (min-width: 820px) {
      .adv-shell .diagnosis-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
      }
    }
    .adv-shell .diagnosis-card { max-width: none; width: 100%; }
    .adv-shell .attribution-card {
      margin: 0; border: none; background: transparent; padding: 0;
    }

    /* ═══ COMMAND BAR ═══ */
    .cmd-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      box-shadow: var(--shadow-inner-glow);
      direction: rtl;
    }
    .cmd-bar-right { display: flex; align-items: center; gap: 10px; }
    .cmd-bar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .cmd-health-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 999px;
      font-size: 11.5px; font-weight: 700;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      color: var(--text);
      white-space: nowrap;
    }
    .cmd-health-pill.healthy { border-color: rgba(52,168,113,0.35); background: var(--success-dim); color: var(--success); }
    .cmd-health-pill.warning { border-color: rgba(199,122,31,0.35); background: rgba(199,122,31,0.1); color: var(--warning); }
    .cmd-health-pill.critical { border-color: rgba(226,96,79,0.35); background: var(--error-dim); color: var(--error); }
    .cmd-health-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--text-3); flex-shrink: 0;
    }
    .cmd-health-pill.healthy .cmd-health-dot { background: var(--success); box-shadow: 0 0 0 3px rgba(52,168,113,0.15); }
    .cmd-health-pill.warning .cmd-health-dot { background: var(--warning); }
    .cmd-health-pill.critical .cmd-health-dot { background: var(--error); animation: blink-pulse 1.6s infinite; }
    .cmd-stat {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; color: var(--text-2);
      padding: 4px 10px; border-radius: 999px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .cmd-stat svg { color: var(--text-3); flex-shrink: 0; }
    .cmd-refresh-btn {
      width: 32px; height: 32px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--text-2); cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.15s;
    }
    .cmd-refresh-btn:hover { background: var(--accent-dim); border-color: rgba(217,167,89,0.35); color: var(--accent-2); }
    .cmd-refresh-btn:active { transform: scale(0.92); }
    .cmd-refresh-btn.spinning svg { animation: cmd-spin 0.8s linear infinite; }
    @keyframes cmd-spin { to { transform: rotate(360deg); } }
    @media (max-width: 768px) {
      .cmd-bar { flex-wrap: wrap; padding: 10px 12px; gap: 8px; }
      .cmd-bar-left { gap: 6px; }
      .cmd-stat { font-size: 11px; padding: 3px 8px; }
      .cmd-stat-sync { display: none; }
    }

    /* ═══ KPI COMMAND GRID ═══ */
    .kpi-command-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
      direction: rtl;
    }
    @media (max-width: 900px) { .kpi-command-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 520px) { .kpi-command-grid { grid-template-columns: 1fr; gap: 10px; } }
    .kpi-cmd-card {
      position: relative;
      background: linear-gradient(160deg, rgba(255,255,255,0.03) 0%, var(--surface) 45%, var(--surface-2) 100%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 16px 18px 14px;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
      cursor: default;
    }
    .kpi-cmd-card:hover {
      border-color: rgba(217,167,89,0.3);
      box-shadow: 0 8px 24px rgba(0,0,0,0.18), var(--shadow-inner-glow);
      transform: translateY(-2px);
    }
    .kpi-cmd-top {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 8px;
    }
    .kpi-cmd-icon {
      width: 28px; height: 28px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent-dim); color: var(--accent-2);
      flex-shrink: 0;
    }
    .kpi-cmd-icon.success { background: var(--success-dim); color: var(--success); }
    .kpi-cmd-icon.warning { background: rgba(199,122,31,0.1); color: var(--warning); }
    .kpi-cmd-icon.accent { background: var(--accent-dim); color: var(--accent-2); }
    .kpi-cmd-icon.ctr { background: rgba(96,165,250,0.1); color: #60A5FA; }
    .kpi-cmd-icon.cpm { background: rgba(45,212,191,0.1); color: #2DD4BF; }
    .kpi-cmd-bottom {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-top: 8px;
    }
    .kpi-spark {
      flex-shrink: 0;
      opacity: 0.9;
      /* Trend charts read left→right even in an RTL page. */
      direction: ltr;
    }
    .kpi-bench {
      margin-inline-start: auto;
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    .kpi-bench:empty { display: none; }
    .kpi-bench.good { color: var(--success); background: var(--success-dim); }
    .kpi-bench.mid  { color: var(--warning); background: rgba(199,122,31,0.12); }
    .kpi-bench.low  { color: var(--error); background: var(--error-dim); }
    .kpi-cmd-insight {
      font-size: 11.5px;
      color: var(--text-3);
      line-height: 1.45;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.05);
      min-height: 0;
      transition: opacity 0.25s;
    }
    .kpi-cmd-insight:empty { display: none; }
    @media (max-width: 520px) {
      .kpi-cmd-card { padding: 14px 16px 12px; }
      .kpi-cmd-card .hero-value { font-size: 24px; }
    }

    /* ═══ LIVE INSIGHTS ═══ */
    .live-insights-section {
      background:
        linear-gradient(165deg, rgba(217,167,89,0.05), transparent 40%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 0;
      margin-bottom: 16px;
      overflow: hidden;
      box-shadow: var(--shadow-inner-glow);
    }
    .live-insights-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .live-insights-title-row { display: flex; align-items: center; gap: 8px; }
    .live-dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--success);
      box-shadow: 0 0 0 4px rgba(52,168,113,0.14);
      animation: ticker-pulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    .live-insights-title { font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--text); }
    .live-insights-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 12px 14px 14px;
    }
    @media (max-width: 980px) { .live-insights-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .live-insights-grid { grid-template-columns: 1fr; } }
    .live-insight-card {
      display: flex; flex-direction: column; gap: 8px;
      font-size: 13px; color: var(--text);
      padding: 12px 13px; border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      transition: border-color 0.15s, background 0.15s, transform 0.15s;
      cursor: default; position: relative;
    }
    .live-insight-card:hover {
      border-color: rgba(217,167,89,0.28);
      background: rgba(217,167,89,0.05);
      transform: translateY(-1px);
    }
    .live-insight-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .live-insight-icon {
      width: 28px; height: 28px; border-radius: 9px;
      display: grid; place-items: center;
      font-size: 13px; flex-shrink: 0;
    }
    .live-insight-icon.positive { background: var(--success-dim); color: var(--success); }
    .live-insight-icon.negative { background: var(--error-dim); color: var(--error); }
    .live-insight-icon.neutral { background: rgba(217,167,89,0.1); color: var(--accent-2); }
    .live-insight-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
      padding: 3px 8px; border-radius: 999px; white-space: nowrap;
      color: var(--text-3); background: rgba(255,255,255,0.05);
    }
    .live-insight-text {
      font-size: 13.5px; font-weight: 650; color: var(--text);
      line-height: 1.4; letter-spacing: -0.01em;
    }
    .live-insight-sub {
      font-size: 11px; color: var(--text-3); line-height: 1.4;
    }
    /* ═══ SMART TIMELINE ═══ */
    .timeline-section {
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
    }
    .timeline-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px;
      color: var(--text-3);
    }
    .timeline-title { font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--text); }
    .timeline-track {
      display: flex; flex-direction: column; gap: 0;
      position: relative;
      padding-inline-start: 16px;
    }
    .timeline-track::before {
      content: '';
      position: absolute;
      inset-inline-start: 4px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: rgba(255,255,255,0.06);
      border-radius: 999px;
    }
    .timeline-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 0;
      position: relative;
      font-size: 12.5px;
      color: var(--text-2);
      line-height: 1.45;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      inset-inline-start: -16px;
      top: 14px;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid var(--surface);
      z-index: 1;
    }
    .timeline-item.event-sync::before { background: var(--success); }
    .timeline-item.event-alert::before { background: var(--warning); }
    .timeline-item.event-critical::before { background: var(--error); }
    .timeline-item.event-campaign::before { background: var(--accent); }
    .timeline-time {
      font-size: 11px; color: var(--text-3); white-space: nowrap;
      min-width: 55px; flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }
    .timeline-text { flex: 1; min-width: 0; }
    .timeline-text b { color: var(--text); font-weight: 650; }
    @media (max-width: 560px) {
      .timeline-section { padding: 12px 14px; }
      .timeline-item { font-size: 12px; gap: 8px; padding: 6px 0; }
    }

    /* Loading skeleton (presentational — no data bindings) */
    .dash-skeleton { width: 100%; padding: 4px 0; }
    .skeleton-block {
      background: linear-gradient(90deg, var(--surface-2) 25%, rgba(255,255,255,0.04) 50%, var(--surface-2) 75%);
      background-size: 400% 100%;
      animation: skeleton-shimmer 2s ease-in-out infinite;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .skeleton-gauge { height: 140px; margin-bottom: 16px; border-radius: 20px; }
    .skeleton-hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
    @media (max-width: 800px) { .skeleton-hero-grid { grid-template-columns: 1fr; } }
    .skeleton-hero { height: 112px; }
    .skeleton-chart { height: 280px; margin-bottom: 16px; }
    .skeleton-cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .skeleton-card-sm { height: 160px; }
    @media (max-width: 768px) { .skeleton-cards-grid { grid-template-columns: 1fr; } }
    @keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* Onboarding sync overlay */
    .onboarding-overlay {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(16,14,13,0.92);
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
    .onboarding-title { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
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
      margin-bottom: 16px;
      padding: 14px 18px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.07);
      background: var(--surface);
      display: flex;
      align-items: center;
      gap: 12px;
      border-inline-start-width: 4px;
      border-inline-start-style: solid;
    }
    .exec-pulse-banner::before {
      content: '';
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .exec-pulse-banner.healthy {
      border-inline-start-color: var(--success);
      border-left: none;
    }
    .exec-pulse-banner.healthy::before { background: var(--success); box-shadow: 0 0 0 4px rgba(52,168,113,0.14); }
    .exec-pulse-banner.warning {
      border-inline-start-color: var(--warning);
      border-left: none;
      background: rgba(199,122,31,0.06);
    }
    .exec-pulse-banner.warning::before { background: var(--warning); }
    .exec-pulse-banner.critical {
      border-inline-start-color: var(--error);
      border-left: none;
      background: var(--error-dim);
    }
    .exec-pulse-banner.critical::before { background: var(--error); animation: blink-pulse 1.6s infinite; }
    .exec-pulse-main { flex: 1; min-width: 0; }
    .exec-pulse-text { font-size: 14px; font-weight: 650; color: var(--text); line-height: 1.5; }
    .exec-pulse-detail {
      font-size: 12px; color: var(--text-3); font-weight: 500; margin-top: 2px;
    }
    .exec-pulse-score-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .exec-pulse-score-num {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.03em;
    }
    .exec-pulse-score-lbl {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .band-excellent .exec-pulse-score-num { color: var(--success); }
    .band-excellent .exec-pulse-score-lbl { color: var(--success); }
    .band-good .exec-pulse-score-num { color: #7bc67e; }
    .band-good .exec-pulse-score-lbl { color: #7bc67e; }
    .band-attention .exec-pulse-score-num { color: var(--warning); }
    .band-attention .exec-pulse-score-lbl { color: var(--warning); }
    .band-poor .exec-pulse-score-num { color: var(--error); }
    .band-poor .exec-pulse-score-lbl { color: var(--error); }
    .exec-pulse-cta {
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .exec-pulse-cta.cta-critical {
      color: #fff;
      background: var(--error);
      box-shadow: 0 2px 8px rgba(226,96,79,0.3);
    }
    .exec-pulse-cta.cta-critical:hover {
      background: #c8503f;
      box-shadow: 0 4px 14px rgba(226,96,79,0.4);
    }
    .exec-pulse-cta.cta-warning {
      color: var(--warning);
      background: rgba(199,122,31,0.12);
      border: 1px solid rgba(199,122,31,0.25);
    }
    .exec-pulse-cta.cta-warning:hover {
      background: rgba(199,122,31,0.22);
      border-color: rgba(199,122,31,0.4);
    }

    /* ═══ Creative Health strip ═══ */
    .creative-health-strip {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      border-radius: 14px;
      text-decoration: none;
      border: 1px solid rgba(255,255,255,0.08);
      background: var(--surface);
      transition: border-color 0.15s, transform 0.15s;
    }
    .creative-health-strip:hover { transform: translateY(-1px); }
    .creative-health-strip.ch-high { border-color: rgba(226,96,79,0.3); background: rgba(226,96,79,0.05); }
    .creative-health-strip.ch-mid  { border-color: rgba(199,122,31,0.28); background: rgba(199,122,31,0.05); }
    .ch-icon { font-size: 20px; flex-shrink: 0; }
    .ch-body { flex: 1; min-width: 0; }
    .ch-title { font-size: 14px; font-weight: 800; color: var(--text); }
    .ch-sub {
      font-size: 12.5px; color: var(--text-3); margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ch-cta {
      flex-shrink: 0; font-size: 12.5px; font-weight: 700; color: var(--accent-2);
      white-space: nowrap;
    }
    .creative-health-strip:hover .ch-cta { color: var(--accent); }
    @media (max-width: 560px) {
      .creative-health-strip { flex-wrap: wrap; }
      .ch-cta { width: 100%; }
    }

    /* ═══ Quick Actions Bar ═══ */
    .quick-actions-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      overflow-x: auto;
      padding-bottom: 2px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .quick-actions-bar::-webkit-scrollbar { display: none; }
    .qa-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-2);
      text-decoration: none;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.18s ease;
    }
    .qa-chip:hover {
      background: rgba(217,167,89,0.08);
      border-color: rgba(217,167,89,0.2);
      color: var(--accent-2);
      transform: translateY(-1px);
    }
    .qa-icon { font-size: 14px; }
    .qa-label { letter-spacing: -0.01em; }
    @media (max-width: 560px) {
      .qa-chip { padding: 6px 10px; font-size: 11.5px; }
    }

    /* Tier 2 — Main Move unified focus card */
    .main-move-card {
      background:
        radial-gradient(120% 80% at 100% 0%, rgba(217,167,89,0.14), transparent 55%),
        linear-gradient(165deg, rgba(255,255,255,0.03) 0%, var(--surface) 42%);
      border: 1px solid rgba(217,167,89,0.32);
      border-radius: var(--radius-lg);
      overflow: hidden;
      position: relative;
    }
    /* Border beam (Magic UI port): a soft gold segment orbiting the card's
       border via offset-path rect(). Progressive enhancement — browsers
       without rect() offset-path (or reduced-motion users) keep the plain
       border. The ONE signature effect on this page. */
    @supports (offset-path: rect(0 0 auto auto)) {
      @media (prefers-reduced-motion: no-preference) {
        .main-move-card::after {
          content: '';
          position: absolute;
          width: 110px; height: 2px;
          background: linear-gradient(90deg, transparent, var(--accent), var(--accent-2), transparent);
          offset-path: rect(0 auto auto 0 round 12px);
          animation: mm-beam 9s linear infinite;
          pointer-events: none;
        }
        @keyframes mm-beam { to { offset-distance: 100%; } }
      }
    }
    .main-move-primary {
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-inline-start: 4px solid var(--accent);
    }
    .main-move-primary.has-critical { border-inline-start-color: var(--error); border-left: none; }
    .main-move-primary.has-warning { border-inline-start-color: var(--warning); border-left: none; }
    .main-move-tag-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap;
    }
    .main-move-tag {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--accent-2);
    }
    .main-move-sev-pill {
      font-size: 11px; font-weight: 800;
      padding: 3px 10px; border-radius: 999px;
      background: rgba(226,96,79,0.14); color: var(--error);
      border: 1px solid rgba(226,96,79,0.28);
    }
    .main-move-loop {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      margin-bottom: 2px; padding: 8px 12px;
      background: rgba(217,167,89,0.09); border: 1px solid rgba(217,167,89,0.22);
      border-radius: 999px; width: fit-content; max-width: 100%;
    }
    .main-move-loop span { font-size: 11px; font-weight: 800; color: var(--accent-2); }
    .main-move-loop .sep { color: var(--text-3); font-weight: 600; }
    .main-move-title {
      font-family: var(--font-display);
      font-size: 22px; font-weight: 800; color: var(--text);
      line-height: 1.3; letter-spacing: -0.025em;
    }
    .main-move-block { margin-top: 6px; }
    .main-move-block-label {
      font-size: 11px; font-weight: 800; color: var(--accent-2);
      margin-bottom: 4px; letter-spacing: 0.02em;
    }
    .main-move-action-box {
      margin-top: 4px; padding: 14px 16px; border-radius: 12px;
      background: rgba(217,167,89,0.12); border: 1px solid rgba(217,167,89,0.28);
    }
    .main-move-action-text { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.45; }
    .main-move-steps {
      margin: 0; padding-inline-start: 18px;
      color: var(--text-2); font-size: 13.5px; line-height: 1.55;
    }
    .main-move-steps li { margin-bottom: 5px; }
    .main-move-expect {
      margin-top: 4px; padding: 11px 13px; border-radius: 10px;
      font-size: 13px; color: var(--text-2); line-height: 1.5;
      background: rgba(255,255,255,0.03); border: 1px dashed rgba(217,167,89,0.28);
    }
    .main-move-expect b { color: var(--accent-2); }
    .main-move-impact {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--success);
      padding: 5px 11px;
      border-radius: 999px;
      background: var(--success-dim);
      align-self: flex-start;
      font-variant-numeric: tabular-nums;
    }
    .main-move-why {
      font-size: 13.5px;
      color: var(--text-2);
      line-height: 1.65;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.05);
      margin-top: 2px;
    }
    .main-move-cta-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
    .main-move-cta {
      padding: 11px 20px;
      border-radius: 10px;
      background: var(--accent);
      color: #fff;
      font-size: 13.5px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    .main-move-cta:hover { filter: brightness(1.1); }
    .main-move-cta.critical { background: var(--error); }
    .main-move-empty { padding: 28px 24px; text-align: center; color: var(--text-3); font-size: 14px; }
    .main-move-primary.steady { border-inline-start-color: var(--success); border-left: none; }
    .main-move-steady-list { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
    .main-move-steady-item {
      font-size: 12.5px; color: var(--text-2); line-height: 1.5;
      padding: 10px 12px; border-radius: 10px;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    }
    .main-move-steady-item b { color: var(--text); font-weight: 700; }
    .main-move-benchmarks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .main-move-benchmark {
      display: inline-flex; flex-direction: column; gap: 2px;
      font-size: 11px; font-weight: 600; padding: 8px 12px; border-radius: 12px;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); color: var(--text-2);
      min-width: 120px;
    }
    .main-move-benchmark-label { font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: 0.03em; }
    .main-move-benchmark-value { font-size: 14px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
    .main-move-benchmark-verdict { font-size: 10.5px; color: var(--text-3); }
    .main-move-benchmark.positive { color: var(--success); background: var(--success-dim); border-color: rgba(52,168,113,0.22); }
    .main-move-benchmark.positive .main-move-benchmark-value { color: var(--success); }
    .main-move-benchmark.negative { color: var(--warning); background: rgba(199,122,31,0.08); border-color: rgba(199,122,31,0.22); }
    .main-move-benchmark.negative .main-move-benchmark-value { color: var(--warning); }
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

    #main-move-section { margin-top: 4px; }
    #main-move-section.main-move-above-fold {
      margin-top: 0;
      margin-bottom: 14px;
    }
    #main-move-section.main-move-above-fold .main-move-card {
      box-shadow: 0 14px 40px rgba(0,0,0,0.28), 0 0 0 1px rgba(217,167,89,0.12);
      border-color: rgba(217,167,89,0.38);
    }
    @media (prefers-reduced-motion: no-preference) {
      #main-move-section.main-move-above-fold .main-move-card {
        animation: mm-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #main-move-section.main-move-above-fold .main-move-loop span {
        animation: mm-step-in 360ms ease both;
      }
      #main-move-section.main-move-above-fold .main-move-loop span:nth-child(1) { animation-delay: 80ms; }
      #main-move-section.main-move-above-fold .main-move-loop span:nth-child(3) { animation-delay: 140ms; }
      #main-move-section.main-move-above-fold .main-move-loop span:nth-child(5) { animation-delay: 200ms; }
      #main-move-section.main-move-above-fold .main-move-loop span:nth-child(7) { animation-delay: 260ms; }
      @keyframes mm-enter {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes mm-step-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: none; }
      }
    }
    .hero-grid-compact {
      margin-bottom: 10px;
    }
    .hero-grid-compact .hero-card {
      padding: 12px 14px;
    }
    .hero-grid-compact .hero-value {
      font-size: 22px;
    }
    .hero-grid-compact .hero-sub,
    .hero-grid-compact .hero-delta {
      font-size: 11.5px;
    }
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

    /* ── Overflow guards (apply on every viewport) ───────────────────────
       Grid/flex items default to min-width:auto, so a wide child — most
       often the Chart.js canvas, which takes an intrinsic pixel width — can
       force its track wider than the screen and cause horizontal scroll on
       mobile. min-width:0 lets these tracks shrink to the viewport. This was
       the root cause of the chart bleeding off the right edge on phones. */
    .split-grid, .active-grid, .v2-recovery-grid, .v2-insights, .kpi-command-grid, .live-insights-grid { min-width: 0; }
    .split-grid > *, .active-card, .hero-card, .chart-panel, .brain-box,
    .main-move-card, .ticker-wrap, .exec-pulse-banner, .v2-action-body,
    .main-move-secondary-body, .strategy-card,
    .cmd-bar, .kpi-cmd-card, .live-insights-section, .live-insight-card,
    .timeline-section { min-width: 0; }
    .chart-panel-canvas { max-width: 100%; }
    .chart-panel-canvas canvas { max-width: 100% !important; }
    .exec-pulse-text, .ticker-tooltip, .strategy-body, .main-move-why,
    .active-name, .v2-action-title, .main-move-title { overflow-wrap: anywhere; }

    /* ── Mobile Dashboard Optimizations ──────────────────────────────── */
    @media (max-width: 768px) {
      /* Kill any residual horizontal overflow from wide descendants. */
      .page-content { overflow-x: hidden; }

      .hero-grid { gap: 10px; margin-bottom: 14px; }
      .hero-card { padding: 15px 16px; }
      /* English metric labels inside an RTL page: keep their own direction so
         "7-Day Spend" doesn't reorder to "Day Spend-7". */
      .hero-label { unicode-bidi: plaintext; }
      .hero-value { font-size: 25px; letter-spacing: -0.5px; }
      .hero-sub { font-size: 11px; margin-top: 4px; }
      .hero-delta { font-size: 10.5px; padding: 2px 7px; margin-top: 6px; }

      .ticker-wrap { margin-bottom: 14px; border-radius: 14px; }
      .ticker-header { padding: 10px 12px 8px; }
      .ticker-header-title { font-size: 11.5px; }
      .ticker-scroll-area { padding: 10px 12px 12px; }
      .ticker-item { padding: 11px 12px; gap: 7px; }
      .ticker-text { font-size: 12.5px; }
      .ticker-badge { font-size: 9.5px; padding: 2px 7px; }


      .active-grid { gap: 8px; }
      .active-card { padding: 12px 14px; }
      .active-name { font-size: 12px; }

      /* Chart: single column already (split-grid collapses at 1000px); make it
         a comfortable phone height and let the canvas fill the card width. */
      .split-grid { gap: 14px; margin-bottom: 18px; }
      .chart-panel { padding: 14px 14px 16px; }
      .chart-panel-head { flex-wrap: wrap; gap: 2px 8px; margin-bottom: 10px; }
      .chart-panel-canvas { height: 240px; min-height: 200px; }
      .brain-box { padding: 14px; max-height: none; }
      .brain-box-head { margin-bottom: 10px; }
      .strategy-card { padding: 12px 14px; margin-bottom: 8px; }
      .strategy-title { font-size: 12.5px; }
      .strategy-body { font-size: 11.5px; }

      .main-move-primary { padding: 16px; }
      .main-move-title { font-size: 16px; }
      .main-move-why { font-size: 12.5px; }
      .main-move-cta { width: 100%; text-align: center; }
      .main-move-cta-row { gap: 8px; }
      .main-move-secondary, .main-move-more summary { padding-left: 16px; padding-right: 16px; }

      /* Action rows stack so the button isn't squeezed off-screen. */
      .v2-action-row { flex-wrap: wrap; padding: 12px 14px; }
      .v2-action-btn { width: 100%; }

      .exec-pulse-banner { padding: 12px 14px; margin-bottom: 14px; flex-wrap: wrap; }
      .exec-pulse-text { font-size: 13px; }
      .exec-pulse-score-chip { padding: 4px 10px; }
      .exec-pulse-score-num { font-size: 18px; }
      .exec-pulse-cta { font-size: 11px; padding: 5px 10px; }

      .kpi-command-grid { gap: 10px; margin-bottom: 12px; }
      .kpi-cmd-card { padding: 14px 16px 12px; }
      .kpi-cmd-card .hero-value { font-size: 24px; }
      .kpi-cmd-insight { font-size: 11px; }
      .live-insights-section { margin-bottom: 12px; }
      .live-insights-header { padding: 10px 12px 8px; }
      .live-insight-card { padding: 10px 12px; }
      .live-insight-text { font-size: 12.5px; }
      .timeline-section { margin-bottom: 12px; }

      /* Predictions mobile */
      .predictions-grid { grid-template-columns: 1fr; gap: 10px; }
      .pred-card-top { padding: 12px 14px 8px; }
      .pred-card-body { padding: 0 14px 12px; }
      .pred-title { font-size: 12.5px; }
      .pred-detail { font-size: 12px; }
      .pred-meta-row { gap: 8px; font-size: 10.5px; }
      .section-filters { gap: 5px; }
      .section-filter-tab { padding: 4px 11px; font-size: 11px; }

      /* AI Recs mobile */
      .ai-recs-grid { grid-template-columns: 1fr; gap: 10px; }
      .ai-rec-header { padding: 12px 14px 8px; }
      .ai-rec-body-wrap { padding: 0 14px 10px; }
      .ai-rec-title { font-size: 12.5px; }
      .ai-rec-body { font-size: 12px; }

      /* Weekly report mobile */
      .weekly-metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .weekly-metric { padding: 12px 14px; }
      .weekly-metric-val { font-size: 17px; }
      .weekly-highlights { grid-template-columns: 1fr; gap: 8px; }
      .weekly-summary { padding: 12px 14px; font-size: 13px; }
      .weekly-recs li { font-size: 12px; padding: 8px 12px; flex-wrap: wrap; }
      .weekly-highlight-action { font-size: 11px; padding: 4px 10px; }
      .weekly-brain-actions { gap: 8px; }
      .weekly-brain-pill { font-size: 11px; padding: 5px 10px; }
    }

    @media (max-width: 480px) {
      /* One clean column of large, readable numbers — no cramped 2-up. */
      .hero-grid { grid-template-columns: 1fr; gap: 10px; }
      .hero-card { padding: 16px 18px; }
      .hero-value { font-size: 26px; }
      .active-grid { grid-template-columns: 1fr !important; }
      .chart-panel-canvas { height: 220px; }
    }

    /* ═══ Section filter tabs (shared) ═══ */
    .section-filters {
      display: flex; gap: 6px; flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .section-filter-tab {
      padding: 5px 14px; border-radius: 999px;
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      color: var(--text-3);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .section-filter-tab:hover { border-color: rgba(217,167,89,0.3); color: var(--text-2); }
    .section-filter-tab.active {
      background: var(--accent-dim); border-color: rgba(217,167,89,0.4);
      color: var(--accent-2);
    }
    .section-filter-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 999px; font-size: 10px; font-weight: 800;
      background: rgba(255,255,255,0.06); color: var(--text-3);
      margin-inline-start: 5px;
    }
    .section-filter-tab.active .section-filter-count {
      background: rgba(217,167,89,0.2); color: var(--accent-2);
    }

    /* ═══ Predictions ═══ */
    .predictions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
    }
    @media (max-width: 720px) { .predictions-grid { grid-template-columns: 1fr; } }
    .pred-card {
      display: flex; flex-direction: column; gap: 0;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.07);
      background: linear-gradient(170deg, rgba(255,255,255,0.02) 0%, var(--surface) 50%);
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }
    .pred-card:hover {
      border-color: rgba(217,167,89,0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.18), var(--shadow-inner-glow);
    }
    .pred-card-top {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 10px;
    }
    .pred-sev-stripe {
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
    }
    .pred-card { position: relative; }
    .pred-danger .pred-sev-stripe { background: linear-gradient(90deg, var(--error), rgba(226,96,79,0.3)); }
    .pred-warn .pred-sev-stripe { background: linear-gradient(90deg, var(--warning), rgba(199,122,31,0.3)); }
    .pred-danger { border-color: rgba(226,96,79,0.25); }
    .pred-warn { border-color: rgba(199,122,31,0.25); }
    .pred-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    .pred-danger .pred-icon { background: var(--error-dim); }
    .pred-warn .pred-icon { background: rgba(199,122,31,0.1); }
    .pred-body { flex: 1; min-width: 0; }
    .pred-title {
      font-weight: 700; font-size: 13.5px; color: var(--text);
      line-height: 1.35;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pred-type-tag {
      font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
      padding: 2px 8px; border-radius: 999px;
      white-space: nowrap; flex-shrink: 0;
    }
    .pred-danger .pred-type-tag { color: var(--error); background: var(--error-dim); }
    .pred-warn .pred-type-tag { color: var(--warning); background: rgba(199,122,31,0.1); }
    .pred-card-body { padding: 0 16px 14px; }
    .pred-detail {
      font-size: 12.5px; color: var(--text-2); line-height: 1.5;
      margin-bottom: 10px;
    }
    .pred-detail b { color: var(--text); font-weight: 700; }
    .pred-progress-wrap {
      margin-bottom: 10px;
    }
    .pred-progress-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 5px;
    }
    .pred-progress-label { font-size: 11px; color: var(--text-3); }
    .pred-progress-val { font-size: 11px; font-weight: 700; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .pred-progress-bar {
      height: 6px; border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .pred-progress-fill {
      height: 100%; border-radius: 999px;
      transition: width 0.6s ease;
    }
    .pred-danger .pred-progress-fill { background: linear-gradient(90deg, var(--error), #FB7185); }
    .pred-warn .pred-progress-fill { background: linear-gradient(90deg, var(--warning), #E6BD7A); }
    .pred-sparkline {
      margin-bottom: 8px;
    }
    .pred-sparkline svg {
      width: 100%; height: 32px; display: block;
    }
    .pred-meta-row {
      display: flex; gap: 12px; flex-wrap: wrap;
      font-size: 11px; color: var(--text-3);
    }
    .pred-meta-item {
      display: flex; align-items: center; gap: 4px;
    }
    .pred-meta-item b { color: var(--text-2); font-weight: 600; }
    .pred-actions {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px; padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.05);
      flex-wrap: wrap;
    }
    .pred-action-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 7px 14px; border-radius: 10px;
      font-size: 12px; font-weight: 700;
      text-decoration: none;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }
    .pred-action-btn.budget {
      background: rgba(199,122,31,0.12); color: var(--warning);
      border-color: rgba(199,122,31,0.2);
    }
    .pred-action-btn.budget:hover { background: rgba(199,122,31,0.22); border-color: rgba(199,122,31,0.4); }
    .pred-action-btn.fatigue {
      background: rgba(96,165,250,0.1); color: #60A5FA;
      border-color: rgba(96,165,250,0.2);
    }
    .pred-action-btn.fatigue:hover { background: rgba(96,165,250,0.2); border-color: rgba(96,165,250,0.35); }
    .pred-empty {
      text-align: center; padding: 24px;
      color: var(--text-3); font-size: 13px;
    }
    .pred-empty-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.5; }

    /* ═══ AI Recommendations ═══ */
    .ai-recs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 12px;
    }
    @media (max-width: 720px) { .ai-recs-grid { grid-template-columns: 1fr; } }
    .ai-rec-card {
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.07);
      background: linear-gradient(170deg, rgba(255,255,255,0.02) 0%, var(--surface) 50%);
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }
    .ai-rec-card:hover {
      border-color: rgba(217,167,89,0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.18), var(--shadow-inner-glow);
    }
    .ai-rec-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 10px;
    }
    .ai-rec-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
      background: var(--accent-dim);
    }
    .ai-rec-icon.scale { background: var(--success-dim); }
    .ai-rec-icon.fix { background: var(--error-dim); }
    .ai-rec-icon.pause { background: rgba(199,122,31,0.1); }
    .ai-rec-icon.watch { background: rgba(96,165,250,0.1); }
    .ai-rec-title-wrap { flex: 1; min-width: 0; }
    .ai-rec-title {
      font-weight: 700; font-size: 13.5px; color: var(--text);
      line-height: 1.35;
    }
    .ai-rec-cat-label {
      font-size: 10.5px; color: var(--text-3); margin-top: 2px;
    }
    .ai-rec-pri {
      font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
      padding: 3px 9px; border-radius: 999px;
      white-space: nowrap; flex-shrink: 0;
    }
    .ai-rec-pri.high { color: var(--error); background: var(--error-dim); }
    .ai-rec-pri.medium { color: var(--warning); background: rgba(199,122,31,0.1); }
    .ai-rec-pri.low { color: var(--text-3); background: rgba(255,255,255,0.05); }
    .ai-rec-body-wrap { padding: 0 16px 12px; }
    .ai-rec-body {
      font-size: 12.5px; color: var(--text-2); line-height: 1.6;
      margin-bottom: 10px;
    }
    .ai-rec-confidence {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 10px;
    }
    .ai-rec-conf-bar {
      flex: 1; height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden; max-width: 80px;
    }
    .ai-rec-conf-fill {
      height: 100%; border-radius: 999px;
      background: var(--accent);
      transition: width 0.5s ease;
    }
    .ai-rec-conf-label {
      font-size: 10.5px; color: var(--text-3); font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .ai-rec-campaigns {
      display: flex; gap: 6px; flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .ai-rec-campaign-tag {
      font-size: 10.5px; font-weight: 600;
      padding: 3px 9px; border-radius: 999px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      color: var(--text-2);
      max-width: 160px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-rec-actions {
      display: flex; align-items: center; gap: 8px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.05);
      flex-wrap: wrap;
    }
    .ai-rec-action-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 12px; font-weight: 700;
      text-decoration: none;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }
    .ai-rec-action-btn.scale {
      background: rgba(52,168,113,0.12); color: var(--success);
      border-color: rgba(52,168,113,0.2);
    }
    .ai-rec-action-btn.scale:hover { background: rgba(52,168,113,0.22); border-color: rgba(52,168,113,0.4); }
    .ai-rec-action-btn.fix {
      background: rgba(226,96,79,0.12); color: var(--error);
      border-color: rgba(226,96,79,0.2);
    }
    .ai-rec-action-btn.fix:hover { background: rgba(226,96,79,0.22); border-color: rgba(226,96,79,0.4); }
    .ai-rec-action-btn.pause {
      background: rgba(199,122,31,0.12); color: var(--warning);
      border-color: rgba(199,122,31,0.2);
    }
    .ai-rec-action-btn.pause:hover { background: rgba(199,122,31,0.22); border-color: rgba(199,122,31,0.4); }
    .ai-rec-action-btn.watch, .ai-rec-action-btn.optimize {
      background: rgba(217,167,89,0.1); color: var(--accent-2);
      border-color: rgba(217,167,89,0.2);
    }
    .ai-rec-action-btn.watch:hover, .ai-rec-action-btn.optimize:hover {
      background: rgba(217,167,89,0.2); border-color: rgba(217,167,89,0.35);
    }
    /* ═══ Weekly Report ═══ */
    .weekly-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; gap: 10px; flex-wrap: wrap;
    }
    .weekly-period {
      font-size: 12.5px; color: var(--text-2);
      display: flex; align-items: center; gap: 8px;
    }
    .weekly-period-dates {
      font-weight: 600; color: var(--text);
      font-variant-numeric: tabular-nums;
    }
    .weekly-source-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
      padding: 3px 9px; border-radius: 999px;
      background: var(--accent-dim); color: var(--accent-2);
    }
    .weekly-metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (max-width: 560px) { .weekly-metrics-grid { grid-template-columns: repeat(2, 1fr); } }
    .weekly-metric {
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.07);
      background: var(--surface);
      transition: border-color 0.15s;
    }
    .weekly-metric:hover { border-color: rgba(255,255,255,0.12); }
    .weekly-metric-label {
      font-size: 10.5px; color: var(--text-3); margin-bottom: 6px;
      font-weight: 700; letter-spacing: 0.03em;
    }
    .weekly-metric-val {
      font-family: var(--font-display);
      font-size: 20px; font-weight: 800; color: var(--accent-2);
      letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
      line-height: 1.1; margin-bottom: 4px;
    }
    .weekly-metric-prev {
      font-size: 11px; color: var(--text-3); margin-bottom: 6px;
      font-variant-numeric: tabular-nums;
    }
    .weekly-metric-bar {
      height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden; margin-top: 6px;
    }
    .weekly-metric-bar-inner {
      display: flex; height: 100%;
    }
    .weekly-metric-bar-this {
      height: 100%; border-radius: 999px 0 0 999px;
      background: var(--accent);
    }
    .weekly-metric-bar-last {
      height: 100%;
      background: rgba(255,255,255,0.08);
    }
    .weekly-summary {
      font-size: 13.5px; line-height: 1.7;
      color: var(--text-2);
      padding: 14px 18px;
      border-radius: 14px;
      background: linear-gradient(165deg, rgba(217,167,89,0.04), transparent 40%), var(--surface);
      border: 1px solid rgba(255,255,255,0.07);
      margin-bottom: 14px;
    }
    .weekly-recs {
      list-style: none; padding: 0; margin: 0 0 14px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .weekly-recs li {
      display: flex; align-items: flex-start; gap: 10px;
      font-size: 12.5px; color: var(--text-2); line-height: 1.55;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .weekly-rec-icon {
      width: 22px; height: 22px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent-dim); color: var(--accent-2);
      font-size: 11px; flex-shrink: 0; margin-top: 1px;
    }
    .weekly-highlights {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      margin-bottom: 14px;
    }
    @media (max-width: 560px) { .weekly-highlights { grid-template-columns: 1fr; } }
    .weekly-highlight {
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.07);
      background: var(--surface);
      display: flex; flex-direction: column; gap: 6px;
    }
    .highlight-tag {
      font-weight: 700; font-size: 10.5px;
      letter-spacing: 0.04em;
    }
    .weekly-highlight.best .highlight-tag { color: var(--success); }
    .weekly-highlight.worst .highlight-tag { color: var(--error); }
    .weekly-highlight-name {
      font-size: 14px; font-weight: 700; color: var(--text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .weekly-highlight-stats {
      display: flex; gap: 14px; font-size: 11.5px; color: var(--text-3);
      font-variant-numeric: tabular-nums;
    }
    .weekly-highlight-stats b { color: var(--text-2); font-weight: 600; }
    .weekly-brain-actions {
      display: flex; gap: 10px; flex-wrap: wrap;
    }
    .weekly-brain-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px;
      font-size: 11.5px; font-weight: 600;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      color: var(--text-2);
    }
    .weekly-brain-pill-count {
      font-weight: 800; color: var(--accent-2);
      font-variant-numeric: tabular-nums;
    }
    .weekly-brain-pill-icon { font-size: 12px; }

    .weekly-recs-header {
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 10px;
      letter-spacing: -0.01em;
    }
    .weekly-rec-text { flex: 1; min-width: 0; }
    .weekly-highlight-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      padding: 5px 12px;
      border-radius: 8px;
      margin-top: 4px;
      transition: all 0.15s ease;
      align-self: flex-start;
    }
    .weekly-highlight-action.best-action {
      color: var(--success);
      background: rgba(52,168,113,0.08);
      border: 1px solid rgba(52,168,113,0.18);
    }
    .weekly-highlight-action.best-action:hover {
      background: rgba(52,168,113,0.18);
      border-color: rgba(52,168,113,0.3);
    }
    .weekly-highlight-action.worst-action {
      color: var(--error);
      background: rgba(226,96,79,0.08);
      border: 1px solid rgba(226,96,79,0.18);
    }
    .weekly-highlight-action.worst-action:hover {
      background: rgba(226,96,79,0.18);
      border-color: rgba(226,96,79,0.3);
    }

    /* ═══ Mode Toggle ═══ */
    .mode-toggle {
      display: inline-flex;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 2px;
      gap: 2px;
    }
    .mode-btn {
      padding: 5px 14px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      color: var(--text-3);
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .mode-btn:hover { color: var(--text-2); background: rgba(255,255,255,0.04); }
    .mode-btn.active {
      color: var(--bg);
      background: var(--accent);
      box-shadow: 0 2px 8px rgba(217,167,89,0.25);
    }

    /* ═══ Quick Mode — hide advanced sections ═══ */
    /* Quick mode = the executive layer of the hierarchy: summary, health,
       THE decision (main move), alerts, opportunities. Everything evidential
       (metrics, charts, timeline, weekly, deep-dive) is advanced-only. */
    [data-dash-mode="quick"] .kpi-command-grid,
    [data-dash-mode="quick"] .live-insights-section,
    [data-dash-mode="quick"] .active-section,
    [data-dash-mode="quick"] .split-grid,
    [data-dash-mode="quick"] .chart-twin-section,
    [data-dash-mode="quick"] .timeline-section,
    [data-dash-mode="quick"] #weekly-report-section,
    [data-dash-mode="quick"] .v2-advanced,
    [data-dash-mode="quick"] #v2-brain-section {
      display: none !important;
    }

    /* ═══ Health Score Gauge ═══ */
    .health-gauge-section {
      margin-bottom: 18px;
    }
    .health-gauge-card {
      display: flex;
      align-items: center;
      gap: 28px;
      background:
        linear-gradient(165deg, rgba(217,167,89,0.06), transparent 50%),
        linear-gradient(340deg, rgba(52,168,113,0.04), transparent 40%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 24px 28px;
      direction: rtl;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-inner-glow);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .health-gauge-card:hover {
      border-color: rgba(217,167,89,0.2);
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), var(--shadow-inner-glow);
    }
    .health-gauge-left {
      flex-shrink: 0;
      width: 160px;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .health-gauge-svg {
      width: 160px;
      height: 140px;
      overflow: visible;
    }
    .hg-score-num {
      font-family: var(--font-display);
      font-size: 42px;
      font-weight: 800;
      fill: var(--text);
      letter-spacing: -0.04em;
    }
    .hg-score-max {
      font-size: 11px;
      font-weight: 600;
      fill: var(--text-3);
      letter-spacing: 0.02em;
    }
    .hg-band-chip {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.03);
      white-space: nowrap;
    }

    .health-gauge-right {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hg-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .hg-title {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
    }
    .hg-subtitle {
      font-size: 12px;
      color: var(--text-3);
      font-variant-numeric: tabular-nums;
    }
    .hg-status {
      font-size: 14px;
      color: var(--text-2);
      line-height: 1.5;
    }

    .hg-metrics {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .hg-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 10px 16px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      min-width: 80px;
      transition: border-color 0.15s ease;
    }
    .hg-metric:hover { border-color: rgba(255,255,255,0.12); }
    .hg-metric-val {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.03em;
    }
    .hg-metric-lbl {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-3);
      letter-spacing: 0.02em;
    }
    .hg-m-success .hg-metric-val { color: var(--success); }
    .hg-m-accent .hg-metric-val { color: var(--accent-2); }
    .hg-m-warning .hg-metric-val { color: var(--warning); }
    .hg-m-error .hg-metric-val { color: var(--error); }

    .hg-action-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent-2);
      text-decoration: none;
      padding: 6px 0;
      transition: color 0.15s ease;
    }
    .hg-action-link:hover { color: var(--accent); }
    .hg-action-link svg { flex-shrink: 0; }

    @media (max-width: 768px) {
      .health-gauge-card {
        flex-direction: column;
        padding: 20px 16px;
        gap: 16px;
        text-align: center;
      }
      .health-gauge-left { width: 140px; height: 120px; }
      .health-gauge-svg { width: 140px; height: 120px; }
      .hg-score-num { font-size: 36px; }
      .hg-header { justify-content: center; }
      .hg-status { text-align: center; }
      .hg-metrics { justify-content: center; }
      .hg-action-link { justify-content: center; }
      .mode-toggle { order: -1; }
    }

    /* ═══ AI Floating Action Button ═══ */
    .ai-fab {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 900;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      border-radius: 16px;
      background: linear-gradient(135deg, var(--accent) 0%, #c49038 100%);
      color: #1a1613;
      text-decoration: none;
      font-size: 13px;
      font-weight: 800;
      box-shadow: 0 4px 20px rgba(217,167,89,0.35), 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
      animation: fab-entrance 0.5s ease-out 1s both;
    }
    .ai-fab:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 8px 30px rgba(217,167,89,0.45), 0 4px 12px rgba(0,0,0,0.3);
    }
    .ai-fab svg { flex-shrink: 0; }
    @keyframes fab-entrance {
      from { opacity: 0; transform: translateY(20px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 560px) {
      .ai-fab { bottom: 16px; left: 16px; padding: 10px 14px; font-size: 12px; border-radius: 14px; }
      .ai-fab-label { display: none; }
    }

    /* ═══ Section Empty State — compact strip, never a tall box ═══ */
    .section-empty-state {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 12px;
      background: rgba(52,168,113,0.04);
      border: 1px dashed rgba(255,255,255,0.1);
    }
    .section-empty-icon { font-size: 18px; flex-shrink: 0; }
    .section-empty-title {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
    }
    .section-empty-sub {
      font-size: 12.5px;
      color: var(--text-3);
      flex: 1;
      min-width: 0;
    }
    .section-empty-cta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      color: var(--accent-2);
      text-decoration: none;
      padding: 5px 12px;
      border-radius: 8px;
      background: rgba(217,167,89,0.08);
      border: 1px solid rgba(217,167,89,0.15);
      transition: all 0.15s ease;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .section-empty-cta:hover {
      background: rgba(217,167,89,0.18);
      border-color: rgba(217,167,89,0.3);
    }
    @media (max-width: 560px) {
      .section-empty-state { flex-wrap: wrap; }
    }

    /* ═══ Section entrance animation ═══ */
    @keyframes section-enter {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .section-enter {
      animation: section-enter 0.35s ease-out both;
    }
    .section-enter-delay-1 { animation-delay: 0.08s; }
    .section-enter-delay-2 { animation-delay: 0.16s; }
    .section-enter-delay-3 { animation-delay: 0.24s; }

  </style>`;
