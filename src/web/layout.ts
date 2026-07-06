// ════════════════════════════════════════════════════════════════════════
//  src/web/layout.ts
//
//  Shared layout, CSS design system, and HTML helpers for all Adlytic
//  web pages. Every page imports layout() to get the full shell.
// ════════════════════════════════════════════════════════════════════════

export const SHARED_CSS = `
:root {
  --bg: #0a0a0b;
  --surface: #111113;
  --surface-2: #18181b;
  --surface-hover: #1c1c1f;
  --border: #232326;
  --border-2: #2e2e33;
  --text: #f1f0f0;
  --text-2: #a0a0b0;
  --text-3: #5a5a6a;
  --accent: #6366f1;
  --accent-2: #818cf8;
  --accent-3: #a5b4fc;
  --accent-dim: rgba(99,102,241,0.12);
  --accent-glow: rgba(99,102,241,0.35);
  --violet: #8b5cf6;
  --pink: #ec4899;
  --cyan: #06b6d4;
  --teal: #14b8a6;
  --success: #22c55e;
  --success-dim: rgba(34,197,94,0.12);
  --warning: #f59e0b;
  --warning-dim: rgba(245,158,11,0.12);
  --error: #ef4444;
  --error-dim: rgba(239,68,68,0.12);
  --critical: #dc2626;
  --critical-dim: rgba(220,38,38,0.12);
  --grad-accent: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  --grad-accent-hover: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  --grad-vibrant: linear-gradient(135deg, #6366f1 0%, #ec4899 100%);
  --grad-cool: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
  --grad-success: linear-gradient(135deg, #22c55e 0%, #14b8a6 100%);
  --grad-warm: linear-gradient(135deg, #f59e0b 0%, #ec4899 100%);
  --grad-surface: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%);
  --sidebar-w: 220px;
  --topbar-h: 56px;
  --radius: 8px;
  --radius-sm: 5px;
  --radius-lg: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.5);
  --shadow-accent: 0 4px 14px rgba(99,102,241,0.35);
  --shadow-glow: 0 0 0 1px rgba(99,102,241,0.15), 0 8px 24px rgba(99,102,241,0.18);
  --transition: 150ms cubic-bezier(0.4,0,0.2,1);
  --transition-slow: 260ms cubic-bezier(0.34,1.56,0.64,1);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 14px; -webkit-font-smoothing: antialiased; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  line-height: 1.5;
  min-height: 100vh;
}
[dir="auto"] { letter-spacing: normal; line-height: 1.6; }
a { color: var(--accent-2); text-decoration: none; }
a:hover { color: var(--text); }
button { cursor: pointer; font-family: inherit; }
input, select, textarea { font-family: inherit; }

/* ── App shell ───────────────────────────────────────────────────── */
.app-shell { display: flex; min-height: 100vh; }

/* ── Sidebar ─────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0; bottom: 0;
  z-index: 100;
  overflow-y: auto;
}
.sidebar-logo {
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px;
}
.sidebar-logo-mark {
  width: 28px; height: 28px;
  background: var(--grad-accent);
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 13px; color: #fff; letter-spacing: -0.5px;
  flex-shrink: 0;
  box-shadow: var(--shadow-accent);
}
.sidebar-logo-text { font-weight: 700; font-size: 15px; color: var(--text); letter-spacing: -0.3px; }
.sidebar-logo-badge {
  font-size: 10px; font-weight: 600; color: var(--accent-2);
  background: var(--accent-dim); border-radius: 4px; padding: 1px 5px;
  margin-left: auto;
}
.sidebar-nav { flex: 1; padding: 10px 8px; }
.nav-section-label {
  font-size: 10px; font-weight: 600; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: 8px 8px 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13.5px; font-weight: 500;
  transition: all var(--transition);
  margin-bottom: 1px;
  text-decoration: none;
}
.nav-item:hover { background: var(--surface-hover); color: var(--text); }
.nav-item.active {
  background: var(--accent-dim);
  color: var(--accent-2);
}
.nav-item svg { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.8; }
.nav-item.active svg { opacity: 1; }
.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid var(--border);
}
.sidebar-user {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
}
.sidebar-user:hover { background: var(--surface-hover); }
.avatar {
  width: 28px; height: 28px;
  background: var(--grad-vibrant);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
  flex-shrink: 0;
}
.sidebar-user-info { flex: 1; min-width: 0; }
.sidebar-user-name { font-size: 13px; font-weight: 500; color: var(--text); truncate; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sidebar-user-email { font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Main area ───────────────────────────────────────────────────── */
.main {
  flex: 1;
  margin-left: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Topbar ──────────────────────────────────────────────────────── */
.topbar {
  height: var(--topbar-h);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center;
  padding: 0 24px;
  gap: 12px;
  position: sticky; top: 0; z-index: 90;
}
.topbar-title { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
.topbar-ws {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12.5px; color: var(--text-2);
  cursor: pointer;
  transition: all var(--transition);
  max-width: 200px;
}
.topbar-ws:hover { border-color: var(--border-2); color: var(--text); }
.topbar-ws-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar-btn {
  width: 32px; height: 32px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-2);
  transition: all var(--transition);
}
.topbar-btn:hover { background: var(--surface-hover); color: var(--text); border-color: var(--border-2); }
.topbar-btn svg { width: 15px; height: 15px; }

/* ── Page content ────────────────────────────────────────────────── */
.page-content { flex: 1; padding: 28px 28px 48px; max-width: 1400px; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.4px; }
.page-subtitle { font-size: 13px; color: var(--text-2); margin-top: 3px; }

/* ── Cards ───────────────────────────────────────────────────────── */
.card {
  position: relative;
  background: var(--surface);
  background-image: var(--grad-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}
.card:hover { border-color: var(--border-2); box-shadow: var(--shadow-lg); }
/* Optional gradient top-edge accent: add class .card-accent */
.card-accent::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.card-title {
  font-size: 12px; font-weight: 600; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 12px;
}

/* ── KPI grid ────────────────────────────────────────────────────── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.kpi-card {
  position: relative;
  background: var(--surface);
  background-image: var(--grad-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  overflow: hidden;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}
.kpi-card::before {
  content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px;
  background: var(--grad-accent);
  opacity: 0; transition: opacity var(--transition);
}
.kpi-card:hover { border-color: var(--border-2); transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.kpi-card:hover::before { opacity: 1; }
.kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.5px; line-height: 1.2; }
.kpi-delta {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11.5px; font-weight: 600;
  margin-top: 6px;
  padding: 2px 6px;
  border-radius: 4px;
}
.kpi-delta.up-good { color: var(--success); background: var(--success-dim); }
.kpi-delta.down-good { color: var(--success); background: var(--success-dim); }
.kpi-delta.up-bad { color: var(--error); background: var(--error-dim); }
.kpi-delta.down-bad { color: var(--error); background: var(--error-dim); }
.kpi-delta.flat { color: var(--text-3); background: transparent; }

/* ── Charts ──────────────────────────────────────────────────────── */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.chart-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.chart-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.chart-card-title { font-size: 13px; font-weight: 600; color: var(--text); }
.chart-canvas-wrap { position: relative; height: 200px; }

/* ── Tables ──────────────────────────────────────────────────────── */
.table-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.table-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.table-title { font-size: 14px; font-weight: 600; color: var(--text); }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left;
  padding: 11px 16px;
  font-size: 11px; font-weight: 600; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.07em;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  white-space: nowrap;
}
td {
  padding: 12px 16px;
  font-size: 13px; color: var(--text);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--surface-hover); }

/* ── Badges ──────────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.badge-green  { background: var(--success-dim); color: var(--success); }
.badge-yellow { background: var(--warning-dim); color: var(--warning); }
.badge-red    { background: var(--error-dim);   color: var(--error); }
.badge-critical { background: var(--critical-dim); color: var(--critical); }
.badge-gray   { background: rgba(255,255,255,0.06); color: var(--text-3); }
.badge-blue   { background: var(--accent-dim); color: var(--accent-2); }

/* ── Buttons ─────────────────────────────────────────────────────── */
.btn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600;
  border: none; cursor: pointer;
  transition: transform var(--transition), box-shadow var(--transition), background var(--transition), border-color var(--transition), color var(--transition), filter var(--transition);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  isolation: isolate;
}
.btn:active { transform: translateY(1px) scale(0.985); }
/* Ripple */
.btn::after {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(circle at var(--rx, 50%) var(--ry, 50%), rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 45%);
  opacity: 0;
  transition: opacity 500ms ease;
  pointer-events: none;
  z-index: -1;
}
.btn.is-rippling::after { opacity: 1; transition: opacity 0ms; }
.btn-primary { background: var(--grad-accent); color: #fff; box-shadow: var(--shadow-accent); }
.btn-primary:hover { background: var(--grad-accent-hover); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.45); }
.btn-primary:active { transform: translateY(0) scale(0.985); }
.btn-secondary {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover { background: var(--surface-hover); border-color: var(--accent); color: #fff; transform: translateY(-1px); }
.btn-danger { background: var(--error-dim); color: var(--error); border: 1px solid transparent; }
.btn-danger:hover { background: var(--error); color: #fff; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(239,68,68,0.35); }
.btn-ghost { background: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-hover); color: var(--text); }
.btn-success { background: var(--grad-success); color: #fff; box-shadow: 0 4px 14px rgba(20,184,166,0.3); }
.btn-success:hover { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 6px 20px rgba(20,184,166,0.4); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-lg { padding: 10px 20px; font-size: 14px; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; transform: none; box-shadow: none; }
/* Loading state: hide label, show spinner */
.btn.is-loading { color: transparent !important; pointer-events: none; }
.btn.is-loading::before {
  content: "";
  position: absolute; top: 50%; left: 50%;
  width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: btn-spin 0.6s linear infinite;
  z-index: 1;
}
@keyframes btn-spin { to { transform: rotate(360deg); } }

/* ── Forms ───────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 12.5px; font-weight: 500; color: var(--text-2); margin-bottom: 6px; }
.form-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13.5px; color: var(--text);
  outline: none;
  transition: border-color var(--transition);
}
.form-input:focus { border-color: var(--accent); }
.form-input::placeholder { color: var(--text-3); }
select.form-input { cursor: pointer; }

/* ── Alerts ──────────────────────────────────────────────────────── */
.alert {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  margin-bottom: 16px;
  display: flex; align-items: flex-start; gap: 9px;
}
.alert-error { background: var(--error-dim); color: var(--error); border: 1px solid rgba(239,68,68,0.2); }
.alert-success { background: var(--success-dim); color: var(--success); border: 1px solid rgba(34,197,94,0.2); }
.alert-warning { background: var(--warning-dim); color: var(--warning); border: 1px solid rgba(245,158,11,0.2); }
.alert-info { background: var(--accent-dim); color: var(--accent-2); border: 1px solid rgba(99,102,241,0.2); }

/* ── Global token-decrypt failure banner ─────────────────────────── */
.token-decrypt-banner {
  display: none;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  background: linear-gradient(90deg, rgba(220,38,38,0.22), rgba(239,68,68,0.12));
  border-bottom: 2px solid var(--critical);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  position: sticky;
  top: var(--topbar-h);
  z-index: 85;
}
.token-decrypt-banner.visible { display: flex; }
.token-decrypt-banner-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--critical);
}
.token-decrypt-banner-body { flex: 1; min-width: 0; }
.token-decrypt-banner-title {
  font-size: 14px;
  font-weight: 800;
  color: #fecaca;
  letter-spacing: -0.2px;
  margin-bottom: 2px;
}
.token-decrypt-banner-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}
.token-decrypt-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.token-decrypt-banner .btn-reconnect {
  background: var(--critical);
  color: #fff;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  transition: background var(--transition);
}
.token-decrypt-banner .btn-reconnect:hover { background: #b91c1c; color: #fff; }
.token-decrypt-banner-dismiss {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  color: var(--text-2);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.token-decrypt-banner-dismiss:hover { background: rgba(255,255,255,0.06); color: var(--text); }
@media (max-width: 768px) {
  .token-decrypt-banner { flex-wrap: wrap; padding: 12px 16px; }
  .token-decrypt-banner-actions { width: 100%; justify-content: flex-end; }
}

/* ── Empty state ─────────────────────────────────────────────────── */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 24px;
  text-align: center;
}
.empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.4; }
.empty-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.empty-text { font-size: 13px; color: var(--text-2); max-width: 300px; }

/* ── Spinner ─────────────────────────────────────────────────────── */
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-overlay {
  display: flex; align-items: center; justify-content: center;
  min-height: 300px;
  flex-direction: column; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

/* ── Health score ring ───────────────────────────────────────────── */
.health-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.health-number { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
.health-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }

/* ── Section divider ─────────────────────────────────────────────── */
.section-gap { margin-bottom: 24px; }

/* ── Flex helpers ────────────────────────────────────────────────── */
.flex { display: flex; }
.flex-1 { flex: 1; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }

/* ── Text helpers ────────────────────────────────────────────────── */
.text-2 { color: var(--text-2); }
.text-3 { color: var(--text-3); }
.text-sm { font-size: 12px; }
.text-xs { font-size: 11px; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Tabs ────────────────────────────────────────────────────────── */
.tabs { display: flex; gap: 2px; padding: 3px; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border); width: fit-content; }
.tab {
  padding: 5px 12px; font-size: 12.5px; font-weight: 500; color: var(--text-2);
  border-radius: 4px; cursor: pointer; transition: all var(--transition); border: none; background: none;
}
.tab.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.tab:hover:not(.active) { color: var(--text); }

/* ── Search ──────────────────────────────────────────────────────── */
.search-wrap { position: relative; }
.search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-3); pointer-events: none; }
.search-input { padding-left: 32px !important; }

/* ── Toast ───────────────────────────────────────────────────────── */
#toast-container {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  display: flex; flex-direction: column; gap: 8px;
}
.toast {
  padding: 12px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px; color: var(--text);
  box-shadow: var(--shadow-lg);
  animation: slide-in 0.2s ease;
  max-width: 320px;
}
.toast.success { border-left: 3px solid var(--success); }
.toast.error   { border-left: 3px solid var(--error); }
.toast.info    { border-left: 3px solid var(--accent); }
.toast.warning { border-left: 3px solid var(--warning); }
@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ── Background sync status bar (B-0) ─────────────────────────────── */
.sync-status-bar {
  display: none;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: var(--accent-dim);
  border: 1px solid rgba(99,102,241,0.35);
  border-radius: var(--radius-lg);
  font-size: 13px;
  color: var(--text);
}
.sync-status-inner { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; flex-wrap: wrap; }
.sync-status-spinner {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid rgba(99,102,241,0.25);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sync-status-text { font-weight: 600; color: var(--text); }
.sync-status-progress {
  flex: 1; min-width: 80px; max-width: 200px; height: 5px;
  background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;
}
.sync-status-progress-bar {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 999px;
  transition: width 0.5s ease;
}
.sync-status-meta { font-size: 11.5px; color: var(--text-3); margin-left: auto; }

/* ── Meta CDN image fallbacks (C-2) ─────────────────────────────── */
.meta-img-wrap, .inspector-creative-thumb {
  position: relative;
  overflow: hidden;
  background: var(--surface-2);
}
.meta-img-wrap img, .inspector-creative-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.meta-img-wrap img.meta-img-loading {
  opacity: 0;
}
.meta-img-fallback, .inspector-creative-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px;
  background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 100%);
  color: var(--text-3);
}
.meta-img-fallback.visible, .inspector-creative-fallback.visible { display: flex; }
.meta-img-placeholder {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-hover) 50%, var(--surface-2) 75%);
  background-size: 200% 100%;
  animation: meta-img-shimmer 1.2s ease-in-out infinite;
}
@keyframes meta-img-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.section-fallback {
  padding: 16px; border: 1px dashed var(--border);
  border-radius: var(--radius); color: var(--text-3); font-size: 13px; text-align: center;
}

/* ── Modal ───────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; backdrop-filter: blur(4px);
  animation: fade-in 0.15s ease;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%; max-width: 440px;
  box-shadow: var(--shadow-lg);
  animation: scale-in 0.15s ease;
}
@keyframes scale-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
.modal-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.modal-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 20px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); transition: transform var(--transition); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .chart-grid { grid-template-columns: 1fr; }
  .page-content { padding: 16px; }
  .mobile-menu-btn { display: flex !important; }
}
.mobile-menu-btn { display: none; }

/* ── Dashboard mode toggle (Pro / Beginner) ──────────────────────────── */
.mode-toggle {
  display: inline-flex; align-items: center;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  margin-right: 8px;
}
.mode-toggle-btn {
  padding: 5px 12px;
  font-size: 12px; font-weight: 600;
  color: var(--text-3);
  background: transparent;
  border: none; border-radius: 999px;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.mode-toggle-btn:hover { color: var(--text); }
.mode-toggle-btn.active { background: var(--accent); color: #fff; }

/* ── RTL Support ────────────────────────────────────────────────── */
[dir="rtl"] .sidebar { left: auto; right: 0; border-right: none; border-left: 1px solid var(--border); }
[dir="rtl"] .main { margin-left: 0; margin-right: var(--sidebar-w); }
[dir="rtl"] .sidebar-logo-badge { margin-left: 0; margin-right: auto; }
[dir="rtl"] th { text-align: right; }
[dir="rtl"] .search-wrap svg { left: auto; right: 10px; }
[dir="rtl"] .search-input { padding-left: 12px !important; padding-right: 32px !important; }
[dir="rtl"] .toast.success { border-left: none; border-right: 3px solid var(--success); }
[dir="rtl"] .toast.error { border-left: none; border-right: 3px solid var(--error); }
[dir="rtl"] .toast.info { border-left: none; border-right: 3px solid var(--accent); }
[dir="rtl"] .toast.warning { border-left: none; border-right: 3px solid var(--warning); }
[dir="rtl"] #toast-container { right: auto; left: 20px; }
[dir="rtl"] .kpi-value, [dir="rtl"] .health-number { font-feature-settings: 'tnum'; direction: ltr; }
[dir="rtl"] .sync-status-meta { margin-left: 0; margin-right: auto; }
[dir="rtl"] .mode-toggle { margin-right: 0; margin-left: 8px; }
[dir="rtl"] .topbar-btn.mobile-menu-btn { margin-right: 0; margin-left: 8px; }
@media (max-width: 768px) {
  [dir="rtl"] .sidebar { transform: translateX(100%); }
  [dir="rtl"] .sidebar.open { transform: translateX(0); }
  [dir="rtl"] .main { margin-right: 0; }
}

/* ── Diagnosis cards ────────────────────────────────────────────── */
.diagnosis-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-bottom: 24px; }
.diagnosis-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  transition: border-color var(--transition);
}
.diagnosis-card:hover { border-color: var(--border-2); }
.diagnosis-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.diagnosis-name { font-size: 14px; font-weight: 700; color: var(--text); }
.diagnosis-confidence { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.diagnosis-confidence.high { background: var(--success-dim); color: var(--success); }
.diagnosis-confidence.medium { background: var(--warning-dim); color: var(--warning); }
.diagnosis-confidence.low { background: rgba(255,255,255,0.06); color: var(--text-3); }
.diagnosis-narrative { font-size: 13px; color: var(--text-2); line-height: 1.65; margin-bottom: 12px; }
.diagnosis-action {
  font-size: 12.5px; color: var(--accent-2); background: var(--accent-dim);
  padding: 10px 14px; border-radius: var(--radius-sm); line-height: 1.55;
}
.diagnosis-action-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; color: var(--accent); }

/* ── Attribution bar ────────────────────────────────────────────── */
.attribution-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  margin-bottom: 24px;
}
.attribution-title { font-size: 12px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
.attribution-bars { display: flex; gap: 16px; flex-wrap: wrap; }
.attribution-factor { flex: 1; min-width: 120px; }
.attribution-factor-label { font-size: 12px; color: var(--text-2); margin-bottom: 6px; font-weight: 500; }
.attribution-factor-value { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; direction: ltr; }
.attribution-factor-value.positive { color: var(--success); }
.attribution-factor-value.negative { color: var(--error); }
.attribution-factor-value.neutral { color: var(--text-3); }
.attribution-factor-bar {
  height: 4px; border-radius: 2px; margin-top: 6px;
  background: var(--surface-2);
}
.attribution-factor-fill {
  height: 100%; border-radius: 2px;
  transition: width 0.5s ease;
}
.attribution-primary-tag {
  display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
  padding: 1px 6px; border-radius: 3px; margin-top: 4px;
  background: var(--accent-dim); color: var(--accent-2); letter-spacing: 0.05em;
}
.attribution-narrative { font-size: 13px; color: var(--text-2); margin-top: 14px; line-height: 1.6; padding-top: 14px; border-top: 1px solid var(--border); }

/* ── Table horizontal scroll on mobile ──────────────────────────── */
@media (max-width: 768px) {
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .table-wrap table { min-width: 700px; }
  .account-cards { grid-template-columns: 1fr !important; }
  .rec-grid { grid-template-columns: 1fr !important; }
  .settings-grid { grid-template-columns: 1fr !important; }
  .gate-grid { grid-template-columns: 1fr !important; }
  .diagnosis-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .modal { max-width: calc(100vw - 32px); margin: 16px; }
}

/* ── New components ─────────────────────────────────────────────── */
/* Gradient text (headings / brand emphasis) */
.gradient-text {
  background: var(--grad-vibrant);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}

/* Skeleton loaders */
.skeleton {
  position: relative; overflow: hidden;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.skeleton::after {
  content: ""; position: absolute; inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
  animation: skeleton-shimmer 1.3s infinite;
}
[dir="rtl"] .skeleton::after { animation-name: skeleton-shimmer-rtl; }
@keyframes skeleton-shimmer { 100% { transform: translateX(100%); } }
@keyframes skeleton-shimmer-rtl { 100% { transform: translateX(-100%); } }
[dir="rtl"] .skeleton::after { transform: translateX(100%); }
.skeleton-line { height: 12px; margin-bottom: 8px; }
.skeleton-line.sk-lg { height: 20px; }
.skeleton-line.w-40 { width: 40%; } .skeleton-line.w-60 { width: 60%; } .skeleton-line.w-80 { width: 80%; }
.skeleton-kpi { height: 78px; border-radius: var(--radius-lg); }

/* Empty states */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 48px 24px; gap: 6px;
}
.empty-state-icon {
  width: 56px; height: 56px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; margin-bottom: 10px;
  background: var(--accent-dim); color: var(--accent-2);
}
.empty-state-title { font-size: 15px; font-weight: 700; color: var(--text); }
.empty-state-text { font-size: 13px; color: var(--text-2); max-width: 340px; line-height: 1.6; }
.empty-state .btn { margin-top: 12px; }

/* Tooltips (data-tooltip attribute) */
[data-tooltip] { position: relative; }
[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) translateY(4px);
  background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2);
  padding: 5px 9px; border-radius: var(--radius-sm);
  font-size: 11.5px; font-weight: 500; white-space: nowrap;
  box-shadow: var(--shadow-lg);
  opacity: 0; pointer-events: none;
  transition: opacity var(--transition), transform var(--transition);
  z-index: 200;
}
[data-tooltip]:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Section header with gradient accent bar */
.section-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.section-header::before {
  content: ""; width: 4px; height: 18px; border-radius: 2px;
  background: var(--grad-accent); flex-shrink: 0;
}
.section-header-title { font-size: 15px; font-weight: 700; color: var(--text); }

/* Chip / pill */
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
  background: var(--surface-2); color: var(--text-2);
  border: 1px solid var(--border);
}
.chip-accent { background: var(--accent-dim); color: var(--accent-2); border-color: transparent; }

/* ── Accessibility ──────────────────────────────────────────────── */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

// ── Sidebar icons (SVG) ─────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  campaigns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  recommendations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7z"/><path d="M22 19H2"/></svg>`,
  workspace: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  ai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2"/><path d="M12 6v6l4 2"/></svg>`,
  'ad-analysis': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
};

// ── Shared JS (auth guard, toast, sidebar toggle) ───────────────────────
export const SHARED_JS = `
const API = '';

function getToken() { return localStorage.getItem('adlytic_token') || ''; }
function getWsId()  { return localStorage.getItem('adlytic_workspace_id') || ''; }
function setWsId(id) { localStorage.setItem('adlytic_workspace_id', id); }

function logout() {
  localStorage.removeItem('adlytic_token');
  localStorage.removeItem('adlytic_workspace_id');
  window.location.href = '/login';
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { logout(); return null; }
  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    if (err.code === 'ACCOUNT_INACTIVE') {
      window.location.href = err.redirect || '/pending-activation';
      return null;
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error || res.statusText);
    if (err.code) e.code = err.code;
    if (err.reconnectUrl) e.reconnectUrl = err.reconnectUrl;
    if (err.reconnectLabel) e.reconnectLabel = err.reconnectLabel;
    throw e;
  }
  // Guard against the server returning a non-JSON body (HTML error page,
  // truncated response, or serialization failure). Throw a readable error
  // rather than letting "SyntaxError: Unexpected token '<'" bubble up
  // opaquely through every caller.
  return res.json().catch(async () => {
    const preview = (await res.clone().text().catch(() => '')).slice(0, 120);
    throw new Error('Server returned a non-JSON response: ' + (preview || '(empty body)'));
  });
}

async function apiFetchWithTimeout(path, opts, timeoutMs) {
  timeoutMs = timeoutMs || 12000;
  if (typeof AbortController === 'undefined') return apiFetch(path, opts);
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    return await apiFetch(path, Object.assign({}, opts || {}, { signal: controller.signal }));
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Request timed out: ' + path);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

// Poll a SyncJob (GET /api/sync-jobs/:id) until it COMPLETES or FAILS. Every
// "Sync now" entrypoint MUST funnel through this so the UI reflects the REAL
// background outcome instead of the bare 202 enqueue response (which only means
// the job was queued, not that any data was written). opts:
//   { intervalMs = 1500, maxAttempts = 180, onProgress(job, tick) }
// Resolves with the COMPLETED job; throws on FAILED (Error.message = job.error)
// or on timeout. A TOKEN_ENCRYPTION_KEY mismatch surfaces synchronously at the
// POST /sync call (500 + code TOKEN_DECRYPT_FAILED), never here.
async function pollSyncJob(jobId, opts) {
  opts = opts || {};
  var intervalMs = opts.intervalMs || 1500;
  var maxAttempts = opts.maxAttempts || 180;
  for (var i = 0; i < maxAttempts; i++) {
    var job = await apiFetch('/api/sync-jobs/' + encodeURIComponent(jobId));
    if (opts.onProgress) { try { opts.onProgress(job, i); } catch (e) {} }
    if (job && job.status === 'COMPLETED') return job;
    if (job && job.status === 'FAILED') throw new Error(job.error || 'Sync failed');
    await sleep(intervalMs);
  }
  throw new Error('المزامنة تأخذ وقتاً أطول من المتوقع — ستنتهي في الخلفية.');
}

function friendlyApiError(err) {
  if (!err) return 'حدث خطأ. يرجى المحاولة مرة أخرى.';
  if (err.code === 'TOKEN_DECRYPT_FAILED') {
    return 'تعذّر قراءة رمز Meta المحفوظ. أعد ربط حسابك من إعدادات مساحة العمل.';
  }
  var msg = err.message || String(err);
  if (/Another sync is already in progress/i.test(msg)) {
    return 'المزامنة قيد التشغيل — ستتحدّث بياناتك تلقائياً عند الانتهاء.';
  }
  if (/timed out/i.test(msg)) return 'انتهت مهلة الطلب — تحقق من اتصالك وحاول مجدداً.';
  if (/non-JSON response/i.test(msg)) return 'استجابة غير متوقعة من الخادم — أعد تحميل الصفحة.';
  if (/token has expired|please reconnect/i.test(msg)) {
    return 'انتهت صلاحية رمز Meta. أعد الربط من إعدادات مساحة العمل.';
  }
  if (/finish in the background|still running in the background/i.test(msg)) {
    return 'المزامنة تعمل في الخلفية — ستتحدّث لوحة التحكم قريباً.';
  }
  if (/Insufficient permissions/i.test(msg)) return 'تحتاج صلاحية مدير أو مالك لمزامنة البيانات.';
  if (/No ad account/i.test(msg)) return 'اربط حساب Meta الإعلاني من إعدادات مساحة العمل أولاً.';
  return msg;
}

function creativeImgFailed(img) {
  if (!img) return;
  img.classList.add('meta-img-failed');
  img.style.display = 'none';
  var ph = img.parentNode && img.parentNode.querySelector('.meta-img-placeholder');
  if (ph) ph.remove();
  var box = img.parentNode && img.parentNode.querySelector('.meta-img-fallback, .inspector-creative-fallback');
  if (box) { box.style.display = 'flex'; box.classList.add('visible'); }
}
function creativeImgLoaded(img) {
  if (!img) return;
  img.classList.remove('meta-img-loading');
  var ph = img.parentNode && img.parentNode.querySelector('.meta-img-placeholder');
  if (ph) ph.remove();
}

var syncUiState = { polling: false, activeJobId: null };
function syncStorageKey(wsId) { return 'adlytic_active_sync_' + (wsId || ''); }
function rememberActiveSyncJob(wsId, jobId) {
  try { sessionStorage.setItem(syncStorageKey(wsId), jobId); } catch (e) {}
}
function clearActiveSyncJob(wsId) {
  try { sessionStorage.removeItem(syncStorageKey(wsId)); } catch (e) {}
}
function getRememberedSyncJob(wsId) {
  try { return sessionStorage.getItem(syncStorageKey(wsId)); } catch (e) { return null; }
}

function ensureSyncStatusBar(containerId) {
  var host = document.getElementById(containerId);
  if (!host) return null;
  var bar = document.getElementById('sync-status-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sync-status-bar';
    bar.className = 'sync-status-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = '<div class="sync-status-inner">'
      + '<span class="sync-status-spinner" aria-hidden="true"></span>'
      + '<span class="sync-status-text" id="sync-status-text">Syncing data…</span>'
      + '<div class="sync-status-progress" aria-hidden="true"><div class="sync-status-progress-bar" id="sync-status-progress-bar"></div></div>'
      + '<span class="sync-status-meta" id="sync-status-meta"></span>'
      + '</div>';
    host.insertBefore(bar, host.firstChild);
  }
  return bar;
}
function updateSyncStatusBar(job, reused) {
  var bar = document.getElementById('sync-status-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  var text = document.getElementById('sync-status-text');
  var progBar = document.getElementById('sync-status-progress-bar');
  var meta = document.getElementById('sync-status-meta');
  var pct = (job && job.progress != null) ? Number(job.progress) : 0;
  if (job && job.chunksTotal > 0) {
    pct = Math.max(pct, Math.round((job.chunksDone / job.chunksTotal) * 100));
  }
  if (text) {
    text.textContent = (reused && pct < 5)
      ? 'مزامنة تلقائية في الخلفية…'
      : ('جارٍ مزامنة البيانات…' + (pct > 0 ? ' (' + pct + '%)' : ''));
  }
  if (progBar) progBar.style.width = Math.max(4, Math.min(100, pct)) + '%';
  if (meta) meta.textContent = (job && job.rowsUpserted > 0) ? (job.rowsUpserted + ' صف تم تحميله') : '';
}
function hideSyncStatusBar() {
  var bar = document.getElementById('sync-status-bar');
  if (bar) bar.style.display = 'none';
}
function setSyncButtonsDisabled(disabled, selector) {
  var sel = selector || '.js-sync-trigger, #force-sync-btn, .sync-now-btn';
  document.querySelectorAll(sel).forEach(function (btn) {
    btn.disabled = !!disabled;
    if (disabled && btn.id === 'force-sync-btn') {
      btn.dataset.prevLabel = btn.dataset.prevLabel || btn.textContent;
      btn.innerHTML = '<span class="sync-status-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></span>Syncing…';
    } else if (!disabled && btn.id === 'force-sync-btn' && btn.dataset.prevLabel) {
      btn.textContent = btn.dataset.prevLabel;
    }
  });
}

async function runWorkspaceSync(workspaceId, opts) {
  opts = opts || {};
  if (syncUiState.polling && !opts.force) return null;
  var statusContainerId = opts.statusContainerId || 'main-content';
  ensureSyncStatusBar(statusContainerId);
  setSyncButtonsDisabled(true, opts.buttonSelector);
  syncUiState.polling = true;
  try {
    var res = await apiFetch('/api/workspaces/' + workspaceId + '/sync', {
      method: 'POST',
      body: JSON.stringify(opts.body || {}),
    });
    if (!res || !res.jobId) {
      toast('بدأت المزامنة', 'info');
      return res;
    }
    if (res.reused) toast('مزامنة تلقائية في الخلفية…', 'info');
    rememberActiveSyncJob(workspaceId, res.jobId);
    syncUiState.activeJobId = res.jobId;
    updateSyncStatusBar({ progress: 0, chunksDone: 0, chunksTotal: 0 }, !!res.reused);
    var job = await pollSyncJob(res.jobId, {
      onProgress: function (j) {
        updateSyncStatusBar(j, !!res.reused);
        if (opts.onProgress) try { opts.onProgress(j); } catch (e) {}
      },
    });
    clearActiveSyncJob(workspaceId);
    if (opts.onComplete) try { opts.onComplete(job); } catch (e) {}
    return job;
  } finally {
    syncUiState.polling = false;
    syncUiState.activeJobId = null;
    hideSyncStatusBar();
    setSyncButtonsDisabled(false, opts.buttonSelector);
  }
}

async function resumeActiveSyncIfAny(workspaceId, opts) {
  opts = opts || {};
  var jobId = getRememberedSyncJob(workspaceId);
  if (!jobId || syncUiState.polling) return null;
  try {
    var job = await apiFetch('/api/sync-jobs/' + encodeURIComponent(jobId));
    var active = job && (job.status === 'PENDING' || job.status === 'PROCESSING' || job.status === 'RUNNING' || job.status === 'IN_PROGRESS');
    if (!active) { clearActiveSyncJob(workspaceId); return null; }
    ensureSyncStatusBar(opts.statusContainerId || 'main-content');
    setSyncButtonsDisabled(true, opts.buttonSelector);
    syncUiState.polling = true;
    updateSyncStatusBar(job, true);
    toast('System auto-syncing in background…', 'info');
    var completed = await pollSyncJob(jobId, {
      onProgress: function (j) { updateSyncStatusBar(j, true); if (opts.onProgress) try { opts.onProgress(j); } catch (e) {} },
    });
    clearActiveSyncJob(workspaceId);
    if (opts.onComplete) try { opts.onComplete(completed); } catch (e) {}
    return completed;
  } catch (err) {
    console.warn('[sync] resume failed:', err);
    return null;
  } finally {
    syncUiState.polling = false;
    hideSyncStatusBar();
    setSyncButtonsDisabled(false, opts.buttonSelector);
  }
}

var shellState = { me: null, ready: false, initPromise: null };
var SHELL_LOADING = 'جارٍ التحميل…';

function shellInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
}

function populateAppShell(me) {
  var nameEl = document.getElementById('user-name');
  var emailEl = document.getElementById('user-email');
  var avEl = document.getElementById('user-avatar');
  var wsEl = document.getElementById('ws-name');
  if (!me) {
    if (nameEl && nameEl.textContent === SHELL_LOADING) nameEl.textContent = 'مستخدم';
    if (emailEl && !emailEl.textContent) emailEl.textContent = '';
    if (avEl && avEl.textContent === '?') avEl.textContent = '?';
    if (wsEl && wsEl.textContent === SHELL_LOADING) wsEl.textContent = 'مساحة العمل';
    return;
  }
  var userName = me.name || me.email || 'مستخدم';
  if (avEl) avEl.textContent = shellInitials(userName);
  if (nameEl) nameEl.textContent = userName;
  if (emailEl) emailEl.textContent = me.email || '';
  if (wsEl) {
    var wsId = getWsId();
    var membership = Array.isArray(me.memberships)
      ? me.memberships.find(function (m) {
          return m.workspaceId === wsId || (m.workspace && m.workspace.id === wsId);
        }) || me.memberships[0]
      : null;
    var wsName = membership && membership.workspace && membership.workspace.name;
    if (!wsName && wsId) wsName = wsId;
    wsEl.textContent = wsName || 'مساحة العمل';
  }
}

function initAppShell() {
  if (!getToken()) return Promise.resolve(null);
  if (shellState.initPromise) return shellState.initPromise;
  shellState.initPromise = (async function () {
    try {
      var me = await apiFetchWithTimeout('/api/auth/me', {}, 8000);
      if (me && me.isActive === false) {
        window.location.href = '/pending-activation';
        return null;
      }
      shellState.me = me;
      populateAppShell(me);
      return me;
    } catch (err) {
      console.warn('[shell] user init failed:', err);
      populateAppShell(null);
      return null;
    } finally {
      shellState.ready = true;
    }
  })();
  return shellState.initPromise;
}

/** Redirect inactive users to the pending-activation page. Returns false when blocked. */
async function ensureAccountActive() {
  if (!getToken()) { window.location.href = '/login'; return false; }
  try {
    var me = await apiFetch('/api/auth/me');
    if (!me) return false;
    if (me.isActive === false) {
      window.location.href = '/pending-activation';
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[shell] ensureAccountActive failed:', err);
    return false;
  }
}

function startShellLoadingFallback(ms) {
  setTimeout(function () {
    var nameEl = document.getElementById('user-name');
    if (nameEl && nameEl.textContent === SHELL_LOADING) populateAppShell(shellState.me);
  }, ms || 5000);
}

/** Force-hide a page loading overlay after timeout (id pairs: loading + content). */
function forceRevealAfterTimeout(loadingId, contentId, ms) {
  setTimeout(function () {
    var loadingEl = loadingId ? document.getElementById(loadingId) : null;
    if (!loadingEl || loadingEl.style.display === 'none') return;
    console.warn('[shell] loading safety timeout — revealing', loadingId || 'page');
    loadingEl.style.display = 'none';
    if (contentId) {
      var contentEl = document.getElementById(contentId);
      if (contentEl) contentEl.style.display = 'block';
    }
  }, ms || 5000);
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

var TOKEN_DECRYPT_PAGES = ['/dashboard', '/campaigns', '/workspace'];

function shouldShowTokenDecryptBanner() {
  var path = window.location.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (!path) path = '/';
  return TOKEN_DECRYPT_PAGES.indexOf(path) >= 0;
}

function showTokenDecryptBanner(payload) {
  var banner = document.getElementById('token-decrypt-banner');
  if (!banner) return;
  var msgEl = document.getElementById('token-decrypt-banner-msg');
  var linkEl = document.getElementById('token-decrypt-banner-cta');
  if (msgEl) msgEl.textContent = payload.error || payload.message || 'Stored Meta token could not be decrypted.';
  if (linkEl) {
    linkEl.href = payload.reconnectUrl || '/workspace?connect=manual';
    linkEl.textContent = payload.reconnectLabel || 'Reconnect Meta';
  }
  banner.classList.add('visible');
  banner.setAttribute('aria-hidden', 'false');
}

function hideTokenDecryptBanner() {
  var banner = document.getElementById('token-decrypt-banner');
  if (!banner) return;
  banner.classList.remove('visible');
  banner.setAttribute('aria-hidden', 'true');
}

async function checkTokenDecryptBanner() {
  if (!getToken() || !shouldShowTokenDecryptBanner()) return;
  var wsId = getWsId();
  if (!wsId) return;
  try {
    var res = await fetch('/api/workspaces/' + wsId + '/token-health', {
      headers: { Authorization: 'Bearer ' + getToken() },
    });
    if (res.status === 503) {
      var body = await res.json().catch(function () { return {}; });
      if (body && body.code === 'TOKEN_DECRYPT_FAILED') {
        showTokenDecryptBanner(body);
        return;
      }
    }
    if (res.ok) {
      hideTokenDecryptBanner();
      try { sessionStorage.removeItem('adlytic_token_decrypt_banner_dismissed'); } catch (e) {}
    }
  } catch (err) {
    console.warn('[shell] token-health check failed:', err);
  }
}

function initTokenDecryptBanner() {
  var dismiss = document.getElementById('token-decrypt-banner-dismiss');
  if (dismiss) {
    dismiss.addEventListener('click', function () {
      hideTokenDecryptBanner();
      try { sessionStorage.setItem('adlytic_token_decrypt_banner_dismissed', getWsId() || '1'); } catch (e) {}
    });
  }
  var wsId = getWsId();
  var dismissed = false;
  try { dismissed = sessionStorage.getItem('adlytic_token_decrypt_banner_dismissed') === wsId; } catch (e) {}
  if (!dismissed) checkTokenDecryptBanner();
}

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n) { if (n == null) return '—'; return Number(n).toFixed(1) + '%'; }
// factor: minor-unit factor for the currency (100 for USD/EUR/…, 1 for IQD).
// Defaults to currency === 'IQD' ? 1 : 100 so legacy callers that don't pass
// a factor still produce the same output as before this change.
function fmtMoney(n, currency, factor) {
  if (n == null) return '—';
  if (factor == null) factor = currency === 'IQD' ? 1 : 100;
  var major = Number(n) / factor;
  if (factor === 1) return Math.round(major).toLocaleString(undefined, { useGrouping: false }) + ' ' + (currency || '');
  return major.toLocaleString(undefined, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (currency || '');
}

function deltaClass(dir, goodWhenUp) {
  if (dir === 'flat') return 'flat';
  if (dir === 'up' && goodWhenUp)  return 'up-good';
  if (dir === 'up' && !goodWhenUp) return 'up-bad';
  if (dir === 'down' && goodWhenUp)  return 'down-bad';
  return 'down-good';
}
function deltaArrow(dir) {
  if (dir === 'up') return '↑';
  if (dir === 'down') return '↓';
  return '→';
}
function deltaLabel(kpi) {
  if (kpi.deltaPct == null) return '';
  return deltaArrow(kpi.direction) + ' ' + Math.abs(kpi.deltaPct * 100).toFixed(1) + '%';
}

function severityBadge(s) {
  const map = { LOW:'badge-gray', MEDIUM:'badge-yellow', HIGH:'badge-yellow', CRITICAL:'badge-red' };
  return '<span class="badge ' + (map[s]||'badge-gray') + '">' + s + '</span>';
}
function statusBadge(s) {
  const map = { ACTIVE:'badge-green', PAUSED:'badge-yellow', ARCHIVED:'badge-gray', DELETED:'badge-red' };
  return '<span class="badge ' + (map[s]||'badge-gray') + '">' + s + '</span>';
}

/**
 * Switch dashboard mode (pro / beginner) by POSTing the chosen mode to the
 * backend, which writes a Set-Cookie response. We then hard-reload so the
 * next /dashboard render picks the right page renderer. We do NOT optimistically
 * swap CSS — the two views are entirely different markup served by different
 * Hono routes; only a server-side render can produce the right page.
 */
async function setDashboardMode(mode) {
  try {
    await fetch('/api/dashboard-mode', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode }),
    });
  } catch (err) {
    console.warn('[mode-toggle] failed to persist mode:', err);
  }
  window.location.reload();
}

// Expose shared helpers on window for page-specific inline scripts (strict IIFEs).
window.getToken = getToken;
window.getWsId = getWsId;
window.setWsId = setWsId;
window.logout = logout;
window.apiFetch = apiFetch;
window.apiFetchWithTimeout = apiFetchWithTimeout;
window.initAppShell = initAppShell;
window.toast = toast;
window.friendlyApiError = friendlyApiError;
window.creativeImgFailed = creativeImgFailed;
window.creativeImgLoaded = creativeImgLoaded;
window.runWorkspaceSync = runWorkspaceSync;
window.resumeActiveSyncIfAny = resumeActiveSyncIfAny;
window.checkTokenDecryptBanner = checkTokenDecryptBanner;
window.pollSyncJob = pollSyncJob;
window.severityBadge = severityBadge;
window.statusBadge = statusBadge;

// Global ripple: coordinates the click origin for the .btn::after glow.
document.addEventListener('pointerdown', function (e) {
  var btn = e.target && e.target.closest ? e.target.closest('.btn') : null;
  if (!btn || btn.disabled || btn.classList.contains('is-loading')) return;
  var rect = btn.getBoundingClientRect();
  btn.style.setProperty('--rx', ((e.clientX - rect.left) / rect.width * 100) + '%');
  btn.style.setProperty('--ry', ((e.clientY - rect.top) / rect.height * 100) + '%');
  btn.classList.remove('is-rippling');
  void btn.offsetWidth;
  btn.classList.add('is-rippling');
  setTimeout(function () { btn.classList.remove('is-rippling'); }, 520);
}, true);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });
  // Mode toggle — both buttons are wired; clicking the already-active one is
  // a no-op (the server will reload the same page).
  document.querySelectorAll('.mode-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var m = btn.getAttribute('data-mode');
      if (m === 'pro' || m === 'beginner') setDashboardMode(m);
    });
  });
  if (getToken()) {
    initAppShell();
    initTokenDecryptBanner();
    startShellLoadingFallback(5000);
  }
});
`;

// ── Sidebar HTML ────────────────────────────────────────────────────────
export function sidebar(active: string): string {
  const nav = [
    { id: 'dashboard',       label: 'لوحة التحكم',      href: '/dashboard' },
    { id: 'campaigns',       label: 'الحملات',           href: '/campaigns' },
    { id: 'ad-analysis',     label: 'تحليل الإعلان',     href: '/ad-analysis' },
    { id: 'recommendations', label: 'التوصيات',          href: '/recommendations' },
    { id: 'workspace',       label: 'مساحة العمل',       href: '/workspace' },
    { id: 'ai',              label: 'المساعد الذكي',     href: '/ai' },
    { id: 'settings',        label: 'الإعدادات',         href: '/settings' },
  ];
  const links = nav.map(n => `
    <a href="${n.href}" class="nav-item${active === n.id ? ' active' : ''}">
      ${ICONS[n.id] ?? ''} ${n.label}
    </a>`).join('');

  return `
<aside class="sidebar" id="sidebar">
  <div class="sidebar-logo">
    <div class="sidebar-logo-mark">A</div>
    <span class="sidebar-logo-text">Adlytic</span>
    <span class="sidebar-logo-badge">Beta</span>
  </div>
  <nav class="sidebar-nav" aria-label="التنقل الرئيسي">
    <div class="nav-section-label">القائمة الرئيسية</div>
    ${links}
  </nav>
  <div class="sidebar-footer">
    <div class="sidebar-user" id="sidebar-user">
      <div class="avatar" id="user-avatar">?</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name" id="user-name">Loading…</div>
        <div class="sidebar-user-email" id="user-email"></div>
      </div>
    </div>
    <a class="nav-item" id="logout-btn" style="margin-top:4px;cursor:pointer;">
      ${ICONS['logout']} تسجيل الخروج
    </a>
  </div>
</aside>`;
}

// ── Topbar HTML ─────────────────────────────────────────────────────────
// `currentMode` selects which segment of the dashboard mode toggle is
// highlighted. When undefined, the toggle is not rendered (used for pages
// where the toggle is irrelevant — settings, login, register, etc.).
export function topbar(pageTitle: string, currentMode?: 'pro' | 'beginner'): string {
  const toggle = currentMode
    ? `<div class="mode-toggle" role="group" aria-label="Dashboard mode">
        <button class="mode-toggle-btn ${currentMode === 'pro' ? 'active' : ''}" data-mode="pro" id="mode-btn-pro">احترافي</button>
        <button class="mode-toggle-btn ${currentMode === 'beginner' ? 'active' : ''}" data-mode="beginner" id="mode-btn-beginner">مبتدئ</button>
      </div>`
    : '';
  return `
<header class="topbar">
  <button class="topbar-btn mobile-menu-btn" id="mobile-menu-btn" style="margin-right:8px;">
    ${ICONS['menu']}
  </button>
  <span class="topbar-title">${pageTitle}</span>
  ${toggle}
  <div class="topbar-ws" id="ws-selector" title="Switch workspace">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    <span class="topbar-ws-name" id="ws-name">جارٍ التحميل…</span>
    ${ICONS['chevron']}
  </div>
  <button class="topbar-btn" title="Notifications">${ICONS['bell']}</button>
</header>`;
}

// ── Full page layout ────────────────────────────────────────────────────
// `mode` is set ONLY by the dashboard page renderers; other pages omit it and
// the toggle is hidden. The server is the source of truth for current mode
// (via cookie) — the rendered page already reflects the choice.
export function layout(opts: {
  title: string;
  active: string;
  content: string;
  scripts?: string;
  extraHead?: string;
  mode?: 'pro' | 'beginner';
}): string {
  const { title, active, content, scripts = '', extraHead = '', mode } = opts;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0a0b">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>${title} — Adlytic</title>
  <style>${SHARED_CSS}</style>
  ${extraHead}
</head>
<body>
  <div id="toast-container"></div>
  <div class="app-shell">
    ${sidebar(active)}
    <div class="main">
      ${topbar(title, mode)}
      <div id="token-decrypt-banner" class="token-decrypt-banner" role="alert" aria-hidden="true">
        <svg class="token-decrypt-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="token-decrypt-banner-body">
          <div class="token-decrypt-banner-title">تعذّر قراءة رمز Meta</div>
          <div class="token-decrypt-banner-text" id="token-decrypt-banner-msg">لم يتمكن النظام من فك تشفير رمز الوصول المحفوظ — تغيّر مفتاح التشفير.</div>
        </div>
        <div class="token-decrypt-banner-actions">
          <a id="token-decrypt-banner-cta" href="/workspace?connect=manual" class="btn-reconnect">إعادة ربط Meta</a>
          <button type="button" class="token-decrypt-banner-dismiss" id="token-decrypt-banner-dismiss" title="Dismiss">×</button>
        </div>
      </div>
      <div class="page-content">
        ${content}
      </div>
    </div>
  </div>
  <script>${SHARED_JS}</script>
  ${scripts}
</body>
</html>`;
}
