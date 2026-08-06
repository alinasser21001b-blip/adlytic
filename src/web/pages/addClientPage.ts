// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/addClientPage.ts
//
//  Operator cockpit over the Connection Orchestrator (Arabic RTL, admin-only).
//
//  This page used to render a static 4-step checklist the operator followed by
//  hand. It now DRIVES the orchestrator instead: it creates onboarding records,
//  renders the engine's own live plan (planJson) as a progress list, surfaces
//  the single blocking requirement when the engine reports BLOCKED, shows the
//  audit timeline, and polls until the record reaches a terminal state.
//
//  Endpoints consumed (all gated by requirePlatformAdmin):
//    POST /api/admin/onboarding                 — start / re-attach
//    GET  /api/admin/onboarding?workspaceId=    — records for a workspace
//    GET  /api/admin/onboarding/:id             — record + timeline
//    POST /api/admin/onboarding/:id/check       — "تحقق الآن" nudge
//    GET  /api/admin/customers                  — workspace picker source
//    GET  /api/admin/meta/discover-accounts     — secondary visibility table
//
//  Every server-provided string (account names, engine messages, blocked
//  requirements, error text) is rendered through esc() — never interpolated raw.
// ════════════════════════════════════════════════════════════════════════

export function addClientPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إضافة عميل — Adlytic</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
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
      --accent-2: #E8C07A;
      --success: #34A871;
      --warning: #C77A1F;
      --error: #E2604F;
      --font: 'Tajawal', sans-serif;
    }
    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }
    a { color: inherit; text-decoration: none; }
    button, input, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; border: none; background: none; }
    .app { display: none; min-height: 100vh; }
    .access-gate {
      position: fixed; inset: 0; z-index: 9999; background: var(--bg);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
      color: var(--text-2); font-size: 14px; font-weight: 600; text-align: center; padding: 24px;
    }
    .access-gate.hidden { display: none; }
    .access-gate .gate-spinner {
      width: 30px; height: 30px; border: 3px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%; animation: gate-spin 0.7s linear infinite;
    }
    @keyframes gate-spin { to { transform: rotate(360deg); } }
    .sidebar {
      width: 240px; flex-shrink: 0; background: linear-gradient(180deg, #1A1613, #14110F);
      border-left: 1px solid var(--border); display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh;
    }
    .logo { padding: 22px 20px 16px; border-bottom: 1px solid var(--border); }
    .logo-brand { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .logo-brand span { color: var(--accent); }
    .logo-sub { font-size: 11px; color: var(--text-3); margin-top: 4px; font-weight: 600; }
    .nav { flex: 1; padding: 14px 10px; display: flex; flex-direction: column; gap: 4px; }
    .nav-label { font-size: 10px; font-weight: 700; color: var(--text-3); padding: 8px 12px 6px; letter-spacing: 0.04em; }
    .nav-item {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
      color: var(--text-2); font-weight: 600; font-size: 13.5px; transition: 0.15s;
    }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: rgba(217,167,89,0.14); color: var(--accent-2); }
    .nav-foot { padding: 12px; border-top: 1px solid var(--border); }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      height: 60px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; border-bottom: 1px solid var(--border); background: rgba(26,22,19,0.92);
      backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 20;
    }
    .topbar h1 { font-size: 16px; font-weight: 800; }
    .topbar-actions { display: flex; gap: 8px; align-items: center; }
    .content { padding: 22px 24px 40px; max-width: 1100px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 14px; border-radius: 9px; font-weight: 700; font-size: 13px;
      border: 1px solid transparent; transition: 0.15s;
    }
    .btn-primary { background: var(--accent); color: #100E0D; }
    .btn-primary:hover { filter: brightness(1.05); }
    .btn-secondary { background: var(--surface-2); border-color: var(--border); color: var(--text); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
    .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .panel {
      border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
      margin-bottom: 16px; overflow: hidden;
    }
    .panel-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;
    }
    .panel-title { font-size: 15px; font-weight: 800; }
    .panel-sub { font-size: 12px; color: var(--text-3); margin-top: 2px; }
    .panel-body { padding: 16px; }
    .intro {
      color: var(--text-2); font-size: 13.5px; line-height: 1.85; margin-bottom: 18px;
      border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
      background: linear-gradient(145deg, rgba(217,167,89,0.05), var(--surface));
    }
    @media (max-width: 760px) { .sidebar { display: none; } }
    .field {
      background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
      padding: 9px 12px; color: var(--text); min-width: 0;
    }
    .field:focus { outline: none; border-color: rgba(217,167,89,0.55); }
    select.field { cursor: pointer; }
    .form-grid { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 10px; align-items: end; }
    @media (max-width: 860px) { .form-grid { grid-template-columns: 1fr; } }
    .form-label { display: block; font-size: 11.5px; font-weight: 700; color: var(--text-3); margin-bottom: 6px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

    /* ── State pill ─────────────────────────────────────────────────────── */
    .state-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .state-pill {
      display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px; border-radius: 999px;
      font-size: 14px; font-weight: 800; border: 1px solid transparent;
    }
    .state-pill .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .state-pill.live .dot { animation: pulse-dot 1.5s ease-in-out infinite; }
    .state-accent { background: rgba(217,167,89,0.15); color: var(--accent-2); border-color: rgba(217,167,89,0.4); }
    .state-success { background: rgba(52,168,113,0.15); color: var(--success); border-color: rgba(52,168,113,0.4); }
    .state-warn { background: rgba(199,122,31,0.15); color: var(--warning); border-color: rgba(199,122,31,0.42); }
    .state-error { background: rgba(226,96,79,0.13); color: var(--error); border-color: rgba(226,96,79,0.4); }
    @keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }

    /* ── Live plan ──────────────────────────────────────────────────────── */
    .plan { list-style: none; }
    .plan-step { display: flex; gap: 12px; align-items: flex-start; padding: 13px 2px; }
    .plan-step + .plan-step { border-top: 1px solid var(--border); }
    .plan-dot {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12.5px;
      background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border);
    }
    .plan-label { font-weight: 700; font-size: 14px; color: var(--text-2); line-height: 1.6; }
    .plan-meta { font-size: 11.5px; color: var(--text-3); margin-top: 3px; }
    .plan-step.done .plan-dot { background: rgba(52,168,113,0.16); color: var(--success); border-color: rgba(52,168,113,0.4); }
    .plan-step.done .plan-label { color: var(--text); }
    .plan-step.active .plan-dot {
      background: rgba(217,167,89,0.2); color: var(--accent-2); border-color: rgba(217,167,89,0.6);
      animation: pulse-step 1.7s ease-in-out infinite;
    }
    .plan-step.active .plan-label { color: var(--accent-2); font-weight: 800; }
    .plan-step.pending .plan-label { color: var(--text-3); }
    @keyframes pulse-step {
      0%, 100% { box-shadow: 0 0 0 0 rgba(217,167,89,0.35); }
      50% { box-shadow: 0 0 0 7px rgba(217,167,89,0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .plan-step.active .plan-dot, .state-pill.live .dot, .access-gate .gate-spinner { animation: none; }
      .plan-step.active .plan-dot { box-shadow: 0 0 0 3px rgba(217,167,89,0.28); }
    }

    /* ── Requirement / error / waiting cards ────────────────────────────── */
    .callout { border-radius: 12px; padding: 16px 18px; margin-bottom: 16px; border: 1px solid transparent; }
    .callout-title { font-weight: 800; font-size: 14.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .callout-text { line-height: 1.95; font-size: 13.5px; color: var(--text); }
    .callout-warn { border-color: rgba(199,122,31,0.45); background: rgba(199,122,31,0.09); }
    .callout-warn .callout-title { color: var(--warning); }
    .callout-err { border-color: rgba(226,96,79,0.45); background: rgba(226,96,79,0.08); }
    .callout-err .callout-title { color: var(--error); }
    .callout-info { border-color: rgba(217,167,89,0.4); background: rgba(217,167,89,0.07); }
    .callout-info .callout-title { color: var(--accent-2); }
    .callout-ok { border-color: rgba(52,168,113,0.42); background: rgba(52,168,113,0.08); }
    .callout-ok .callout-title { color: var(--success); }
    .callout-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

    /* ── Timeline ───────────────────────────────────────────────────────── */
    .tl { display: flex; flex-direction: column; }
    .tl-item {
      display: grid; grid-template-columns: 138px 108px 1fr; gap: 10px;
      padding: 10px 2px; border-bottom: 1px solid var(--border); align-items: start; font-size: 12.5px;
    }
    .tl-item:last-child { border-bottom: none; }
    .tl-time { color: var(--text-3); font-size: 11.5px; direction: ltr; text-align: right; unicode-bidi: embed; }
    .tl-msg { color: var(--text-2); line-height: 1.75; }
    .tl-states { color: var(--text-3); font-size: 11px; margin-top: 3px; direction: ltr; text-align: right; unicode-bidi: embed; }
    @media (max-width: 700px) { .tl-item { grid-template-columns: 1fr; gap: 4px; } .tl-time { text-align: right; } }

    /* ── Onboarding list rows ───────────────────────────────────────────── */
    .ob-row {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 14px; border: 1px solid var(--border); border-radius: 11px;
      background: var(--surface-2); margin-bottom: 8px; text-align: right; transition: 0.15s; flex-wrap: wrap;
    }
    .ob-row:hover { border-color: rgba(217,167,89,0.55); }
    .ob-row.selected { border-color: var(--accent); background: rgba(217,167,89,0.09); }
    .ob-row:last-child { margin-bottom: 0; }

    table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.data th {
      text-align: right; padding: 10px 12px; font-size: 11px; color: var(--text-3);
      border-bottom: 1px solid var(--border); font-weight: 700;
    }
    table.data td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.data tr:hover td { background: rgba(255,255,255,0.015); }
    .table-wrap { overflow-x: auto; }
    td.currency-cell { font-weight: 800; color: var(--accent-2); white-space: nowrap; }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; border: 1px solid transparent; white-space: nowrap;
    }
    .badge-ok { background: rgba(52,168,113,0.14); color: var(--success); border-color: rgba(52,168,113,0.3); }
    .badge-warn { background: rgba(199,122,31,0.14); color: var(--warning); border-color: rgba(199,122,31,0.3); }
    .badge-err { background: rgba(226,96,79,0.12); color: var(--error); border-color: rgba(226,96,79,0.3); }
    .badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
    .badge-gold { background: rgba(217,167,89,0.14); color: var(--accent-2); border-color: rgba(217,167,89,0.3); }
    .muted { color: var(--text-3); font-size: 12px; }
    .mono { font-family: monospace; direction: ltr; text-align: left; unicode-bidi: embed; }
    .error-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(226,96,79,0.35);
      background: rgba(226,96,79,0.08); color: var(--error); margin-bottom: 14px;
    }
    .info-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(199,122,31,0.35);
      background: rgba(199,122,31,0.08); color: var(--warning); margin-bottom: 14px; line-height: 1.8;
    }
    .empty { text-align: center; padding: 28px 12px; color: var(--text-3); }
  </style>
</head>
<body>
<div class="access-gate" id="access-gate">
  <div class="gate-spinner"></div>
  <div>جارٍ التحقق من الصلاحية…</div>
</div>
<div class="app">
  <aside class="sidebar">
    <div class="logo">
      <div class="logo-brand">Ad<span>lytic</span></div>
      <div class="logo-sub">لوحة المالك · إضافة عميل</div>
    </div>
    <nav class="nav">
      <div class="nav-label">⚙️ العمليات</div>
      <a class="nav-item" href="/admin">لوحة الإدارة</a>
      <a class="nav-item active" href="/admin/add-client">إضافة عميل</a>
      <a class="nav-item" href="/admin/meta-readiness">جاهزية Meta</a>
      <a class="nav-item" href="/dashboard">لوحة التحكم</a>
    </nav>
    <div class="nav-foot">
      <div class="muted" id="admin-email">—</div>
      <button class="btn btn-secondary btn-sm" id="btn-logout" style="margin-top:8px;width:100%;">تسجيل الخروج</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <h1>إضافة عميل</h1>
      <div class="topbar-actions">
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث</button>
      </div>
    </header>

    <main class="content">
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <div class="intro">
        يقود <strong>منسّق الربط</strong> عملية إضافة العميل بالكامل: يطلب الوصول لحساب العميل الإعلاني، يراقب موافقة العميل في مدير الأعمال،
        يُسند الحساب لمستخدم النظام ويربطه بالمنصة، ثم يشغّل أول مزامنة — دون تدخّل يدوي. اختر مساحة عمل العميل وألصق معرّف حسابه الإعلاني، وتابع التقدّم مباشرةً أدناه.
      </div>

      <!-- 1 ── Start a connection ─────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">ابدأ ربط عميل</div>
            <div class="panel-sub">اختر مساحة العمل وأدخل معرّف الحساب الإعلاني</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div>
              <label class="form-label" for="ws-select">مساحة عمل العميل</label>
              <select class="field" id="ws-select" style="width:100%;">
                <option value="">جارٍ تحميل مساحات العمل…</option>
              </select>
              <input class="field mono" id="ws-input" placeholder="معرّف مساحة العمل" style="width:100%;display:none;" />
            </div>
            <div>
              <label class="form-label" for="acct-input">معرّف الحساب الإعلاني</label>
              <input class="field mono" id="acct-input" placeholder="act_1234567890 أو 1234567890" style="width:100%;" />
            </div>
            <div>
              <button class="btn btn-primary" id="btn-start" style="width:100%;">ابدأ الربط</button>
            </div>
          </div>
          <div class="muted" style="margin-top:10px;line-height:1.8;">
            يمكن لصق الأرقام فقط — تُضاف البادئة <span class="mono">act_</span> تلقائياً. إعادة البدء لنفس الحساب تفتح الطلب القائم بدل إنشاء طلب مكرّر.
          </div>
          <div id="start-error" class="error-box" style="display:none;margin-top:12px;margin-bottom:0;"></div>
        </div>
      </section>

      <!-- 2 ── Live progress ──────────────────────────────────────────── -->
      <section class="panel" id="progress-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">تقدّم الربط المباشر</div>
            <div class="panel-sub" id="progress-sub">—</div>
          </div>
          <div class="toolbar">
            <button class="btn btn-primary btn-sm" id="btn-check-now">تحقق الآن</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="state-row" id="state-row"></div>
          <div id="callouts"></div>
          <ol class="plan" id="plan-list"></ol>
        </div>
      </section>

      <!-- 6 ── Timeline ───────────────────────────────────────────────── -->
      <section class="panel" id="timeline-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">سجل الأحداث</div>
            <div class="panel-sub">كل ما فعله المنسّق — الأحدث أولاً</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="tl" id="timeline"></div>
        </div>
      </section>

      <!-- 8 ── Existing onboardings ───────────────────────────────────── -->
      <section class="panel" id="list-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">طلبات الربط لهذه المساحة</div>
            <div class="panel-sub">اضغط على أي طلب لمتابعته</div>
          </div>
        </div>
        <div class="panel-body" id="ob-list"></div>
      </section>

      <!-- Secondary ── Currently visible accounts ─────────────────────── -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">الحسابات المرئية حالياً</div>
            <div class="panel-sub" id="discover-sub">الحسابات الظاهرة لتوكن مستخدم النظام</div>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <div id="discover-status" class="panel-body" style="display:none;"></div>
          <div class="table-wrap">
            <table class="data" id="accounts-table" style="display:none;">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المعرّف</th>
                  <th>العملة</th>
                  <th>الحالة</th>
                  <th>مرتبط؟</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="accounts-tbody"></tbody>
            </table>
          </div>
          <div id="accounts-empty" class="empty" style="display:none;">لا حسابات مرئية بعد — تأكد من موافقة العميل وتعيين الحساب لمستخدم النظام.</div>
        </div>
      </section>
    </main>
  </div>
</div>

<script>
(function () {
  var POLL_MS = 10000;
  var MAX_POLL_FAILURES = 3;
  var BM_URL = 'https://business.facebook.com/settings/ad-accounts';

  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    window.location.href = '/login';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Local view state ────────────────────────────────────────────────────
  var view = {
    workspaces: [],
    workspaceMode: 'select',   // 'select' | 'input' (fallback when none listed)
    workspaceId: '',
    onboarding: null,
    timeline: [],
    pollTimer: null,
    pollToken: 0,              // invalidates in-flight polls after a switch
    pollFailures: 0,
  };

  // ── Vocabulary (mirrors src/orchestrator/contracts.ts) ──────────────────
  var STATE_META = {
    REQUEST_CREATED:         { label: 'تم إنشاء الطلب',        cls: 'state-accent'  },
    WAITING_EXTERNAL_ACTION: { label: 'بانتظار إجراء العميل',  cls: 'state-warn'    },
    CONNECTING:              { label: 'جارٍ الربط',            cls: 'state-accent'  },
    VERIFYING:               { label: 'جارٍ التحقق',           cls: 'state-accent'  },
    SYNCING:                 { label: 'جارٍ المزامنة',         cls: 'state-accent'  },
    READY:                   { label: 'جاهز',                  cls: 'state-success' },
    BLOCKED:                 { label: 'متوقّف — إجراء مطلوب',  cls: 'state-error'   },
    FAILED:                  { label: 'فشل',                   cls: 'state-error'   },
  };
  var TERMINAL = { READY: true, FAILED: true };

  var EVENT_KIND_META = {
    STATE_CHANGE:      { label: 'تغيير حالة',   cls: 'badge-gold'  },
    STEP_EXECUTED:     { label: 'تنفيذ خطوة',   cls: 'badge-gold'  },
    STEP_VERIFIED:     { label: 'تحقّق',        cls: 'badge-ok'    },
    RECONCILED:        { label: 'مطابقة',       cls: 'badge-muted' },
    CAPABILITY_CHANGE: { label: 'تغيّر القدرات', cls: 'badge-muted' },
    ERROR:             { label: 'خطأ',          cls: 'badge-err'   },
    NOTE:              { label: 'ملاحظة',       cls: 'badge-muted' },
  };

  function stateMeta(s) {
    return STATE_META[s] || { label: String(s == null ? '—' : s), cls: 'state-accent' };
  }
  function stateBadgeClass(s) {
    if (s === 'READY') return 'badge-ok';
    if (s === 'BLOCKED' || s === 'FAILED') return 'badge-err';
    if (s === 'WAITING_EXTERNAL_ACTION') return 'badge-warn';
    return 'badge-gold';
  }

  // Currency code → Arabic label. Falls back to the raw code when unknown.
  var CURRENCY_AR = {
    IQD: 'دينار عراقي',
    USD: 'دولار أمريكي',
    EUR: 'يورو',
    AED: 'درهم إماراتي',
    SAR: 'ريال سعودي',
  };
  function currencyLabel(code) {
    if (!code) return '—';
    var c = String(code).toUpperCase();
    var name = CURRENCY_AR[c];
    return name ? (name + ' (' + c + ')') : c;
  }

  // Meta ad-account status codes → Arabic badge.
  function accountStatusBadge(status) {
    var map = {
      1: ['نشط', 'badge-ok'],
      2: ['معطّل', 'badge-err'],
      3: ['غير مسوّى', 'badge-warn'],
      7: ['قيد مراجعة المخاطر', 'badge-warn'],
      8: ['بانتظار التسوية', 'badge-warn'],
      9: ['فترة سماح', 'badge-warn'],
      100: ['بانتظار الإغلاق', 'badge-warn'],
      101: ['مغلق', 'badge-err'],
    };
    var entry = map[status] || ['حالة ' + status, 'badge-muted'];
    return '<span class="badge ' + entry[1] + '">' + esc(entry[0]) + '</span>';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  /** Human "in N minutes" / "N minutes ago" in Arabic, Latin digits. */
  function fmtRelative(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = d.getTime() - Date.now();
    var future = diff >= 0;
    var mins = Math.round(Math.abs(diff) / 60000);
    var text;
    if (mins < 1) text = 'أقل من دقيقة';
    else if (mins < 60) text = mins + ' دقيقة';
    else if (mins < 1440) text = Math.round(mins / 60) + ' ساعة';
    else text = Math.round(mins / 1440) + ' يوم';
    return future ? ('خلال ' + text) : ('قبل ' + text);
  }

  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token() || ''),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showGateError(msg) {
    var gate = document.getElementById('gate-error');
    gate.style.display = '';
    gate.textContent = msg;
  }
  function isAuthError(e) { return !!e && (e.status === 401 || e.status === 403); }

  // ════════════════════════════════════════════════════════════════════════
  //  Workspace picker — reuses GET /api/admin/customers (owner console list)
  // ════════════════════════════════════════════════════════════════════════
  async function loadWorkspaces() {
    var sel = document.getElementById('ws-select');
    var inp = document.getElementById('ws-input');
    try {
      var res = await api('/api/admin/customers?take=200&status=all&tier=all');
      var seen = {};
      var rows = [];
      (res.customers || []).forEach(function (cust) {
        (cust.workspaces || []).forEach(function (ws) {
          if (!ws || !ws.id || seen[ws.id]) return;
          seen[ws.id] = true;
          rows.push({ id: ws.id, name: ws.name || '—', email: cust.email || '' });
        });
      });
      view.workspaces = rows;
      if (!rows.length) {
        // No workspaces to pick from — degrade to a raw id input rather than
        // blocking the operator entirely.
        view.workspaceMode = 'input';
        sel.style.display = 'none';
        inp.style.display = '';
        return;
      }
      sel.innerHTML = '<option value="">— اختر مساحة عمل —</option>' + rows.map(function (w) {
        var label = w.name + (w.email ? ' — ' + w.email : '');
        return '<option value="' + esc(w.id) + '">' + esc(label) + '</option>';
      }).join('');
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      view.workspaceMode = 'input';
      sel.style.display = 'none';
      inp.style.display = '';
      showStartError('تعذّر تحميل مساحات العمل — أدخل معرّف مساحة العمل يدوياً. (' + (e.message || '') + ')');
    }
  }

  function currentWorkspaceId() {
    if (view.workspaceMode === 'input') {
      return (document.getElementById('ws-input').value || '').trim();
    }
    return document.getElementById('ws-select').value || '';
  }

  function showStartError(msg) {
    var box = document.getElementById('start-error');
    box.style.display = '';
    box.textContent = msg;
  }
  function clearStartError() {
    var box = document.getElementById('start-error');
    box.style.display = 'none';
    box.textContent = '';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Rendering the active onboarding
  // ════════════════════════════════════════════════════════════════════════

  /** Plan cursor: index of the step currently being worked. */
  function cursorIndex(plan, ob) {
    if (!plan.length) return 0;
    // A null cursor means either "not started yet" (step 0) or "all done".
    if (!ob.currentStepId) return ob.state === 'READY' ? plan.length : 0;
    var idx = -1;
    for (var i = 0; i < plan.length; i++) { if (plan[i] && plan[i].id === ob.currentStepId) { idx = i; break; } }
    return idx === -1 ? 0 : idx;
  }

  function renderStatePill(ob) {
    var meta = stateMeta(ob.state);
    var live = !TERMINAL[ob.state] ? ' live' : '';
    var parts = [];
    parts.push('<span class="state-pill ' + meta.cls + live + '"><span class="dot"></span>' + esc(meta.label) + '</span>');
    parts.push('<span class="muted mono">' + esc(ob.externalAccountId || '') + '</span>');
    if (ob.linkedAdAccountId) {
      parts.push('<span class="badge badge-ok">مرتبط بالمنصة</span>');
    }
    if (ob.completedAt) {
      parts.push('<span class="muted">اكتمل: ' + esc(fmtTime(ob.completedAt)) + '</span>');
    } else {
      parts.push('<span class="muted">بدأ: ' + esc(fmtTime(ob.createdAt)) + '</span>');
    }
    document.getElementById('state-row').innerHTML = parts.join('');
  }

  function renderPlan(ob) {
    var el = document.getElementById('plan-list');
    var plan = Array.isArray(ob.planJson) ? ob.planJson : [];
    if (!plan.length) {
      el.innerHTML = '<li class="muted" style="padding:12px 2px;line-height:1.8;">'
        + 'لم يُحسب مسار الخطوات بعد — يضعه المنسّق عند أول تحقّق. اضغط «تحقق الآن» لبدء التنفيذ فوراً.'
        + '</li>';
      return;
    }
    var cursor = cursorIndex(plan, ob);
    var terminalBad = ob.state === 'FAILED' || ob.state === 'BLOCKED';
    el.innerHTML = plan.map(function (step, i) {
      var cls, mark;
      if (i < cursor) { cls = 'done'; mark = '✓'; }
      else if (i === cursor) { cls = terminalBad ? 'pending' : 'active'; mark = String(i + 1); }
      else { cls = 'pending'; mark = String(i + 1); }
      var meta = '';
      if (i === cursor && !terminalBad) meta = 'الخطوة الجارية الآن';
      else if (i < cursor) meta = 'اكتملت';
      else if (i === cursor && terminalBad) meta = 'متوقّفة عند هذه الخطوة';
      else meta = 'لاحقاً';
      var target = step && step.targetState ? stateMeta(step.targetState).label : '';
      return '<li class="plan-step ' + cls + '">'
        + '<span class="plan-dot">' + esc(mark) + '</span>'
        + '<div style="flex:1;min-width:0;">'
        + '<div class="plan-label">' + esc(step && step.label ? step.label : '—') + '</div>'
        + '<div class="plan-meta">' + esc(meta) + (target ? ' · تنقل إلى: ' + esc(target) : '') + '</div>'
        + '</div>'
        + '</li>';
    }).join('');
  }

  function renderCallouts(ob) {
    var el = document.getElementById('callouts');
    var html = '';

    // 3 ── The one missing thing. Never buried.
    if (ob.state === 'BLOCKED' && ob.blockedRequirement) {
      html += '<div class="callout callout-warn">'
        + '<div class="callout-title">⚠ الإجراء المطلوب لإتمام الربط</div>'
        + '<div class="callout-text">' + esc(ob.blockedRequirement) + '</div>'
        + '</div>';
    } else if (ob.state === 'BLOCKED') {
      html += '<div class="callout callout-warn">'
        + '<div class="callout-title">⚠ الربط متوقّف</div>'
        + '<div class="callout-text">توقّف المنسّق عند متطلّب ناقص دون تفاصيل إضافية — راجع سجل الأحداث أدناه.</div>'
        + '</div>';
    }

    if (ob.state === 'FAILED') {
      html += '<div class="callout callout-err">'
        + '<div class="callout-title">✕ فشل الربط</div>'
        + '<div class="callout-text">' + esc(ob.lastError || 'لم يسجّل المنسّق سبباً — راجع سجل الأحداث أدناه.') + '</div>'
        + '<div class="callout-actions"><span class="muted">يمكنك إعادة البدء لنفس الحساب من الأعلى بعد معالجة السبب.</span></div>'
        + '</div>';
    } else if (ob.lastError) {
      // Retryable error mid-flight — surfaced, but not as a terminal failure.
      html += '<div class="callout callout-err">'
        + '<div class="callout-title">آخر خطأ (قابل لإعادة المحاولة)</div>'
        + '<div class="callout-text">' + esc(ob.lastError) + '</div>'
        + '</div>';
    }

    // 4 ── What the client must do.
    if (ob.state === 'WAITING_EXTERNAL_ACTION') {
      var since = ob.waitingSince ? '<div class="muted" style="margin-top:8px;">بدأ الانتظار: ' + esc(fmtTime(ob.waitingSince)) + ' (' + esc(fmtRelative(ob.waitingSince)) + ')</div>' : '';
      var nextCheck = ob.nextCheckAt
        ? '<div class="muted" style="margin-top:6px;">التحقق التلقائي التالي: ' + esc(fmtTime(ob.nextCheckAt)) + ' (' + esc(fmtRelative(ob.nextCheckAt)) + ')</div>'
        : '';
      html += '<div class="callout callout-info">'
        + '<div class="callout-title">⏳ ما الذي يجب أن يفعله العميل الآن</div>'
        + '<div class="callout-text">'
        + 'أرسل للعميل طلب <strong>الوصول كشريك (Partner Access)</strong> على الحساب '
        + '<span class="mono">' + esc(ob.externalAccountId || '') + '</span>، '
        + 'ثم يوافق العميل على الطلب من <strong>مدير الأعمال (Business Manager)</strong> الخاص به. '
        + 'بمجرّد الموافقة يتولّى Adlytic الباقي تلقائياً: الإسناد لمستخدم النظام، الربط، وأول مزامنة.'
        + '</div>'
        + '<div class="callout-actions">'
        + '<a class="btn btn-primary btn-sm" href="' + BM_URL + '" target="_blank" rel="noopener noreferrer">فتح إعدادات حسابات Meta الإعلانية ↗</a>'
        + '<span class="muted">يتحقق Adlytic تلقائياً — واضغط «تحقق الآن» للتحقق فوراً.</span>'
        + '</div>'
        + nextCheck
        + since
        + '</div>';
    } else if (ob.nextCheckAt && !TERMINAL[ob.state]) {
      html += '<div class="callout callout-info">'
        + '<div class="callout-title">⏱ التحقق التلقائي</div>'
        + '<div class="callout-text">التحقق التلقائي التالي: ' + esc(fmtTime(ob.nextCheckAt)) + ' (' + esc(fmtRelative(ob.nextCheckAt)) + ')</div>'
        + '</div>';
    }

    if (ob.state === 'READY') {
      html += '<div class="callout callout-ok">'
        + '<div class="callout-title">✓ الحساب جاهز</div>'
        + '<div class="callout-text">اكتمل الربط وبدأت المزامنة. أصبح الحساب متاحاً في لوحة العميل.</div>'
        + '</div>';
    }

    el.innerHTML = html;
  }

  function renderTimeline(events) {
    var el = document.getElementById('timeline');
    var rows = (events || []).slice();
    // Newest first — the server returns oldest-first.
    rows.sort(function (a, b) { return new Date(b.at).getTime() - new Date(a.at).getTime(); });
    if (!rows.length) {
      el.innerHTML = '<div class="empty">لا أحداث بعد.</div>';
      return;
    }
    el.innerHTML = rows.map(function (ev) {
      var kind = EVENT_KIND_META[ev.kind] || { label: String(ev.kind == null ? '—' : ev.kind), cls: 'badge-muted' };
      var states = '';
      if (ev.fromState || ev.toState) {
        states = '<div class="tl-states">' + esc(ev.fromState || '—') + ' → ' + esc(ev.toState || '—') + '</div>';
      }
      var step = ev.stepId ? '<div class="tl-states">' + esc(ev.stepId) + '</div>' : '';
      return '<div class="tl-item">'
        + '<div class="tl-time">' + esc(fmtTime(ev.at)) + '</div>'
        + '<div><span class="badge ' + kind.cls + '">' + esc(kind.label) + '</span></div>'
        + '<div><div class="tl-msg">' + esc(ev.message || '') + '</div>' + states + step + '</div>'
        + '</div>';
    }).join('');
  }

  function renderOnboarding() {
    var ob = view.onboarding;
    var progress = document.getElementById('progress-panel');
    var timeline = document.getElementById('timeline-panel');
    if (!ob) {
      progress.style.display = 'none';
      timeline.style.display = 'none';
      return;
    }
    progress.style.display = '';
    timeline.style.display = '';
    document.getElementById('progress-sub').textContent =
      'الحساب ' + (ob.externalAccountId || '') + ' · المزوّد ' + (ob.provider || 'META');
    document.getElementById('btn-check-now').disabled = false;
    renderStatePill(ob);
    renderCallouts(ob);
    renderPlan(ob);
    renderTimeline(view.timeline);
    markSelectedRow(ob.id);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Polling — setTimeout recursion, stops on terminal / repeated failure
  // ════════════════════════════════════════════════════════════════════════
  function stopPolling() {
    if (view.pollTimer) { clearTimeout(view.pollTimer); view.pollTimer = null; }
    view.pollToken++;
  }

  function schedulePoll() {
    stopPolling();
    var ob = view.onboarding;
    if (!ob || TERMINAL[ob.state]) return;
    var myToken = view.pollToken;
    var id = ob.id;
    view.pollTimer = setTimeout(function () {
      pollOnce(id, myToken);
    }, POLL_MS);
  }

  async function pollOnce(id, myToken) {
    if (myToken !== view.pollToken) return;   // superseded by a newer selection
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(id));
      if (myToken !== view.pollToken) return;
      view.pollFailures = 0;
      view.onboarding = res.onboarding || null;
      view.timeline = res.timeline || [];
      renderOnboarding();
      if (view.onboarding && !TERMINAL[view.onboarding.state]) schedulePoll();
    } catch (e) {
      if (myToken !== view.pollToken) return;
      if (isAuthError(e)) { showGateError('غير مصرّح.'); stopPolling(); return; }
      view.pollFailures++;
      if (view.pollFailures >= MAX_POLL_FAILURES) {
        stopPolling();
        var el = document.getElementById('callouts');
        el.innerHTML = '<div class="callout callout-err">'
          + '<div class="callout-title">توقّف التحديث التلقائي</div>'
          + '<div class="callout-text">' + esc(e.message || 'تعذّر الاتصال بالخادم.') + ' — اضغط «تحقق الآن» لإعادة المحاولة.</div>'
          + '</div>' + el.innerHTML;
        return;
      }
      schedulePoll();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Actions
  // ════════════════════════════════════════════════════════════════════════
  async function openOnboarding(id) {
    stopPolling();
    view.pollFailures = 0;
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(id));
      view.onboarding = res.onboarding || null;
      view.timeline = res.timeline || [];
      renderOnboarding();
      var panel = document.getElementById('progress-panel');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
      schedulePoll();
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      showStartError(e.message || 'تعذّر فتح طلب الربط.');
    }
  }

  async function startOnboarding() {
    clearStartError();
    var workspaceId = currentWorkspaceId();
    var accountId = (document.getElementById('acct-input').value || '').trim();
    if (!workspaceId) { showStartError('اختر مساحة عمل العميل أولاً.'); return; }
    if (!accountId) { showStartError('أدخل معرّف الحساب الإعلاني.'); return; }
    var btn = document.getElementById('btn-start');
    btn.disabled = true;
    try {
      var res = await api('/api/admin/onboarding', {
        method: 'POST',
        body: { workspaceId: workspaceId, externalAccountId: accountId },
      });
      view.workspaceId = workspaceId;
      await loadOnboardingList(workspaceId);
      if (res.onboarding && res.onboarding.id) await openOnboarding(res.onboarding.id);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      showStartError(e.message || 'تعذّر بدء الربط.');
    } finally {
      btn.disabled = false;
    }
  }

  async function checkNow() {
    var ob = view.onboarding;
    if (!ob) return;
    var btn = document.getElementById('btn-check-now');
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق…';
    stopPolling();
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(ob.id) + '/check', { method: 'POST' });
      view.pollFailures = 0;
      view.onboarding = res.onboarding || view.onboarding;
      view.timeline = res.timeline || view.timeline;
      renderOnboarding();
      schedulePoll();
      if (view.workspaceId) loadOnboardingList(view.workspaceId);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      var el = document.getElementById('callouts');
      el.innerHTML = '<div class="callout callout-err">'
        + '<div class="callout-title">تعذّر التحقق</div>'
        + '<div class="callout-text">' + esc(e.message || 'تعذّر الاتصال بالخادم.') + '</div>'
        + '</div>' + el.innerHTML;
      schedulePoll();
    } finally {
      btn.disabled = false;
      btn.textContent = 'تحقق الآن';
    }
  }

  // ── Existing onboardings for the selected workspace ──────────────────────
  function markSelectedRow(id) {
    var rows = document.querySelectorAll('#ob-list .ob-row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-id') === id) rows[i].classList.add('selected');
      else rows[i].classList.remove('selected');
    }
  }

  function renderOnboardingList(records) {
    var el = document.getElementById('ob-list');
    var panel = document.getElementById('list-panel');
    panel.style.display = '';
    if (!records || !records.length) {
      el.innerHTML = '<div class="empty">لا طلبات ربط لهذه المساحة بعد.</div>';
      return;
    }
    el.innerHTML = records.map(function (r) {
      var meta = stateMeta(r.state);
      return '<button class="ob-row" data-id="' + esc(r.id) + '">'
        + '<span>'
        + '<span class="mono" style="font-weight:700;">' + esc(r.externalAccountId || '') + '</span>'
        + '<span class="muted" style="display:block;margin-top:4px;">بدأ: ' + esc(fmtTime(r.createdAt)) + '</span>'
        + '</span>'
        + '<span class="badge ' + stateBadgeClass(r.state) + '">' + esc(meta.label) + '</span>'
        + '</button>';
    }).join('');
    var rows = el.querySelectorAll('.ob-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        if (id) openOnboarding(id);
      });
    }
    if (view.onboarding) markSelectedRow(view.onboarding.id);
  }

  async function loadOnboardingList(workspaceId) {
    if (!workspaceId) {
      document.getElementById('list-panel').style.display = 'none';
      return;
    }
    try {
      var res = await api('/api/admin/onboarding?workspaceId=' + encodeURIComponent(workspaceId));
      renderOnboardingList(res.onboardings || []);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      var panel = document.getElementById('list-panel');
      panel.style.display = '';
      document.getElementById('ob-list').innerHTML =
        '<div class="error-box" style="margin-bottom:0;">' + esc(e.message || 'تعذّر تحميل طلبات الربط.') + '</div>';
    }
  }

  // ── Secondary: accounts currently visible to the System User token ───────
  function renderAccounts(rows) {
    var tbody = document.getElementById('accounts-tbody');
    var table = document.getElementById('accounts-table');
    var empty = document.getElementById('accounts-empty');
    if (!rows || !rows.length) {
      tbody.innerHTML = '';
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    table.style.display = '';
    tbody.innerHTML = rows.map(function (a) {
      var linked = a.linked
        ? '<span class="badge badge-ok">مرتبط</span>'
        : '<span class="badge badge-muted">غير مرتبط</span>';
      var wsHint = a.linked && a.linkedWorkspaceId
        ? '<div class="muted mono" style="margin-top:4px;">' + esc(a.linkedWorkspaceId) + '</div>'
        : '';
      return '<tr>'
        + '<td style="font-weight:700;">' + esc(a.name || '—') + '</td>'
        + '<td class="mono muted">' + esc(a.id) + '</td>'
        + '<td class="currency-cell">' + esc(currencyLabel(a.currency)) + '</td>'
        + '<td>' + accountStatusBadge(a.accountStatus) + '</td>'
        + '<td>' + linked + wsHint + '</td>'
        + '<td><button class="btn btn-secondary btn-sm use-acct" data-id="' + esc(a.id) + '">استخدم</button></td>'
        + '</tr>';
    }).join('');
    var btns = tbody.querySelectorAll('.use-acct');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var id = this.getAttribute('data-id') || '';
        var input = document.getElementById('acct-input');
        input.value = id;
        input.focus();
        if (input.scrollIntoView) input.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  async function loadDiscover() {
    var statusEl = document.getElementById('discover-status');
    var sub = document.getElementById('discover-sub');
    var table = document.getElementById('accounts-table');
    var empty = document.getElementById('accounts-empty');
    statusEl.style.display = 'none';
    statusEl.className = 'panel-body';
    try {
      var res = await api('/api/admin/meta/discover-accounts');
      if (res.configured === false) {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="info-box">مستخدم النظام غير مُهيّأ على الخادم: ' + esc(res.reason || 'META_SYSTEM_USER_TOKEN غير مضبوط.') + '</div>';
        return;
      }
      if (res.error) {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="error-box">تعذّر الاتصال بـ Meta: ' + esc(res.error) + '</div>';
        return;
      }
      if (res.businessName) {
        sub.textContent = 'مدير الأعمال: ' + res.businessName;
      }
      renderAccounts(res.accounts || []);
    } catch (e) {
      if (isAuthError(e)) {
        showGateError('غير مصرّح.');
      } else {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="error-box">' + esc(e.message || 'تعذّر تحميل الحسابات.') + '</div>';
      }
    }
  }

  // ── Admin gate ────────────────────────────────────────────────────────────
  async function ensureAdmin() {
    try {
      var me = await api('/api/auth/me');
      if (!me || !me.isPlatformAdmin) { window.location.replace('/dashboard'); return false; }
      var accessGate = document.getElementById('access-gate');
      if (accessGate) accessGate.classList.add('hidden');
      document.querySelector('.app').style.display = 'flex';
      document.getElementById('admin-email').textContent = me.email || (me.user && me.user.email) || '';
      return true;
    } catch (e) {
      var g = document.getElementById('access-gate');
      if (isAuthError(e)) {
        if (g) g.innerHTML = '<div style="max-width:320px;line-height:1.8;">غير مصرّح. <a href="/login" style="color:var(--accent);text-decoration:underline;">تسجيل الدخول</a></div>';
        return false;
      }
      if (g) g.innerHTML = '<div style="max-width:320px;line-height:1.8;">تعذّر التحقق من الصلاحية. تحقق من اتصالك ثم <a href="javascript:location.reload()" style="color:var(--accent);text-decoration:underline;">أعد المحاولة</a>.</div>';
      return false;
    }
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-start').addEventListener('click', function () { startOnboarding(); });
  document.getElementById('btn-check-now').addEventListener('click', function () { checkNow(); });
  document.getElementById('acct-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startOnboarding();
  });
  document.getElementById('ws-select').addEventListener('change', function () {
    clearStartError();
    stopPolling();
    view.onboarding = null;
    view.timeline = [];
    renderOnboarding();
    view.workspaceId = currentWorkspaceId();
    loadOnboardingList(view.workspaceId);
  });
  document.getElementById('ws-input').addEventListener('change', function () {
    clearStartError();
    stopPolling();
    view.onboarding = null;
    view.timeline = [];
    renderOnboarding();
    view.workspaceId = currentWorkspaceId();
    loadOnboardingList(view.workspaceId);
  });
  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadDiscover();
    if (view.workspaceId) loadOnboardingList(view.workspaceId);
    if (view.onboarding) openOnboarding(view.onboarding.id);
  });
  window.addEventListener('beforeunload', stopPolling);

  if (!token()) { window.location.replace('/login'); return; }
  ensureAdmin().then(function (ok) {
    if (!ok) return;
    loadWorkspaces();
    loadDiscover();
  });
})();
</script>
</body>
</html>`;
}
