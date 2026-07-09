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
    .hero-card:hover { border-color: rgba(217,167,89,0.35); box-shadow: 0 10px 28px rgba(0,0,0,0.22); transform: translateY(-2px); }
    .hero-card.success::before { background: linear-gradient(180deg, var(--success), transparent); }
    .hero-card.warning::before { background: linear-gradient(180deg, var(--warning), transparent); }
    .hero-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-3); }
    .hero-value {
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
    .ai-context-strip {
      display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 10px;
      margin-bottom: 18px; direction: rtl;
    }
    .ai-context-strip--quiet {
      opacity: 0.72;
      margin-bottom: 12px;
    }
    .ai-context-strip--quiet .ai-ctx-pill {
      padding: 9px 12px;
      background: transparent;
      border-color: rgba(255,255,255,0.05);
    }
    @media (max-width: 900px) { .ai-context-strip { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 520px) { .ai-context-strip { grid-template-columns: 1fr; } }
    .ai-ctx-pill {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      font-size: 12px; color: var(--text-2);
      padding: 12px 14px; border-radius: 14px;
      background: var(--surface); border: 1px solid rgba(255,255,255,0.07);
      min-width: 0;
    }
    .ai-ctx-pill-primary {
      border-color: rgba(217,167,89,0.28);
      background: linear-gradient(145deg, rgba(217,167,89,0.1), rgba(255,255,255,0.02));
      color: var(--text);
    }
    .ai-ctx-pill-muted { opacity: 0.92; }
    .ai-ctx-pill b { color: var(--accent-2); font-weight: 800; font-variant-numeric: tabular-nums; }
    .ai-ctx-icon { font-size: 12px; line-height: 1; opacity: 0.8; }
    .ai-ctx-label { font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: 0.04em; }
    .ai-ctx-value { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.35; }

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
    .brain-box {
      background:
        linear-gradient(165deg, rgba(217,167,89,0.04), transparent 38%),
        var(--surface);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 16px 16px 14px;
      display: flex; flex-direction: column; gap: 10px;
      max-height: 420px; overflow-y: auto;
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
    .brain-box-title { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
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
    }
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
      margin-top: 2px; font-size: 15px; font-weight: 800; color: var(--accent-2);
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
    }
    .chart-panel-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .chart-panel-title { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
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
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 18px 18px 16px;
      width: 100%;
    }
    .adv-panel-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
    }
    .adv-panel-kicker {
      font-size: 10.5px; font-weight: 800; color: var(--accent-2);
      letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .adv-panel-title { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
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
    .adv-shell .adv-campaigns-wrap { overflow: hidden; }
    .adv-shell .adv-campaigns-table { min-width: 680px; }

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
    .exec-pulse-text { font-size: 14px; font-weight: 650; color: var(--text); line-height: 1.5; }

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

    .below-chart-section { margin-top: 4px; }
    .below-chart-section + .below-chart-section { margin-top: 18px; }
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
    .split-grid, .active-grid, .v2-spotlight-grid, .v2-recovery-grid, .v2-insights { min-width: 0; }
    .split-grid > *, .active-card, .hero-card, .chart-panel, .brain-box,
    .main-move-card, .ticker-wrap, .exec-pulse-banner, .v2-action-body,
    .main-move-secondary-body, .v2-spotlight, .strategy-card { min-width: 0; }
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

      .ai-context-strip { margin-bottom: 12px; gap: 8px; }

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

      .exec-pulse-banner { padding: 12px 14px; margin-bottom: 14px; }
      .exec-pulse-text { font-size: 13px; }
    }

    @media (max-width: 480px) {
      /* One clean column of large, readable numbers — no cramped 2-up. */
      .hero-grid { grid-template-columns: 1fr; gap: 10px; }
      .hero-card { padding: 16px 18px; }
      .hero-value { font-size: 26px; }
      .active-grid { grid-template-columns: 1fr !important; }
      .chart-panel-canvas { height: 220px; }
    }

  </style>`;
