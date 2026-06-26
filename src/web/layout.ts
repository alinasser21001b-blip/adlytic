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
  --accent-dim: rgba(99,102,241,0.12);
  --success: #22c55e;
  --success-dim: rgba(34,197,94,0.12);
  --warning: #f59e0b;
  --warning-dim: rgba(245,158,11,0.12);
  --error: #ef4444;
  --error-dim: rgba(239,68,68,0.12);
  --critical: #dc2626;
  --critical-dim: rgba(220,38,38,0.12);
  --sidebar-w: 220px;
  --topbar-h: 56px;
  --radius: 8px;
  --radius-sm: 5px;
  --radius-lg: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.5);
  --transition: 150ms cubic-bezier(0.4,0,0.2,1);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 14px; -webkit-font-smoothing: antialiased; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  line-height: 1.5;
  min-height: 100vh;
}
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
  background: var(--accent);
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 13px; color: #fff; letter-spacing: -0.5px;
  flex-shrink: 0;
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
  background: var(--accent);
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  transition: border-color var(--transition);
}
.kpi-card:hover { border-color: var(--border-2); }
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
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500;
  border: none; cursor: pointer;
  transition: all var(--transition);
  text-decoration: none;
  white-space: nowrap;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #4f46e5; }
.btn-secondary {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover { background: var(--surface-hover); border-color: var(--border-2); }
.btn-danger { background: var(--error-dim); color: var(--error); border: 1px solid transparent; }
.btn-danger:hover { background: var(--error); color: #fff; }
.btn-ghost { background: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-hover); color: var(--text); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-lg { padding: 10px 20px; font-size: 14px; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

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
@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

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
`;

// ── Sidebar icons (SVG) ─────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  campaigns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  recommendations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7z"/><path d="M22 19H2"/></svg>`,
  workspace: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  ai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2"/><path d="M12 6v6l4 2"/></svg>`,
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
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

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}
function fmtPct(n) { if (n == null) return '—'; return Number(n).toFixed(1) + '%'; }
// factor: minor-unit factor for the currency (100 for USD/EUR/…, 1 for IQD).
// Defaults to currency === 'IQD' ? 1 : 100 so legacy callers that don't pass
// a factor still produce the same output as before this change.
function fmtMoney(n, currency, factor) {
  if (n == null) return '—';
  if (factor == null) factor = currency === 'IQD' ? 1 : 100;
  var major = Number(n) / factor;
  if (factor === 1) return Math.round(major).toLocaleString() + ' ' + (currency || '');
  return major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (currency || '');
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
});
`;

// ── Sidebar HTML ────────────────────────────────────────────────────────
export function sidebar(active: string): string {
  const nav = [
    { id: 'dashboard',       label: 'Dashboard',       href: '/dashboard' },
    { id: 'campaigns',       label: 'Campaigns',        href: '/campaigns' },
    { id: 'recommendations', label: 'Recommendations',  href: '/recommendations' },
    { id: 'workspace',       label: 'Workspace',        href: '/workspace' },
    { id: 'ai',              label: 'AI Assistant',     href: '/ai' },
    { id: 'settings',        label: 'Settings',         href: '/settings' },
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
  <nav class="sidebar-nav">
    <div class="nav-section-label">Main</div>
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
      ${ICONS['logout']} Logout
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
    <span class="topbar-ws-name" id="ws-name">Loading…</span>
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
