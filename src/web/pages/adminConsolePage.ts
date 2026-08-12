// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminConsolePage.ts
//
//  Platform-owner console (Arabic RTL): create customers, manage
//  activation/subscriptions, edit accounts, delete accounts, and inspect
//  activity. Data is gated by /api/admin/* + PLATFORM_ADMIN_EMAILS.
// ════════════════════════════════════════════════════════════════════════

import { TOKENS_CSS_PATH } from '../layout';

export function adminConsolePage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إدارة المنصة — Adlytic</title>
  <!-- Tokens + typefaces from the design system, no shell selectors.
       This page used to carry a private copy of :root written for the
       dark theme; when the product went light it stayed black, because
       it was not reading the design system at all. -->
  <link rel="stylesheet" href="${TOKENS_CSS_PATH}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    /* The page was authored against --font; the system calls it --font-body. */
    :root { --font: var(--font-body); }
    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }
    a { color: inherit; text-decoration: none; }
    button, input, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; border: none; background: none; }
    .app { display: none; min-height: 100vh; }
    .access-gate {
      position: fixed; inset: 0; z-index: 9999; background: var(--bg);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
      color: var(--text-2); font-size: 14px; font-weight: 600;
    }
    .access-gate.hidden { display: none; }
    .access-gate .gate-spinner {
      width: 30px; height: 30px; border: 3px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%; animation: gate-spin 0.7s linear infinite;
    }
    @keyframes gate-spin { to { transform: rotate(360deg); } }
    .sidebar {
      width: 240px; flex-shrink: 0; background: var(--surface);
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
    .nav-item.active { background: var(--accent-dim); color: var(--accent-2); }
    .nav-foot { padding: 12px; border-top: 1px solid var(--border); }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      height: 60px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.92);
      backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 20;
    }
    .topbar h1 { font-size: 16px; font-weight: 800; }
    .topbar-actions { display: flex; gap: 8px; align-items: center; }
    .content { padding: 22px 24px 40px; max-width: 1280px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 14px; border-radius: 9px; font-weight: 700; font-size: 13px;
      border: 1px solid transparent; transition: 0.15s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { filter: brightness(1.05); }
    .btn-secondary { background: var(--surface-2); border-color: var(--border-control); color: var(--text); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-danger { background: var(--error-dim); border-color: var(--error); color: var(--error); }
    .btn-success { background: var(--success-dim); border-color: var(--success); color: var(--success); }
    .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
    .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
    /* ≤1024px: the sidebar used to be display:none here, which removed the ONLY
       navigation the console has — on a tablet no tab was reachable at all.
       It folds into a horizontal strip instead. */
    @media (max-width: 1024px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .app { flex-direction: column; }
      .sidebar {
        position: static; width: 100%; height: auto;
        border-left: none; border-bottom: 1px solid var(--border);
      }
      .logo { display: none; }
      .nav { flex-direction: row; overflow-x: auto; padding: 8px 10px; gap: 6px; -webkit-overflow-scrolling: touch; }
      .nav-label { display: none; }
      .nav-item { white-space: nowrap; padding: 8px 12px; flex-shrink: 0; }
      .nav-foot { display: none; }
    }
    @media (max-width: 560px) { .kpi-grid { grid-template-columns: 1fr; } }
    .kpi {
      padding: 16px; border-radius: 12px; border: 1px solid var(--border);
      background: linear-gradient(145deg, var(--accent-dim), var(--surface));
    }
    .kpi[data-goto] { cursor: pointer; transition: border-color 0.15s; }
    .kpi[data-goto]:hover { border-color: var(--accent); }
    .kpi-label { font-size: 12px; color: var(--text-3); font-weight: 700; margin-bottom: 6px; }
    .kpi-value { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; }
    .kpi-value.gold { color: var(--accent); }
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
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .field {
      background: var(--surface-2); border: 1px solid var(--border-control); border-radius: 9px;
      padding: 9px 12px; color: var(--text); min-width: 0;
    }
    .field:focus { outline: none; border-color: var(--accent); }
    .field-sm { padding: 7px 10px; font-size: 12.5px; }
    table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.data th {
      text-align: right; padding: 10px 12px; font-size: 11px; color: var(--text-3);
      border-bottom: 1px solid var(--border); font-weight: 700;
    }
    table.data td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.data tr:hover td { background: var(--surface-hover); }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; border: 1px solid transparent;
    }
    .badge-ok { background: var(--success-dim); color: var(--success); border-color: var(--success); }
    .badge-warn { background: var(--warning-dim); color: var(--warning); border-color: var(--warning); }
    .badge-err { background: var(--error-dim); color: var(--error); border-color: var(--error); }
    .badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
    .badge-gold { background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent); }
    .muted { color: var(--text-3); font-size: 12px; }
    .error-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid var(--error);
      background: var(--error-dim); color: var(--error); margin-bottom: 14px;
    }
    .empty { text-align: center; padding: 28px 12px; color: var(--text-3); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 12px; font-weight: 700; color: var(--text-2); }
    .form-group.full { grid-column: 1 / -1; }
    .check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); }
    .drawer-backdrop {
      position: fixed; inset: 0; background: var(--scrim); z-index: 40;
      display: none; align-items: stretch; justify-content: flex-start;
    }
    .drawer-backdrop.open { display: flex; }
    .drawer {
      width: min(520px, 100%); background: var(--surface); border-left: 1px solid var(--border);
      padding: 18px; overflow-y: auto; box-shadow: none;
    }
    .drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .drawer-title { font-size: 18px; font-weight: 800; }
    .section { margin-bottom: 18px; }
    .section h3 { font-size: 13px; font-weight: 800; color: var(--accent-2); margin-bottom: 8px; }
    .section.danger { border: 1px solid var(--error); border-radius: 10px; padding: 12px; background: var(--error-dim); }
    .section.danger h3 { color: var(--error); }
    .list-card {
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
      background: var(--bg);
    }
    /* ── Status system ──────────────────────────────────────────────────
       Status NEVER relies on colour alone: every chip carries a glyph and a
       word. A red dot and an amber dot are the same dot to a colour-blind
       operator, and identical in a greyscale screenshot pasted into a
       support thread. */
    .st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .st-glyph { width: 16px; text-align: center; font-size: 11px; line-height: 1; }
    .st-HEALTHY, .st-SUCCESS { color: var(--success); }
    .st-RUNNING { color: var(--accent-2); }
    .st-DEGRADED, .st-WARNING { color: var(--warning); }
    .st-ERROR, .st-BLOCKED { color: var(--error); }
    .st-UNKNOWN, .st-NOT_TESTED { color: var(--text-3); }
    .sys-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    @media (max-width: 900px) { .sys-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .sys-grid { grid-template-columns: 1fr; } }
    .sys-card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 12px 14px; }
    .sys-name { font-size: 12px; font-weight: 800; color: var(--text-2); margin-bottom: 6px; }
    .sys-sum { font-size: 12.5px; color: var(--text-2); line-height: 1.6; margin-top: 6px; }
    .sys-detail {
      direction: ltr; text-align: left; font-family: ui-monospace, "SF Mono", Consolas, monospace;
      font-size: 11px; color: var(--text-3); margin-top: 6px; word-break: break-all;
    }
    .att-item {
      display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px;
      border: 1px solid var(--border); border-right-width: 3px; border-radius: 10px;
      background: var(--surface); margin-bottom: 8px;
    }
    .att-ERROR { border-right-color: var(--error); }
    .att-WARNING { border-right-color: var(--warning); }
    .att-INFO { border-right-color: var(--accent); }
    .att-title { font-weight: 800; font-size: 13.5px; margin-bottom: 3px; }
    .att-because { font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
    .att-action { font-size: 12px; color: var(--accent-2); font-weight: 700; margin-top: 5px; display: inline-block; }
    .att-clear { padding: 18px; text-align: center; color: var(--success); font-weight: 700; font-size: 13px;
      border: 1px solid var(--success); border-radius: 10px; background: var(--success-dim); }
    /* Mobile tables become cards: a squeezed 8-column table is unreadable,
       and horizontal scrolling hides exactly the status column that matters. */
    @media (max-width: 760px) {
      table.data thead { display: none; }
      table.data tr { display: block; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; padding: 6px 0; }
      table.data td { display: flex; justify-content: space-between; gap: 12px; border: none; padding: 7px 12px; }
      table.data td::before {
        content: attr(data-th); font-size: 11px; font-weight: 700; color: var(--text-3); flex-shrink: 0;
      }
      table.data td:empty { display: none; }
    }
    .ps-split { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 900px) { .ps-split { grid-template-columns: 1fr; } }
    .ps-card { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 16px; }
    .ps-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .ps-title { font-size: 14px; font-weight: 800; }
    .ps-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px; }
    .ps-label { font-size: 11px; font-weight: 700; color: var(--text-3); letter-spacing: 0.03em; margin-bottom: 4px; }
    .ps-value { font-size: 24px; font-weight: 800; line-height: 1.1; }
    .ps-cov.ok { color: var(--success); }
    .ps-cov.warn { color: var(--warning); }
    .ps-cov.err { color: var(--error); }
    .ps-fresh {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
      padding: 10px 14px; margin-bottom: 18px; flex-wrap: wrap;
    }
    .hint { font-size: 12.5px; color: var(--text-3); line-height: 1.7; margin-bottom: 10px; max-width: 720px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .row label { font-size: 12px; font-weight: 700; color: var(--text-2); }
    .btn-ghost { background: var(--surface-2); border: 1px solid var(--border-control); color: var(--text-2); }
    .btn-ghost:hover { border-color: var(--accent); color: var(--text); }
    .probe-h { font-size: 13px; font-weight: 800; color: var(--accent-2); margin: 14px 0 8px; }
    .probe-doc {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      max-height: 460px;
      overflow: auto;
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      white-space: pre;
      /* The two documents are English technical artefacts meant for copying,
         not UI copy — they read left-to-right inside this RTL page. */
      direction: ltr;
      text-align: left;
    }
    .probe-tally { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .probe-tally span {
      border: 1px solid var(--border); border-radius: 999px;
      padding: 3px 12px; font-size: 12px; color: var(--text-2);
    }
    .probe-tally span b { color: var(--text); font-weight: 700; }
    .toast {
      position: fixed; bottom: 20px; left: 20px; z-index: 60; padding: 12px 16px; border-radius: 10px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      box-shadow: none; display: none; max-width: 360px;
    }
    .toast.show { display: block; }
    .toast.ok { border-color: var(--success); }
    .toast.err { border-color: var(--error); color: var(--error); }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
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
      <div class="logo-sub">لوحة المالك · إدارة المنصة</div>
    </div>
    <nav class="nav">
      <div class="nav-label">📊 الرئيسية</div>
      <a class="nav-item active" href="#overview" data-tab="overview">لوحة الحالة</a>
      <a class="nav-item" href="#workspaces" data-tab="workspaces">مساحات العمل</a>
      <div class="nav-label">👥 الزبائن</div>
      <a class="nav-item" href="#customers" data-tab="customers">الزبائن</a>
      <a class="nav-item" href="#create" data-tab="create">إنشاء حساب</a>
      <a class="nav-item" href="/admin/add-client">إضافة عميل (المعالج)</a>
      <div class="nav-label">💳 الإيرادات</div>
      <a class="nav-item" href="#subscriptions" data-tab="subscriptions">الاشتراكات</a>
      <a class="nav-item" href="#ledger" data-tab="ledger">سجل المدفوعات</a>
      <div class="nav-label">🛟 الدعم</div>
      <a class="nav-item" href="/admin/inbox">صندوق الدعم</a>
      <div class="nav-label">🔧 البنية التحتية</div>
      <a class="nav-item" href="/admin/observability">مراقبة المنصة</a>
      <a class="nav-item" href="/admin/meta-readiness">جاهزية Meta</a>
      <a class="nav-item" href="#probe" data-tab="probe">مرقاب قدرات Meta</a>
      <div class="nav-label">🎛️ الإعدادات</div>
      <a class="nav-item" href="#settings" data-tab="settings">إعدادات المنصة</a>
      <a class="nav-item" href="/dashboard">⌂ العودة للتطبيق</a>
    </nav>
    <div class="nav-foot">
      <div class="muted" id="admin-email">—</div>
      <button class="btn btn-secondary btn-sm" id="btn-logout" style="margin-top:8px;width:100%;">تسجيل الخروج</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <h1 id="page-heading">النظرة العامة</h1>
      <div class="topbar-actions">
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث</button>
        <button class="btn btn-primary btn-sm" id="btn-open-create">+ زبون جديد</button>
      </div>
    </header>

    <main class="content">
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <!-- Overview -->
      <section class="panel view" id="view-overview">
        <div class="panel-head">
          <div>
            <div class="panel-title">النظرة العامة</div>
            <div class="panel-sub">حالة المنصة · المؤشرات الرئيسية · النشاط الحي · التنبيهات</div>
          </div>
        </div>
        <div class="panel-body">
          <!-- الترتيب مقصود ويجيب أسئلة المشغّل بترتيبها:
               ١. هل النظام سليم؟  → صحة النظام
               ٢. ما الذي يحتاجني؟ → قائمة الانتباه
               ٣. ما الحجم/الأثر؟  → الوصول والأموال والذكاء
               المؤشرات العامة تأتي أخيراً لأنها سياق، لا إنذار. -->
          <div class="ps-head" style="margin-bottom:10px;">
            <span class="ps-title">حالة النظام</span>
            <span class="st" id="ops-overall"><span class="st-glyph">○</span><span>جارٍ الفحص…</span></span>
          </div>
          <!-- ما نعرفه مفصولاً عمّا لا نعرفه. مقياس واحد لا يستطيع حمل
               «يعمل» و«فيه مجهولات» معاً — ودمجهما هو بالضبط ادّعاء اليقين
               الذي بُني هذا الكونسول ليمنعه. -->
          <div class="muted" id="ops-certainty" style="margin:-4px 0 12px;"></div>
          <div class="sys-grid" id="ops-subsystems"></div>

          <div class="ps-head" style="margin-bottom:10px;">
            <span class="ps-title">يحتاج انتباهك</span>
            <span class="muted" id="ops-attention-count"></span>
          </div>
          <div id="ops-attention" style="margin-bottom:18px;">
            <div class="muted">جارٍ التحميل…</div>
          </div>

          <div class="ps-split">
            <div class="ps-card">
              <div class="ps-head"><span class="ps-title">الوصول</span><span class="muted">كل مساحات العمل</span></div>
              <div class="ps-grid">
                <div><div class="ps-label">مساحات العمل</div><div class="ps-value" id="ps-workspaces">—</div></div>
                <div><div class="ps-label">حسابات إعلانية</div><div class="ps-value" id="ps-adaccounts">—</div></div>
                <div><div class="ps-label">حسابات نشطة</div><div class="ps-value" id="ps-active-accounts">—</div></div>
                <div><div class="ps-label">حملات نشطة</div><div class="ps-value" id="ps-campaigns">—</div></div>
              </div>
            </div>
            <div class="ps-card">
              <div class="ps-head"><span class="ps-title">صحة الذكاء</span><span class="muted" id="ps-brain-window">—</span></div>
              <div class="ps-grid">
                <div><div class="ps-label">لقطات</div><div class="ps-value" id="ps-snapshots">—</div></div>
                <div><div class="ps-label">مسرودة</div><div class="ps-value" id="ps-narrated">—</div></div>
                <div style="grid-column:1/-1;"><div class="ps-label">التغطية السردية</div><div class="ps-value ps-cov" id="ps-coverage">—</div></div>
              </div>
            </div>
          </div>

          <div class="ps-card" style="margin-bottom:14px;">
            <div class="ps-head">
              <span class="ps-title">الأموال المُدارة</span>
              <span class="muted">العملة الأصلية · ميزانيات يومية (حملات نشطة)</span>
            </div>
            <table class="data">
              <thead><tr><th>العملة</th><th>حملات نشطة</th><th>الميزانية اليومية</th><th>شهريًا (×30)</th></tr></thead>
              <tbody id="ps-money-tbody"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody>
            </table>
          </div>

          <div class="ps-fresh" id="ps-fresh">
            <span><span class="badge badge-muted" id="ps-fresh-badge">—</span> <span class="muted" id="ps-fresh-at"></span></span>
            <button class="btn btn-primary btn-sm" id="ps-refresh">إعادة الحساب الآن</button>
          </div>

          <div class="kpi-grid" id="kpi-grid">
            <div class="kpi" data-goto="#customers"><div class="kpi-label">إجمالي الزبائن</div><div class="kpi-value" id="kpi-users">—</div></div>
            <div class="kpi" data-goto="#customers"><div class="kpi-label">نشطون</div><div class="kpi-value" id="kpi-active">—</div></div>
            <div class="kpi" data-goto="#customers"><div class="kpi-label">بانتظار التفعيل</div><div class="kpi-value" id="kpi-pending">—</div></div>
            <div class="kpi" data-goto="#subscriptions"><div class="kpi-label">اشتراكات Premium</div><div class="kpi-value gold" id="kpi-premium">—</div></div>
          </div>

          <div class="kpi-grid" id="kpi-grid-2" style="margin-top:16px;">
            <div class="kpi"><div class="kpi-label">مساحات العمل</div><div class="kpi-value" id="kpi-workspaces">—</div></div>
            <div class="kpi" data-goto="/admin/observability"><div class="kpi-label">المزامنة (7 أيام)</div><div class="kpi-value" id="kpi-syncs">—</div></div>
            <div class="kpi"><div class="kpi-label">محادثات AI (7 أيام)</div><div class="kpi-value" id="kpi-ai">—</div></div>
            <div class="kpi" data-goto="#ledger"><div class="kpi-label">أحداث الدفع (7 أيام)</div><div class="kpi-value" id="kpi-payments">—</div></div>
          </div>

          <div style="margin-top:20px;">
            <div class="panel-title" style="font-size:14px;margin-bottom:12px;">الدعم الفني</div>
            <div class="kpi-grid" id="kpi-support">
              <div class="kpi" data-goto="/admin/inbox"><div class="kpi-label">تحتاج رد</div><div class="kpi-value" id="kpi-support-open" style="color:var(--error);">—</div></div>
              <div class="kpi" data-goto="/admin/inbox"><div class="kpi-label">بانتظار العميل</div><div class="kpi-value" id="kpi-support-awaiting" style="color:var(--accent);">—</div></div>
              <div class="kpi" data-goto="/admin/inbox"><div class="kpi-label">عاجل</div><div class="kpi-value" id="kpi-support-urgent" style="color:var(--error);">—</div></div>
              <div class="kpi" data-goto="/admin/inbox"><div class="kpi-label">تم الحل</div><div class="kpi-value" id="kpi-support-resolved">—</div></div>
            </div>
          </div>

          <div style="margin-top:20px;">
            <div class="panel-title" style="font-size:14px;margin-bottom:12px;">تنبيهات مهمة</div>
            <div id="overview-alerts" style="color:var(--text-2);font-size:13px;">جاري التحميل...</div>
          </div>
        </div>
      </section>

      <!-- Workspaces — operational health, one row per workspace.
           Answers "which workspace has a problem, and why" without opening
           a single drawer: connection axis and data axis stay SEPARATE
           because a dead token and stale data are different incidents. -->
      <section class="panel view" id="view-workspaces" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">مساحات العمل — الحالة التشغيلية</div>
            <div class="panel-sub">الاتصال · آخر مزامنة · طزاجة البيانات · أقدم مشكلة</div>
          </div>
          <div class="toolbar">
            <input class="field field-sm" id="ws-search" placeholder="بحث بالاسم أو المالك…" style="min-width:200px;" />
            <select class="field field-sm" id="ws-filter">
              <option value="all">كل الحالات</option>
              <option value="problems">المشاكل فقط</option>
              <option value="BLOCKED">محجوب</option>
              <option value="WARNING">تحذير</option>
              <option value="HEALTHY">سليم</option>
              <option value="NOT_TESTED">لم يُربط</option>
            </select>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="data" id="ws-table">
            <thead>
              <tr>
                <th>مساحة العمل</th>
                <th>الحالة</th>
                <th>الاتصال</th>
                <th>البيانات</th>
                <th>آخر مزامنة</th>
                <th>حساب Meta</th>
              </tr>
            </thead>
            <tbody id="ws-tbody"><tr><td colspan="6" class="empty">جارٍ التحميل…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- Customers -->
      <section class="panel view" id="view-customers">
        <div class="panel-head">
          <div>
            <div class="panel-title">الزبائن</div>
            <div class="panel-sub">إنشاء · تفعيل · تعديل · حذف · نشاط</div>
          </div>
          <div class="toolbar">
            <input class="field field-sm" id="search-q" placeholder="بحث بالاسم أو البريد…" style="min-width:200px;" />
            <select class="field field-sm" id="filter-status">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="pending">بانتظار التفعيل</option>
            </select>
            <select class="field field-sm" id="filter-tier">
              <option value="all">كل الخطط</option>
              <option value="PREMIUM">Premium</option>
              <option value="FREE">مجاني</option>
            </select>
            <button class="btn btn-secondary btn-sm" id="btn-search">بحث</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <div id="customers-empty" class="empty" style="display:none;">لا يوجد زبائن مطابقون.</div>
          <table class="data" id="customers-table">
            <thead>
              <tr>
                <th>الزبون</th>
                <th>الحساب</th>
                <th>الاشتراك</th>
                <th>مساحات العمل</th>
                <th>انضم</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="customers-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- Create -->
      <section class="panel view" id="view-create" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">إنشاء حساب زبون</div>
            <div class="panel-sub">يُنشئ مستخدماً + مساحة عمل بملكية OWNER</div>
          </div>
        </div>
        <div class="panel-body">
          <form id="create-form" class="form-grid">
            <div class="form-group">
              <label>الاسم</label>
              <input class="field" name="name" required placeholder="اسم الزبون" />
            </div>
            <div class="form-group">
              <label>البريد</label>
              <input class="field" name="email" type="email" required placeholder="customer@example.com" />
            </div>
            <div class="form-group">
              <label>كلمة المرور</label>
              <input class="field" name="password" type="text" required minlength="8" placeholder="8 أحرف على الأقل" />
            </div>
            <div class="form-group">
              <label>اسم مساحة العمل</label>
              <input class="field" name="workspaceName" placeholder="مساحة عمل الزبون" />
            </div>
            <div class="form-group">
              <label>اللغة</label>
              <select class="field" name="locale">
                <option value="AR">العربية</option>
                <option value="EN">English</option>
              </select>
            </div>
            <div class="form-group">
              <label>مدة Premium (أيام)</label>
              <input class="field" name="premiumDays" type="number" min="1" max="730" value="30" />
            </div>
            <div class="form-group full">
              <label class="check-row"><input type="checkbox" name="activateAccount" checked /> تفعيل الحساب فوراً</label>
            </div>
            <div class="form-group full">
              <label class="check-row"><input type="checkbox" name="grantPremium" /> منح اشتراك Premium الآن</label>
            </div>
            <div class="form-group full">
              <label>ملاحظة الاشتراك (اختياري)</label>
              <input class="field" name="premiumNote" placeholder="مثال: دفع عبر زين كاش" />
            </div>
            <div class="form-group full actions">
              <button class="btn btn-primary" type="submit" id="create-submit">إنشاء الحساب</button>
            </div>
          </form>
        </div>
      </section>

      <!-- Subscriptions -->
      <section class="panel view" id="view-subscriptions" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">الاشتراكات</div>
            <div class="panel-sub">تفعيل يدوي · تجديد · إلغاء · حالة Stripe / WhatsApp</div>
          </div>
          <div class="toolbar">
            <input class="field field-sm" id="subs-search-q" placeholder="بحث بالمساحة أو المالك…" style="min-width:220px;" />
            <select class="field field-sm" id="subs-filter-tier">
              <option value="all">كل الخطط</option>
              <option value="PREMIUM">Premium</option>
              <option value="FREE">مجاني</option>
            </select>
            <select class="field field-sm" id="subs-filter-status">
              <option value="all">كل الحالات</option>
              <option value="ACTIVE">نشط</option>
              <option value="INACTIVE">غير نشط</option>
              <option value="CANCELED">ملغى</option>
              <option value="PAST_DUE">متأخر السداد</option>
            </select>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="data">
            <thead>
              <tr>
                <th>مساحة العمل</th>
                <th>المالك</th>
                <th>الخطة</th>
                <th>الحالة</th>
                <th>طريقة الدفع</th>
                <th>ينتهي</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="subs-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- Ledger -->
      <section class="panel view" id="view-ledger" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">سجل المدفوعات</div>
            <div class="panel-sub">أحداث التفعيل والتجديد والإلغاء</div>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="data">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>مساحة العمل</th>
                <th>الحدث</th>
                <th>المصدر</th>
                <th>المبلغ</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody id="ledger-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- Meta capability probe -->
      <section class="panel view" id="view-probe" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">مرقاب قدرات Meta</div>
            <div class="panel-sub">قراءة فقط · حدّ أقصى ٤٠ نداءً · يتوقّف عند أول حدّ معدّل</div>
          </div>
        </div>
        <div class="panel-body">
          <p class="hint">
            يسأل Meta عن كل قدرة مرشَّحة على حدة ويسجّل ما ردّت به. <strong>قراءة فقط</strong> —
            لا يكتب شيئاً في Meta ولا في قاعدة بياناتنا. محدود بأربعين نداءً، ويتوقّف عند أول
            حدّ معدّل بدل استنزاف حصة الحساب.
          </p>
          <p class="hint">
            الناتج وثيقتان جاهزتان للنسخ. حكم «لم يُختبَر» ليس رأياً من Meta — بل يعني أننا لم نسأل.
          </p>
          <div class="row">
            <label for="probe-ws">مساحة العمل</label>
            <select class="field field-sm" id="probe-ws" style="min-width:220px;"><option value="">جارٍ التحميل…</option></select>
            <button class="btn btn-primary btn-sm" id="probe-run" type="button" disabled>شغّل المرقاب</button>
            <span id="probe-status" class="hint" style="margin-bottom:0;"></span>
          </div>
          <!-- ما سيحدث قبل أن يحدث: المشغّل ينفق حصة نداءات حقيقية على
               حساب عميل حقيقي، فيجب أن يرى الأثر قبل الضغط لا بعده. -->
          <div class="sys-card" id="probe-preflight" style="display:none;margin-bottom:12px;">
            <div class="sys-name">قبل التشغيل</div>
            <div id="probe-preflight-body" class="sys-sum"></div>
          </div>
          <div id="probe-tally" class="probe-tally"></div>
          <div id="probe-out" style="display:none;">
            <div class="row">
              <button class="btn btn-ghost btn-sm" type="button" data-probe-copy="probe-matrix">نسخ المصفوفة</button>
              <button class="btn btn-ghost btn-sm" type="button" data-probe-copy="probe-report">نسخ التقرير</button>
            </div>
            <h3 class="probe-h">المصفوفة</h3>
            <pre class="probe-doc" id="probe-matrix"></pre>
            <h3 class="probe-h">التقرير</h3>
            <pre class="probe-doc" id="probe-report"></pre>
          </div>
        </div>
      </section>

      <section class="panel view" id="view-settings" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">إعدادات المنصة</div>
            <div class="panel-sub">أعلام الميزات · فترات المزامنة · الحدود · التكوين</div>
          </div>
          <div class="toolbar">
            <button class="btn btn-secondary btn-sm" id="btn-seed-settings">تحميل الافتراضيات</button>
            <button class="btn btn-primary btn-sm" id="btn-add-setting">+ إعداد جديد</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <div id="settings-empty" class="empty" style="display:none;">لا إعدادات بعد. اضغط "تحميل الافتراضيات" لإضافتها.</div>
          <table class="data" id="settings-table">
            <thead>
              <tr>
                <th>المفتاح</th>
                <th>القيمة</th>
                <th>النوع</th>
                <th>المجموعة</th>
                <th>الوصف</th>
                <th>آخر تعديل</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="settings-tbody"></tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</div>

<div class="drawer-backdrop" id="drawer">
  <div class="drawer">
    <div class="drawer-head">
      <div>
        <div class="drawer-title" id="drawer-title">تفاصيل الزبون</div>
        <div class="muted" id="drawer-sub"></div>
      </div>
      <button class="btn btn-secondary btn-sm" id="drawer-close">إغلاق</button>
    </div>
    <div id="drawer-body"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  var state = { customers: [], subscriptions: [], events: [], settings: [], overview: null, detail: null };

  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    // The SSR /admin gate reads an HttpOnly cookie the browser cannot clear
    // itself. Leaving it alive after clearing localStorage is exactly the
    // desync that bounced admins between /admin and /login.
    var go = function () { window.location.href = '/login'; };
    try { fetch('/api/auth/logout', { method: 'POST' }).then(go, go); } catch (e) { go(); }
  }
  // ── Meta capability probe ────────────────────────────────────────────
  // Read-only against Meta. The run spends the ACCOUNT'S quota, so the button
  // is disabled while one is in flight — a double-click must not cost 80 calls.
  var probeLoaded = false;
  var probeRunning = false;

  async function loadProbeWorkspaces() {
    if (probeLoaded) return;
    var sel = document.getElementById('probe-ws');
    if (!sel) return;
    try {
      var data = await api('/api/admin/customers?status=all&take=200');
      var seen = {};
      var opts = [];
      // The endpoint returns FLATTENED rows: u.workspaces[] with adAccountCount
      // (see listCustomers in adminConsole.ts) — NOT raw Prisma membership
      // rows. The first version of this loader read the raw shape, found
      // nothing, and reported "no workspace with an ad account" forever —
      // which blocked the probe from the panel built to run it.
      (data.customers || []).forEach(function (u) {
        (u.workspaces || []).forEach(function (w) {
          if (!w || !w.id || seen[w.id]) return;
          // Only workspaces that HAVE an ad account. The probe needs a token
          // and an object to ask about; offering the rest guarantees a "no ad
          // account" error the operator cannot act on.
          var n = w.adAccountCount != null ? w.adAccountCount : (w.adAccounts || []).length;
          if (!n) return;
          seen[w.id] = true;
          opts.push({ id: w.id, name: w.name || w.id });
        });
      });
      opts.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
      if (!opts.length) {
        sel.innerHTML = '<option value="">لا توجد مساحة عمل بحساب إعلاني مرتبط</option>';
        return;
      }
      sel.innerHTML = '<option value="">اختر مساحة عمل…</option>'
        + opts.map(function (o) {
            return '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>';
          }).join('');
      probeLoaded = true;
    } catch (e) {
      sel.innerHTML = '<option value="">تعذّر تحميل مساحات العمل</option>';
      toast(e.message || 'تعذّر تحميل مساحات العمل', 'err');
    }
  }

  // AVAILABLE ≠ POPULATED. Meta accepting a request and Meta returning a
  // value are different observations, and the matrix already records the
  // difference in evidence.present. A tally that counts them as one number
  // silently upgrades "we asked and got nothing" into "we have this signal"
  // — the exact conflation the whole probe was built to prevent, committed
  // in the one place an operator actually reads.
  function renderProbeTally(results) {
    var host = document.getElementById('probe-tally');
    if (!host) return;
    var tally = {};
    (results || []).forEach(function (r) {
      var k = r.verdict;
      if (k === 'AVAILABLE') {
        k = (r.evidence && r.evidence.present) ? 'AVAILABLE + عاد الحقل' : 'AVAILABLE بلا حقل';
      }
      tally[k] = (tally[k] || 0) + 1;
    });
    var keys = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
    host.innerHTML = keys.map(function (k) {
      return '<span>' + esc(k) + ' <b>' + tally[k] + '</b></span>';
    }).join('')
      + (keys.length
          ? '<span class="muted" style="border:none;padding-right:0;">«AVAILABLE بلا حقل» ليس قدرة مُثبَتة — قُبل الطلب ولم يعد الحقل.</span>'
          : '');
  }

  async function runProbe() {
    if (probeRunning) return;
    var sel = document.getElementById('probe-ws');
    var btn = document.getElementById('probe-run');
    var status = document.getElementById('probe-status');
    var wsId = sel ? sel.value : '';
    if (!wsId) { toast('اختر مساحة عمل أولاً', 'err'); return; }

    probeRunning = true;
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التشغيل…'; }
    if (status) status.textContent = 'يسأل Meta — قد يستغرق دقيقة.';
    try {
      var out = await api('/api/admin/capability-probe', {
        method: 'POST',
        body: { workspaceId: wsId },
      });
      document.getElementById('probe-matrix').textContent = out.matrix || '';
      document.getElementById('probe-report').textContent = out.report || '';
      document.getElementById('probe-out').style.display = '';
      renderProbeTally(out.results);
      var ctx = out.context || {};
      if (status) {
        status.textContent = 'اكتمل — ' + (ctx.calls || '؟') + ' نداء من '
          + (ctx.budget || '؟') + ' على الحساب ' + (ctx.account || '؟');
      }
      toast('اكتمل تشغيل المرقاب', 'ok');
    } catch (e) {
      // A toast disappears in three seconds and truncates. A probe failure is
      // something the operator has to READ and act on, so it stays on screen
      // with the server's own detail line under it.
      if (status) status.textContent = '';
      var out = document.getElementById('probe-out');
      var mx = document.getElementById('probe-matrix');
      if (mx && out) {
        // WHAT happened, WHY it matters, WHAT to do — then the technical
        // detail underneath. A bare code teaches nothing; a bare sentence
        // cannot be searched or reported.
        mx.textContent = (e.message || 'فشل تشغيل المرقاب')
          + (e.code && PROBE_FIX[e.code] ? '\\n\\nما العمل: ' + PROBE_FIX[e.code] : '')
          + '\\n\\nلم تُسجَّل أي نتيجة قدرة — هذا فشل تشغيل، وليس حكماً على أي قدرة في Meta.'
          + (e.code ? '\\n\\ncode: ' + e.code : '')
          + (e.status ? '\\nhttp: ' + e.status : '')
          + (e.detail ? '\\ndetail: ' + e.detail : '');
        out.style.display = '';
        var rep = document.getElementById('probe-report');
        if (rep) rep.textContent = '';
      }
      renderProbeTally([]);
      toast(e.message || 'فشل تشغيل المرقاب', 'err');
    } finally {
      probeRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = 'شغّل المرقاب'; }
    }
  }

  // What a failure MEANS and what to do about it. The route already returns
  // a distinct code per incident; without this map the operator reads five
  // different problems as one generic red box.
  var PROBE_FIX = {
    TOKEN_DECRYPT_FAILED: 'مفتاح التشفير تغيّر — أعد ربط حساب Meta لهذه المساحة. لا تعالجها كانتهاء صلاحية: السببان مختلفان.',
    NO_AD_ACCOUNT: 'اربط حساباً إعلانياً بهذه المساحة أولاً، أو اختر مساحة أخرى.',
    NO_TOKEN: 'الحساب موجود بلا رمز محفوظ — أعد الربط من صفحة العميل.',
    META_UNREACHABLE: 'قيد شبكة على الخادم، وليس حكماً على أي قدرة. أعد المحاولة، وإن تكرر فافحص خروج الشبكة في Railway.',
    PROBE_FAILED: 'فشل غير مصنَّف — التفاصيل في الحقل detail وفي سجلّ الخادم (ابحث: capability-probe).',
    OPS_SNAPSHOT_FAILED: 'تعذّر بناء لقطة التشغيل — راجع سجلّ الخادم.',
  };

  function renderPreflight() {
    var host = document.getElementById('probe-preflight');
    var body = document.getElementById('probe-preflight-body');
    var sel = document.getElementById('probe-ws');
    if (!host || !body || !sel) return;
    var id = sel.value;
    if (!id) { host.style.display = 'none'; return; }
    var row = null;
    if (opsState.snapshot) {
      row = (opsState.snapshot.workspaces || []).find(function (w) { return w.workspaceId === id; }) || null;
    }
    host.style.display = '';
    body.innerHTML =
      '<div>سيُرسَل <b>حتى ٤٠ نداء قراءة</b> إلى Meta على حساب هذه المساحة، وتُحتسب على حصتها.</div>'
      + '<div>لا يكتب المرقاب شيئاً في Meta ولا في قاعدة بياناتنا — كل النداءات GET.</div>'
      + (row
          ? '<div style="margin-top:6px;">الحساب: <span class="sys-detail" style="display:inline;">'
            + esc(row.externalAccountId || '—') + '</span> · حالة الاتصال: ' + statusChip(row.connection)
            + (row.connection === 'BLOCKED'
                ? '<div style="color:var(--error);font-weight:700;margin-top:4px;">الاتصال محجوب — التشغيل الآن سيفشل على الأرجح: '
                  + esc(row.headline) + '</div>'
                : '')
            + '</div>'
          : '<div class="muted" style="margin-top:6px;">حالة الاتصال غير معروفة — لم تُحمَّل لقطة التشغيل بعد.</div>')
      + '<div class="muted" style="margin-top:6px;">حارس النقر يمنع تشغيلين من <b>هذه الصفحة</b> فقط. لا يوجد قفل على مستوى الحساب بعد — تبويب آخر أو مسؤول آخر يستطيع بدء تشغيل موازٍ.</div>';
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'probe-ws') {
      var b = document.getElementById('probe-run');
      if (b) b.disabled = !e.target.value;
      renderPreflight();
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target) return;
    if (e.target.id === 'probe-run') { runProbe(); return; }
    var copyId = e.target.getAttribute && e.target.getAttribute('data-probe-copy');
    if (copyId) {
      var el = document.getElementById(copyId);
      if (el && navigator.clipboard) {
        navigator.clipboard.writeText(el.textContent || '')
          .then(function () { toast('نُسخ إلى الحافظة', 'ok'); })
          .catch(function () { toast('تعذّر النسخ — حدّد النص يدوياً', 'err'); });
      }
    }
  });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('ar-u-nu-latn'); } catch (e) { return String(v); }
  }
  function fmtShort(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('ar-u-nu-latn'); } catch (e) { return String(v); }
  }
  function fmtAmount(minor, currency) {
    if (minor == null || minor === '') return '—';
    var n = Number(minor);
    if (!isFinite(n)) return '—';
    var major = n / 100;
    var cur = currency || 'USD';
    try {
      return new Intl.NumberFormat('ar-u-nu-latn', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(major);
    } catch (e) {
      return major.toFixed(2) + ' ' + cur;
    }
  }
  function payMethodLabel(m) {
    if (m === 'STRIPE_CARD') return 'Stripe';
    if (m === 'WHATSAPP_MANUAL') return 'واتساب / يدوي';
    return '—';
  }
  // Raw Latin enums on an Arabic operator screen are the same defect class the
  // billing panel audit flagged (raw FREE/ACTIVE). Every enum the API can send
  // gets an Arabic label AND a state colour; an unknown value falls back to
  // the raw string in a muted badge rather than vanishing.
  var SUB_STATUS = {
    ACTIVE:   ['نشط', 'badge-ok'],
    INACTIVE: ['غير نشط', 'badge-muted'],
    PAST_DUE: ['متأخر السداد', 'badge-warn'],
    CANCELED: ['ملغى', 'badge-err'],
  };
  function subStatusBadge(s) {
    var c = SUB_STATUS[s] || [s || '—', 'badge-muted'];
    return '<span class="badge ' + c[1] + '">' + esc(c[0]) + '</span>';
  }
  var EVENT_TYPE = {
    ACTIVATED:  ['تفعيل', 'badge-ok'],
    RENEWED:    ['تجديد', 'badge-ok'],
    CANCELED:   ['إلغاء', 'badge-err'],
    EXPIRED:    ['انتهاء', 'badge-warn'],
    REFUNDED:   ['استرداد', 'badge-warn'],
    UPGRADED:   ['ترقية', 'badge-gold'],
    DOWNGRADED: ['تخفيض', 'badge-muted'],
  };
  function eventTypeBadge(t) {
    var c = EVENT_TYPE[t] || [t || '—', 'badge-muted'];
    return '<span class="badge ' + c[1] + '">' + esc(c[0]) + '</span>';
  }
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || 'ok');
    setTimeout(function () { el.className = 'toast'; }, 3200);
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
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) {
      var err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      err.status = res.status;
      err.detail = data.detail;
      throw err;
    }
    return data;
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (el) { el.style.display = 'none'; });
    document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === name);
    });
    var map = {
      overview: ['view-overview', 'النظرة العامة'],
      workspaces: ['view-workspaces', 'مساحات العمل'],
      customers: ['view-customers', 'إدارة الزبائن'],
      create: ['view-create', 'إنشاء حساب زبون'],
      subscriptions: ['view-subscriptions', 'الاشتراكات'],
      ledger: ['view-ledger', 'سجل المدفوعات'],
      probe: ['view-probe', 'مرقاب قدرات Meta'],
      settings: ['view-settings', 'إعدادات المنصة'],
    };
    var conf = map[name] || map.overview;
    if (!map[name]) name = 'overview';
    if (name === 'overview') { loadOverviewData(); loadPlatformStats(); loadOps(); }
    // The workspaces table reads the SAME snapshot the overview does; fetch
    // only when we have none, so switching tabs is not a network round trip.
    if (name === 'workspaces') { if (opsState.snapshot) renderWorkspaces(); else loadOps(); }
    if (name === 'probe') loadProbeWorkspaces();
    document.getElementById(conf[0]).style.display = '';
    document.getElementById('page-heading').textContent = conf[1];
    // Deep links and refresh land on the same tab instead of resetting to
    // overview. replaceState (not location.hash=) so this never re-triggers
    // the hashchange listener and loops.
    if (('#' + name) !== location.hash) {
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
    }
  }

  function tabFromHash() {
    var h = (location.hash || '').replace('#', '');
    return h || 'overview';
  }
  window.addEventListener('hashchange', function () { showView(tabFromHash()); });

  function statusBadge(active) {
    return active
      ? '<span class="badge badge-ok">نشط</span>'
      : '<span class="badge badge-warn">بانتظار التفعيل</span>';
  }
  function tierBadge(hasPremium, tier, subStatus) {
    if (hasPremium || (tier === 'PREMIUM' && subStatus === 'ACTIVE')) {
      return '<span class="badge badge-gold">Premium</span>';
    }
    if (subStatus === 'CANCELED') return '<span class="badge badge-err">ملغى</span>';
    if (subStatus === 'PAST_DUE') return '<span class="badge badge-warn">متأخر</span>';
    if (tier === 'PREMIUM') return '<span class="badge badge-warn">Premium · غير نشط</span>';
    return '<span class="badge badge-muted">مجاني</span>';
  }

  function renderOverview(o) {
    if (!o) return;
    // "|| dash" turned a real zero into a dash — on an operator screen "0
    // syncs in 7 days" is an ALARM, not missing data. Only null may dash.
    var num = function (v) { return v == null ? '—' : String(v); };
    document.getElementById('kpi-users').textContent = num(o.usersTotal);
    document.getElementById('kpi-active').textContent = num(o.usersActive);
    document.getElementById('kpi-pending').textContent = num(o.usersPending);
    document.getElementById('kpi-premium').textContent = num(o.premiumActive);
    var ws = document.getElementById('kpi-workspaces');
    if (ws) ws.textContent = num(o.workspacesTotal);
    var sy = document.getElementById('kpi-syncs');
    if (sy) sy.textContent = num(o.syncs7d);
    var ai = document.getElementById('kpi-ai');
    if (ai) ai.textContent = num(o.aiConvos7d);
    var pay = document.getElementById('kpi-payments');
    if (pay) pay.textContent = num(o.paymentEvents7d);
  }

  // ── Operations snapshot: system health, attention queue, workspaces ────
  // Every status carries a GLYPH and a WORD as well as a colour. Colour is
  // reinforcement, never the signal — greyscale and colour-blind readers get
  // the same information.
  var ST = {
    HEALTHY:    ['●', 'سليم'],
    RUNNING:    ['◐', 'قيد التشغيل'],
    UNKNOWN:    ['?', 'غير معروف'],
    NOT_TESTED: ['○', 'لم يُختبَر'],
    DEGRADED:   ['◑', 'متدهور'],
    WARNING:    ['▲', 'تحذير'],
    BLOCKED:    ['■', 'محجوب'],
    ERROR:      ['✕', 'خطأ'],
  };
  function statusChip(s) {
    var d = ST[s] || ['?', s || 'غير معروف'];
    return '<span class="st st-' + esc(s) + '"><span class="st-glyph" aria-hidden="true">' + d[0]
      + '</span><span>' + esc(d[1]) + '</span></span>';
  }
  var SYS_LABEL = {
    database: 'قاعدة البيانات', redis: 'Redis', queue: 'طابور المهام',
    workers: 'العمّال الخلفيون', meta: 'تكامل Meta', intelligence: 'الذكاء',
  };
  var opsState = { snapshot: null };

  function renderOps(snap) {
    opsState.snapshot = snap;
    // The headline reports only what was OBSERVED, and never claims plain
    // health while something is undetermined. "يعمل — مع مجهولين" is the
    // honest reading of a system that answers on every axis we could check
    // and stays silent on two we could not.
    var unknown = snap.unknown || [];
    var known = snap.known || [];
    var ov = document.getElementById('ops-overall');
    if (ov) {
      var d = ST[snap.overall] || ['?', snap.overall];
      var word = d[1];
      if (snap.overall === 'HEALTHY' && unknown.length) {
        word = 'يعمل — مع ' + unknown.length + ' مجهول';
      }
      ov.className = 'st st-' + (unknown.length && snap.overall === 'HEALTHY' ? 'UNKNOWN' : snap.overall);
      ov.innerHTML = '<span class="st-glyph" aria-hidden="true">' + (unknown.length && snap.overall === 'HEALTHY' ? '◐' : d[0])
        + '</span><span>' + esc(word) + '</span>';
    }
    var cert = document.getElementById('ops-certainty');
    if (cert) {
      var nameOf = function (k) { return SYS_LABEL[k] || k; };
      cert.innerHTML = 'مرصود: ' + (known.length ? known.map(nameOf).map(esc).join(' · ') : '—')
        + (unknown.length
            ? ' &nbsp;|&nbsp; <span style="color:var(--warning);font-weight:700;">غير مرصود: '
              + unknown.map(nameOf).map(esc).join(' · ') + '</span>'
            : '');
    }

    var grid = document.getElementById('ops-subsystems');
    if (grid) {
      grid.innerHTML = (snap.subsystems || []).map(function (s) {
        return '<div class="sys-card">'
          + '<div class="sys-name">' + esc(SYS_LABEL[s.key] || s.key) + '</div>'
          + statusChip(s.status)
          + '<div class="sys-sum">' + esc(s.summary) + '</div>'
          + (s.detail ? '<div class="sys-detail">' + esc(s.detail) + '</div>' : '')
          + (s.actionHref ? '<a class="att-action" href="' + esc(s.actionHref) + '">' + esc(s.actionLabel || 'افتح') + ' ←</a>' : '')
          + '</div>';
      }).join('');
    }

    var host = document.getElementById('ops-attention');
    var cnt = document.getElementById('ops-attention-count');
    var items = snap.attention || [];
    if (cnt) cnt.textContent = items.length ? items.length + ' بند' : '';
    if (host) {
      host.innerHTML = items.length
        ? items.map(function (a) {
            return '<div class="att-item att-' + esc(a.severity) + '">'
              + '<div style="flex:1;min-width:0;">'
              + '<div class="att-title">' + esc(a.title) + '</div>'
              + '<div class="att-because">' + esc(a.because) + '</div>'
              + (a.action ? (a.href
                  ? '<a class="att-action" href="' + esc(a.href) + '">' + esc(a.action) + ' ←</a>'
                  : '<div class="att-action">' + esc(a.action) + '</div>') : '')
              + '</div></div>';
          }).join('')
        // An empty attention queue is a RESULT, not an empty state. Saying so
        // explicitly is what makes the queue trustworthy when it is not empty.
        : '<div class="att-clear">✓ لا شيء يحتاج تدخلاً الآن</div>';
    }
    renderWorkspaces();
  }

  function filteredWorkspaces() {
    var snap = opsState.snapshot;
    if (!snap) return [];
    var qEl = document.getElementById('ws-search');
    var fEl = document.getElementById('ws-filter');
    var q = (qEl && qEl.value || '').trim().toLowerCase();
    var f = (fEl && fEl.value) || 'all';
    return (snap.workspaces || []).filter(function (r) {
      if (f === 'problems' && (r.overall === 'HEALTHY' || r.overall === 'NOT_TESTED')) return false;
      if (f !== 'all' && f !== 'problems' && r.overall !== f) return false;
      if (!q) return true;
      var hay = ((r.workspaceName || '') + ' ' + (r.ownerEmail || '') + ' ' + (r.adAccountName || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderWorkspaces() {
    var tbody = document.getElementById('ws-tbody');
    if (!tbody) return;
    var rows = filteredWorkspaces();
    // data-th feeds the mobile card layout via CSS ::before — the header row
    // is hidden below 760px, so each cell must carry its own label.
    tbody.innerHTML = rows.map(function (r) {
      var sync = r.lastSyncedAt ? fmtShort(r.lastSyncedAt) : 'لم تحدث';
      if (r.lastSyncStatus === 'FAILED') sync += ' (فشلت)';
      var age = r.dataAgeDays == null ? 'لا بيانات' : r.dataAgeDays === 0 ? 'اليوم' : 'قبل ' + r.dataAgeDays + ' يوم';
      return '<tr>'
        + '<td data-th="مساحة العمل"><div><div style="font-weight:700;">' + esc(r.workspaceName) + '</div>'
        +   '<div class="muted">' + esc(r.ownerEmail || '—') + '</div></div></td>'
        + '<td data-th="الحالة"><div>' + statusChip(r.overall)
        +   '<div class="muted" style="margin-top:3px;">' + esc(r.headline) + '</div></div></td>'
        + '<td data-th="الاتصال">' + statusChip(r.connection) + '</td>'
        + '<td data-th="البيانات"><div>' + statusChip(r.data)
        +   '<div class="muted" style="margin-top:3px;">' + esc(age) + '</div></div></td>'
        + '<td data-th="آخر مزامنة"><span class="muted">' + esc(sync) + '</span></td>'
        + '<td data-th="حساب Meta"><span class="sys-detail" style="margin:0;">'
        +   esc(r.externalAccountId || '—') + '</span></td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">لا مساحات مطابقة.</td></tr>';
  }

  async function loadOps() {
    try {
      renderOps(await api('/api/admin/ops'));
    } catch (e) {
      var host = document.getElementById('ops-attention');
      if (host) host.innerHTML = '<div class="error-box">' + esc(e.message || 'تعذّر تحميل لقطة التشغيل')
        + (e.code ? ' <span class="sys-detail" style="display:inline;">' + esc(e.code) + '</span>' : '') + '</div>';
      var tb = document.getElementById('ws-tbody');
      if (tb) tb.innerHTML = '<tr><td colspan="6" class="empty">تعذّر التحميل.</td></tr>';
    }
  }

  // ── Platform stats: the observability numbers, now on the landing tab ──
  var psLast = null;
  function fmtMajor(n) {
    try { return new Intl.NumberFormat('ar-u-nu-latn', { maximumFractionDigits: 2 }).format(n); }
    catch (e) { return String(n); }
  }
  function agoLabel(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'محسوبة منذ ' + s + ' ثانية';
    var m = Math.round(s / 60);
    if (m < 60) return 'محسوبة منذ ' + m + ' دقيقة';
    return 'محسوبة منذ ' + Math.round(m / 60) + ' ساعة';
  }
  function renderPlatformStats(s) {
    if (!s) return;
    psLast = s;
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v == null ? '—' : String(v);
    };
    set('ps-workspaces', s.reach && s.reach.totalWorkspaces);
    set('ps-adaccounts', s.reach && s.reach.totalAdAccounts);
    set('ps-active-accounts', s.reach && s.reach.activeAdAccounts);
    set('ps-campaigns', s.reach && s.reach.activeCampaigns);
    set('ps-snapshots', s.brain && s.brain.snapshotsLastNDays);
    set('ps-narrated', s.brain && s.brain.narrationsLastNDays);
    set('ps-brain-window', s.brain ? 'آخر ' + s.brain.lookbackDays + ' أيام' : '—');
    var cov = document.getElementById('ps-coverage');
    if (cov) {
      var pct = s.brain ? s.brain.narrationCoveragePct : null;
      cov.textContent = pct == null ? 'لا لقطات بعد' : pct + '%';
      cov.className = 'ps-value ps-cov ' + (pct == null ? '' : pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'err');
    }
    var tbody = document.getElementById('ps-money-tbody');
    if (tbody) {
      var rows = (s.money && s.money.byCurrency) || [];
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>'
          + '<td><span class="badge badge-muted">' + esc(r.currency) + '</span></td>'
          + '<td>' + r.activeCampaigns + '</td>'
          + '<td style="font-weight:700;">' + fmtMajor(r.totalDailyBudgetMajor) + ' ' + esc(r.currency) + '</td>'
          + '<td style="font-weight:700;">' + fmtMajor(r.impliedMonthlyMajor) + ' ' + esc(r.currency) + '</td>'
          + '</tr>';
      }).join('') || '<tr><td colspan="4" class="empty">لا حملات نشطة بميزانية يومية.</td></tr>';
    }
    var badge = document.getElementById('ps-fresh-badge');
    if (badge) {
      badge.textContent = s.fromCache ? 'من الذاكرة' : 'طازجة';
      badge.className = 'badge ' + (s.fromCache ? 'badge-muted' : 'badge-ok');
    }
    var at = document.getElementById('ps-fresh-at');
    if (at) at.textContent = agoLabel(s.computedAt);
  }
  async function loadPlatformStats() {
    try {
      renderPlatformStats(await api('/api/admin/platform-stats'));
    } catch (e) {
      var at = document.getElementById('ps-fresh-at');
      if (at) at.textContent = e.message || 'تعذّر تحميل إحصاءات المنصة';
    }
  }
  async function recomputePlatformStats() {
    var btn = document.getElementById('ps-refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحساب…'; }
    try {
      await api('/api/admin/cache/bust', { method: 'POST', body: {} });
      await loadPlatformStats();
      toast('أُعيد حساب إحصاءات المنصة', 'ok');
    } catch (e) {
      toast(e.message || 'فشلت إعادة الحساب', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'إعادة الحساب الآن'; }
    }
  }

  async function loadOverviewData() {
    try {
      var counts = await api('/api/admin/support/counts');
      if (counts) {
        var el = function(id) { return document.getElementById(id); };
        if (el('kpi-support-open')) el('kpi-support-open').textContent = counts.open || 0;
        if (el('kpi-support-awaiting')) el('kpi-support-awaiting').textContent = counts.awaiting || 0;
        if (el('kpi-support-urgent')) el('kpi-support-urgent').textContent = counts.urgent || 0;
        if (el('kpi-support-resolved')) el('kpi-support-resolved').textContent = counts.resolved || 0;
      }

      var alerts = [];
      if (counts && counts.urgent > 0) alerts.push('⚠️ ' + counts.urgent + ' طلبات دعم عاجلة تحتاج ردّ فوري');
      if (counts && counts.open > 5) alerts.push('📬 ' + counts.open + ' طلبات مفتوحة في صندوق البريد');
      if (state.overview) {
        if (state.overview.usersPending > 0) alerts.push('👤 ' + state.overview.usersPending + ' حسابات بانتظار التفعيل');
        // Zero syncs across the whole platform for a week is an outage
        // signature, not a quiet week — the workers or every token died.
        if (state.overview.syncs7d === 0) alerts.push('🛑 لا مزامنة واحدة خلال 7 أيام — افحص العمال والرموز في «مراقبة المنصة»');
      }
      if (psLast && psLast.brain && psLast.brain.narrationCoveragePct != null && psLast.brain.narrationCoveragePct < 40) {
        alerts.push('🧠 التغطية السردية ' + psLast.brain.narrationCoveragePct + '% — أغلب اللقطات بلا سرد');
      }
      var alertsEl = document.getElementById('overview-alerts');
      if (alertsEl) {
        alertsEl.innerHTML = alerts.length
          ? alerts.map(function(a) { return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' + esc(a) + '</div>'; }).join('')
          : '<div style="color:var(--success);">✓ لا توجد تنبيهات — كل شيء يعمل بشكل طبيعي</div>';
      }
    } catch (e) { /* silent */ }
  }

  function renderCustomers(rows) {
    var tbody = document.getElementById('customers-tbody');
    var empty = document.getElementById('customers-empty');
    var table = document.getElementById('customers-table');
    if (!rows.length) {
      tbody.innerHTML = '';
      empty.style.display = '';
      table.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    table.style.display = '';
    tbody.innerHTML = rows.map(function (u) {
      var wsNames = (u.workspaces || []).map(function (w) { return w.name; }).join(' · ') || '—';
      // Whether a customer's workspaces have a Meta account linked decides
      // what the operator can DO for them (sync, probe, diagnose). Surfacing
      // it here saves opening every drawer to find out.
      var metaCount = (u.workspaces || []).reduce(function (n, w) {
        return n + (w.adAccountCount != null ? w.adAccountCount : (w.adAccounts || []).length);
      }, 0);
      var metaBadge = metaCount
        ? '<span class="badge badge-ok">Meta ×' + metaCount + '</span>'
        : '<span class="badge badge-warn">بلا حساب Meta</span>';
      return '<tr>'
        + '<td><div style="font-weight:700;">' + esc(u.name) + '</div><div class="muted">' + esc(u.email) + '</div></td>'
        + '<td>' + statusBadge(u.isActive) + '</td>'
        + '<td>' + tierBadge(u.hasPremium) + '</td>'
        + '<td><div>' + esc(wsNames) + '</div><div class="muted" style="margin:2px 0 4px;">' + (u.workspaces || []).length + ' مساحة</div>' + metaBadge + '</td>'
        + '<td class="muted">' + esc(fmtShort(u.createdAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-secondary btn-sm" data-open="' + esc(u.id) + '">تفاصيل</button>'
        +   (u.isActive
              ? '<button class="btn btn-danger btn-sm" data-deactivate="' + esc(u.id) + '">إيقاف</button>'
              : '<button class="btn btn-success btn-sm" data-activate="' + esc(u.id) + '">تفعيل</button>')
        +   '<button class="btn btn-danger btn-sm" data-delete="' + esc(u.id) + '">حذف</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function filteredSubscriptions() {
    var q = (document.getElementById('subs-search-q').value || '').trim().toLowerCase();
    var tier = document.getElementById('subs-filter-tier').value;
    var status = document.getElementById('subs-filter-status').value;
    return (state.subscriptions || []).filter(function (w) {
      var isPaying = w.tier === 'PREMIUM' && w.subscriptionStatus === 'ACTIVE';
      if (tier === 'PREMIUM' && !isPaying) return false;
      if (tier === 'FREE' && isPaying) return false;
      if (status !== 'all' && w.subscriptionStatus !== status) return false;
      if (!q) return true;
      var owner = w.owner ? ((w.owner.name || '') + ' ' + (w.owner.email || '')) : '';
      var hay = ((w.name || '') + ' ' + (w.id || '') + ' ' + owner).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderSubscriptions() {
    var rows = filteredSubscriptions();
    var tbody = document.getElementById('subs-tbody');
    tbody.innerHTML = rows.map(function (w) {
      var owner = w.owner ? (w.owner.name + ' · ' + w.owner.email) : '—';
      return '<tr>'
        + '<td><div style="font-weight:700;">' + esc(w.name) + '</div><div class="muted">' + esc(w.id) + '</div></td>'
        + '<td>' + esc(owner) + '</td>'
        + '<td>' + tierBadge(false, w.tier, w.subscriptionStatus) + '</td>'
        + '<td>' + subStatusBadge(w.subscriptionStatus) + '</td>'
        + '<td class="muted">' + esc(payMethodLabel(w.paymentMethod)) + '</td>'
        + '<td class="muted">' + esc(fmtShort(w.subscriptionExpiresAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-success btn-sm" data-grant="' + esc(w.id) + '">' + (w.subscriptionStatus === 'ACTIVE' ? 'تجديد' : 'تفعيل') + ' Premium</button>'
        +   (w.subscriptionStatus === 'ACTIVE' ? '<button class="btn btn-secondary btn-sm" data-extend="' + esc(w.id) + '">تمديد</button>' : '')
        +   '<button class="btn btn-danger btn-sm" data-cancel="' + esc(w.id) + '">إلغاء</button>'
        + '</div></td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="7" class="empty">لا اشتراكات مطابقة.</td></tr>';
  }

  function renderLedger(events) {
    var tbody = document.getElementById('ledger-tbody');
    tbody.innerHTML = (events || []).map(function (e) {
      return '<tr>'
        + '<td class="muted">' + esc(fmtDate(e.createdAt)) + '</td>'
        + '<td>' + esc(e.workspace && e.workspace.name) + '</td>'
        + '<td>' + eventTypeBadge(e.eventType) + '</td>'
        + '<td class="muted">' + esc(e.source) + '</td>'
        + '<td class="muted">' + esc(fmtAmount(e.amountMinor, e.currency)) + '</td>'
        + '<td>' + esc(e.note || e.externalRef || '—') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">لا أحداث بعد.</td></tr>';
  }

  async function openDetail(userId) {
    var drawer = document.getElementById('drawer');
    var body = document.getElementById('drawer-body');
    body.innerHTML = '<div class="muted">جارٍ التحميل…</div>';
    drawer.classList.add('open');
    try {
      var d = await api('/api/admin/customers/' + encodeURIComponent(userId));
      state.detail = d;
      document.getElementById('drawer-title').textContent = d.user.name;
      document.getElementById('drawer-sub').textContent = d.user.email;
      var wsHtml = (d.workspaces || []).map(function (w) {
        return '<div class="list-card">'
          + '<div style="font-weight:700;">' + esc(w.name) + ' ' + tierBadge(false, w.tier, w.subscriptionStatus) + '</div>'
          + '<div class="muted">الحالة: ' + subStatusBadge(w.subscriptionStatus) + ' · طريقة الدفع: ' + esc(payMethodLabel(w.paymentMethod)) + ' · ينتهي: ' + esc(fmtShort(w.subscriptionExpiresAt)) + '</div>'
          + '<div class="actions" style="margin-top:8px;">'
          +   '<button class="btn btn-success btn-sm" data-grant="' + esc(w.id) + '">' + (w.subscriptionStatus === 'ACTIVE' ? 'تجديد' : 'تفعيل') + ' Premium</button>'
          +   (w.subscriptionStatus === 'ACTIVE' ? '<button class="btn btn-secondary btn-sm" data-extend="' + esc(w.id) + '">تمديد</button>' : '')
          +   '<button class="btn btn-danger btn-sm" data-cancel="' + esc(w.id) + '">إلغاء الاشتراك</button>'
          + '</div>'
          + ((w.adAccounts || []).length
              ? '<div class="muted" style="margin-top:8px;">حسابات Meta: ' +
                w.adAccounts.map(function (a) { return esc(a.name) + ' (' + esc(a.currency) + ')'; }).join(' · ') +
                '</div>'
              : '<div class="muted" style="margin-top:8px;">لا حساب Meta مربوط بعد</div>')
          + '</div>';
      }).join('') || '<div class="muted">لا مساحات عمل</div>';

      var syncHtml = (d.activity.recentSyncs || []).slice(0, 8).map(function (s) {
        return '<div class="list-card"><div style="font-weight:600;">' + esc(s.adAccount && s.adAccount.name) +
          '</div><div class="muted">' + esc(s.status) + ' · ' + esc(fmtDate(s.createdAt)) +
          (s.error ? ' · ' + esc(s.error) : '') + '</div></div>';
      }).join('') || '<div class="muted">لا مزامنات حديثة</div>';

      var aiHtml = (d.activity.recentAi || []).slice(0, 6).map(function (c) {
        return '<div class="list-card"><div style="font-weight:600;">' + esc(c.title || 'محادثة') +
          '</div><div class="muted">' + (c._count && c._count.messages || 0) + ' رسالة · ' +
          esc(fmtDate(c.updatedAt)) + '</div></div>';
      }).join('') || '<div class="muted">لا محادثات ذكاء اصطناعي</div>';

      body.innerHTML =
        '<div class="section"><h3>الحساب</h3>'
        + statusBadge(d.user.isActive)
        + ' <span class="muted">انضم ' + esc(fmtDate(d.user.createdAt)) + '</span>'
        + '<div class="actions" style="margin-top:10px;">'
        +   (d.user.isActive
              ? '<button class="btn btn-danger btn-sm" data-deactivate="' + esc(d.user.id) + '">إيقاف الحساب</button>'
              : '<button class="btn btn-success btn-sm" data-activate="' + esc(d.user.id) + '">تفعيل الحساب</button>')
        + '</div></div>'
        + '<div class="section"><h3>تعديل البيانات</h3>'
        + '<form id="edit-form" class="form-grid">'
        +   '<div class="form-group"><label>الاسم</label><input class="field" name="name" value="' + esc(d.user.name) + '" /></div>'
        +   '<div class="form-group"><label>البريد</label><input class="field" name="email" value="' + esc(d.user.email) + '" /></div>'
        +   '<div class="form-group"><label>اللغة</label><select class="field" name="locale">'
        +     '<option value="AR"' + (d.user.locale === 'AR' ? ' selected' : '') + '>العربية</option>'
        +     '<option value="EN"' + (d.user.locale === 'EN' ? ' selected' : '') + '>English</option>'
        +   '</select></div>'
        +   '<div class="form-group"><button class="btn btn-primary" type="submit">حفظ التعديل</button></div>'
        + '</form></div>'
        + '<div class="section"><h3>إعادة تعيين كلمة المرور</h3>'
        + '<form id="pw-form" class="form-grid">'
        +   '<div class="form-group full"><input class="field" name="password" type="text" minlength="8" placeholder="كلمة مرور جديدة (8+)" required /></div>'
        +   '<div class="form-group"><button class="btn btn-secondary" type="submit">تعيين كلمة المرور</button></div>'
        + '</form></div>'
        + '<div class="section"><h3>مساحات العمل والاشتراك</h3>' + wsHtml + '</div>'
        + '<div class="section"><h3>النشاط · ' + (d.activity.campaignCount || 0) + ' حملة</h3>'
        + '<div class="muted" style="margin-bottom:8px;">آخر المزامنات</div>' + syncHtml
        + '<div class="muted" style="margin:12px 0 8px;">محادثات المساعد</div>' + aiHtml
        + '</div>'
        + '<div class="section danger"><h3>منطقة الخطر</h3>'
        + '<button class="btn btn-danger btn-sm" data-delete="' + esc(d.user.id) + '">حذف الحساب</button>'
        + '</div>';
    } catch (e) {
      body.innerHTML = '<div class="error-box">' + esc(e.message || 'تعذّر التحميل') + '</div>';
    }
  }

  // Reveal the admin shell only after ensureAdmin() has confirmed the viewer
  // is a platform admin. The shell ships display:none behind a full-screen
  // access gate, so a customer never sees any admin structure before the
  // /api/auth/me check redirects them.
  async function ensureAdmin() {
    try {
      var me = await api('/api/auth/me');
      if (!me || !me.isPlatformAdmin) { window.location.replace('/dashboard'); return false; }
      var accessGate = document.getElementById('access-gate');
      if (accessGate) accessGate.classList.add('hidden');
      document.querySelector('.app').style.display = 'flex';
      document.getElementById('admin-email').textContent = me.email || (me.user && me.user.email) || '';
      // Re-arm the cookie-sync loop guard: a future cookie/bearer desync may
      // heal again now that this load proved the session sound.
      try { sessionStorage.removeItem('adm_sync'); } catch (e) {}
      return true;
    } catch (e) {
      // 401 already redirected inside api(). For any other failure we cannot
      // confirm admin status — show a retry on the gate rather than reveal
      // admin chrome to an unverified viewer.
      if (e && e.message === 'Unauthorized') return false;
      var g = document.getElementById('access-gate');
      if (g) g.innerHTML = '<div style="max-width:320px;text-align:center;line-height:1.8;">تعذّر التحقق من الصلاحية. تحقق من اتصالك ثم <a href="javascript:location.reload()" style="color:var(--accent);text-decoration:underline;">أعد المحاولة</a>.</div>';
      return false;
    }
  }

  async function loadAll() {
    var gate = document.getElementById('gate-error');
    gate.style.display = 'none';
    // A slow response must read as "loading", never as "no customers".
    var loadingRow = function (cols) {
      return '<tr><td colspan="' + cols + '" class="empty">جارٍ التحميل…</td></tr>';
    };
    if (!state.customers.length) document.getElementById('customers-tbody').innerHTML = loadingRow(6);
    if (!state.subscriptions.length) document.getElementById('subs-tbody').innerHTML = loadingRow(7);
    if (!state.events.length) document.getElementById('ledger-tbody').innerHTML = loadingRow(6);
    try {
      var q = document.getElementById('search-q').value.trim();
      var status = document.getElementById('filter-status').value;
      var tier = document.getElementById('filter-tier').value;
      var qs = '?take=100'
        + (q ? '&q=' + encodeURIComponent(q) : '')
        + '&status=' + encodeURIComponent(status)
        + '&tier=' + encodeURIComponent(tier);

      var results = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/customers' + qs),
        api('/api/admin/subscriptions?take=100'),
        api('/api/admin/payment-events?take=50'),
      ]);
      state.overview = results[0];
      state.customers = results[1].customers || [];
      state.subscriptions = results[2].subscriptions || [];
      state.events = results[3].events || [];
      renderOverview(state.overview);
      renderCustomers(state.customers);
      renderSubscriptions();
      renderLedger(state.events);
      // Alerts read state.overview (pending-activation count); refresh them
      // now that it exists instead of leaving the boot-time render stale.
      loadOverviewData();
    } catch (e) {
      gate.style.display = '';
      if (e.status === 403 || e.status === 503) {
        gate.textContent = e.message || 'غير مصرح — تأكد من PLATFORM_ADMIN_EMAILS.';
      } else {
        gate.textContent = e.message || 'تعذّر تحميل لوحة الإدارة.';
      }
    }
  }

  async function activateUser(userId) {
    await api('/api/admin/users/activate', { method: 'POST', body: { userId: userId } });
    toast('تم تفعيل الحساب', 'ok');
    await loadAll();
    if (state.detail && state.detail.user.id === userId) openDetail(userId);
  }
  async function deactivateUser(userId) {
    if (!confirm('إيقاف هذا الحساب؟ لن يتمكن الزبون من الدخول.')) return;
    await api('/api/admin/users/deactivate', { method: 'POST', body: { userId: userId } });
    toast('تم إيقاف الحساب', 'ok');
    await loadAll();
    if (state.detail && state.detail.user.id === userId) openDetail(userId);
  }
  async function grantPremium(workspaceId) {
    var days = prompt('مدة الاشتراك بالأيام؟', '30');
    if (!days) return;
    var n = Math.max(1, Math.min(730, Number(days) || 30));
    var expiresAt = new Date(Date.now() + n * 864e5).toISOString();
    var note = prompt('ملاحظة (اختياري):', 'تفعيل يدوي من لوحة المالك') || '';
    await api('/api/admin/subscriptions/activate-manual', {
      method: 'POST',
      body: { workspaceId: workspaceId, tier: 'PREMIUM', expiresAt: expiresAt, note: note },
    });
    toast('تم تفعيل/تجديد Premium', 'ok');
    await loadAll();
    if (state.detail) openDetail(state.detail.user.id);
  }
  async function cancelSub(workspaceId) {
    if (!confirm('إلغاء اشتراك هذه المساحة وتحويلها إلى مجاني؟')) return;
    var note = prompt('سبب الإلغاء (اختياري):', '') || '';
    await api('/api/admin/subscriptions/cancel-manual', {
      method: 'POST',
      body: { workspaceId: workspaceId, note: note },
    });
    toast('تم إلغاء الاشتراك', 'ok');
    await loadAll();
    if (state.detail) openDetail(state.detail.user.id);
  }

  async function extendSub(workspaceId) {
    var days = prompt('تمديد لكم يوم إضافي؟', '30');
    if (!days) return;
    var n = Math.max(1, Math.min(730, Number(days) || 30));
    var newExpiresAt = new Date(Date.now() + n * 864e5).toISOString();
    var note = prompt('ملاحظة (اختياري):', 'تمديد يدوي من لوحة المالك') || '';
    await api('/api/admin/subscriptions/extend', {
      method: 'POST',
      body: { workspaceId: workspaceId, newExpiresAt: newExpiresAt, note: note },
    });
    toast('تم تمديد الاشتراك', 'ok');
    await loadAll();
    if (state.detail) openDetail(state.detail.user.id);
  }

  function renderSettings(rows) {
    var tbody = document.getElementById('settings-tbody');
    var empty = document.getElementById('settings-empty');
    var table = document.getElementById('settings-table');
    if (!rows || !rows.length) {
      tbody.innerHTML = '';
      empty.style.display = '';
      table.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    table.style.display = '';
    tbody.innerHTML = rows.map(function (s) {
      var valDisplay = s.value;
      if (s.valueType === 'boolean') valDisplay = s.value === 'true' ? 'مُفعّل' : 'مُعطّل';
      var valBadge = s.valueType === 'boolean'
        ? (s.value === 'true' ? '<span class="badge badge-ok">' + esc(valDisplay) + '</span>' : '<span class="badge badge-err">' + esc(valDisplay) + '</span>')
        : '<span style="font-weight:700;">' + esc(valDisplay) + '</span>';
      return '<tr>'
        + '<td><div style="font-weight:700;font-size:12px;font-family:monospace;direction:ltr;text-align:left;">' + esc(s.key) + '</div>'
        + (s.label ? '<div class="muted">' + esc(s.label) + '</div>' : '') + '</td>'
        + '<td>' + valBadge + '</td>'
        + '<td class="muted">' + esc(s.valueType) + '</td>'
        + '<td class="muted">' + esc(s.group) + '</td>'
        + '<td class="muted" style="max-width:200px;">' + esc(s.description || '—') + '</td>'
        + '<td class="muted">' + esc(fmtDate(s.updatedAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-secondary btn-sm" data-edit-setting="' + esc(s.key) + '">تعديل</button>'
        +   '<button class="btn btn-danger btn-sm" data-del-setting="' + esc(s.key) + '">حذف</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  async function loadSettings() {
    try {
      var data = await api('/api/admin/settings');
      state.settings = data.settings || [];
      renderSettings(state.settings);
    } catch (e) {
      toast(e.message || 'فشل تحميل الإعدادات', 'err');
    }
  }

  async function editSetting(key) {
    var existing = state.settings.find(function (s) { return s.key === key; });
    var val = existing ? existing.value : '';
    var newVal;
    if (existing && existing.valueType === 'boolean') {
      newVal = val === 'true' ? 'false' : 'true';
    } else {
      newVal = prompt('القيمة الجديدة لـ ' + key + ':', val);
      if (newVal === null) return;
    }
    try {
      await api('/api/admin/settings/' + encodeURIComponent(key), {
        method: 'PUT',
        body: { value: newVal },
      });
      toast('تم تحديث ' + key, 'ok');
      await loadSettings();
    } catch (e) {
      toast(e.message || 'فشل التحديث', 'err');
    }
  }

  async function addSetting() {
    var key = prompt('مفتاح الإعداد (مثل: features.myFlag):');
    if (!key) return;
    var val = prompt('القيمة:', '');
    if (val === null) return;
    var vt = prompt('النوع (string / number / boolean):', 'string') || 'string';
    var group = prompt('المجموعة (features / sync / limits / general):', 'general') || 'general';
    var label = prompt('العنوان (اختياري):', '') || undefined;
    try {
      await api('/api/admin/settings/' + encodeURIComponent(key), {
        method: 'PUT',
        body: { value: val, valueType: vt, group: group, label: label },
      });
      toast('تم إضافة الإعداد', 'ok');
      await loadSettings();
    } catch (e) {
      toast(e.message || 'فشل الإضافة', 'err');
    }
  }

  async function delSetting(key) {
    if (!confirm('حذف الإعداد ' + key + '؟')) return;
    try {
      await api('/api/admin/settings/' + encodeURIComponent(key), { method: 'DELETE' });
      toast('تم حذف الإعداد', 'ok');
      await loadSettings();
    } catch (e) {
      toast(e.message || 'فشل الحذف', 'err');
    }
  }

  async function seedSettings() {
    try {
      var res = await api('/api/admin/settings/seed', { method: 'POST' });
      toast('تم تحميل ' + (res.seeded || 0) + ' إعداد افتراضي', 'ok');
      await loadSettings();
    } catch (e) {
      toast(e.message || 'فشل التحميل', 'err');
    }
  }

  // Deletion is the one action here with no undo — it purges the user, the
  // workspaces and their synced data. It used to run on a single click with
  // no confirmation at all. Now the operator must TYPE the account's email:
  // a copy-paste-proof pause that a reflexive "OK" click cannot skip.
  function customerEmailById(userId) {
    if (state.detail && state.detail.user && state.detail.user.id === userId) return state.detail.user.email;
    var row = (state.customers || []).find(function (u) { return u.id === userId; });
    return row ? row.email : null;
  }
  async function deleteCustomerNow(userId) {
    var email = customerEmailById(userId);
    if (!email) { toast('تعذّر تحديد الحساب — حدّث القائمة أولاً', 'err'); return; }
    var typed = prompt('حذف نهائي — سيُمحى الحساب ومساحاته وبياناته ولا يمكن التراجع.\\n\\nاكتب بريد الحساب كاملاً للتأكيد:\\n' + email);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      toast('البريد غير مطابق — لم يُحذف شيء', 'err');
      return;
    }
    await api('/api/admin/customers/' + encodeURIComponent(userId), {
      method: 'DELETE',
    });
    toast('تم حذف الحساب', 'ok');
    document.getElementById('drawer').classList.remove('open');
    await loadAll();
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadAll();
    loadSettings();
    loadPlatformStats();
    loadOps();
    // The workspace list behind the probe dropdown is cached per page-load;
    // "refresh" should mean everything the console shows.
    probeLoaded = false;
    if (location.hash === '#probe') loadProbeWorkspaces();
  });
  document.getElementById('btn-search').addEventListener('click', function () { loadAll(); });
  document.getElementById('search-q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadAll();
  });
  document.getElementById('subs-search-q').addEventListener('input', function () { renderSubscriptions(); });
  document.getElementById('subs-filter-tier').addEventListener('change', function () { renderSubscriptions(); });
  document.getElementById('subs-filter-status').addEventListener('change', function () { renderSubscriptions(); });
  document.getElementById('btn-open-create').addEventListener('click', function () { showView('create'); });
  document.getElementById('drawer-close').addEventListener('click', function () {
    document.getElementById('drawer').classList.remove('open');
  });
  document.getElementById('drawer').addEventListener('click', function (e) {
    if (e.target.id === 'drawer') document.getElementById('drawer').classList.remove('open');
  });

  document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      showView(el.getAttribute('data-tab'));
    });
  });

  // KPI cards on the overview are doors, not just numbers: the count of
  // pending activations IS the customers tab filtered mentally — take the
  // operator there in one click.
  document.body.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('[data-goto]');
    if (!g) return;
    var dest = g.getAttribute('data-goto');
    if (!dest) return;
    if (dest.charAt(0) === '#') showView(dest.slice(1));
    else window.location.href = dest;
  });

  document.body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-activate],[data-deactivate],[data-grant],[data-cancel],[data-delete],[data-extend],[data-edit-setting],[data-del-setting]');
    if (!t) return;
    var openId = t.getAttribute('data-open');
    var act = t.getAttribute('data-activate');
    var deact = t.getAttribute('data-deactivate');
    var grant = t.getAttribute('data-grant');
    var cancel = t.getAttribute('data-cancel');
    var del = t.getAttribute('data-delete');
    var ext = t.getAttribute('data-extend');
    var editSet = t.getAttribute('data-edit-setting');
    var delSet = t.getAttribute('data-del-setting');
    if (openId) openDetail(openId);
    else if (act) activateUser(act).catch(function (err) { toast(err.message, 'err'); });
    else if (deact) deactivateUser(deact).catch(function (err) { toast(err.message, 'err'); });
    else if (grant) grantPremium(grant).catch(function (err) { toast(err.message, 'err'); });
    else if (cancel) cancelSub(cancel).catch(function (err) { toast(err.message, 'err'); });
    else if (ext) extendSub(ext).catch(function (err) { toast(err.message, 'err'); });
    else if (editSet) editSetting(editSet).catch(function (err) { toast(err.message, 'err'); });
    else if (delSet) delSetting(delSet).catch(function (err) { toast(err.message, 'err'); });
    else if (del) {
      deleteCustomerNow(del).catch(function (err) { toast(err.message, 'err'); });
    }
  });

  document.getElementById('create-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var btn = document.getElementById('create-submit');
    btn.disabled = true;
    try {
      var res = await api('/api/admin/customers', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
          workspaceName: fd.get('workspaceName') || undefined,
          locale: fd.get('locale') || 'AR',
          activateAccount: !!fd.get('activateAccount'),
          grantPremium: !!fd.get('grantPremium'),
          premiumDays: Number(fd.get('premiumDays') || 30),
          premiumNote: fd.get('premiumNote') || undefined,
        },
      });
      toast('تم إنشاء حساب ' + (res.user && res.user.email), 'ok');
      e.target.reset();
      showView('customers');
      await loadAll();
      if (res.user && res.user.id) openDetail(res.user.id);
    } catch (err) {
      toast(err.message || 'فشل الإنشاء', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('drawer-body').addEventListener('submit', async function (e) {
    var form = e.target;
    if (!form || !state.detail) return;
    if (form.id === 'edit-form') {
      e.preventDefault();
      var fd = new FormData(form);
      try {
        await api('/api/admin/customers/' + encodeURIComponent(state.detail.user.id), {
          method: 'PATCH',
          body: { name: fd.get('name'), email: fd.get('email'), locale: fd.get('locale') },
        });
        toast('تم حفظ التعديل', 'ok');
        await loadAll();
        openDetail(state.detail.user.id);
      } catch (err) { toast(err.message, 'err'); }
    }
    if (form.id === 'pw-form') {
      e.preventDefault();
      var pfd = new FormData(form);
      try {
        await api('/api/admin/customers/' + encodeURIComponent(state.detail.user.id) + '/reset-password', {
          method: 'POST',
          body: { password: pfd.get('password') },
        });
        toast('تم تعيين كلمة المرور الجديدة', 'ok');
        form.reset();
      } catch (err) { toast(err.message, 'err'); }
    }
  });

  document.getElementById('ps-refresh').addEventListener('click', function () { recomputePlatformStats(); });
  document.getElementById('ws-search').addEventListener('input', function () { renderWorkspaces(); });
  document.getElementById('ws-filter').addEventListener('change', function () { renderWorkspaces(); });
  document.getElementById('btn-seed-settings').addEventListener('click', function () { seedSettings(); });
  document.getElementById('btn-add-setting').addEventListener('click', function () { addSetting(); });

  if (!token()) { window.location.replace('/login'); return; }
  ensureAdmin().then(function (ok) {
    if (!ok) return;
    showView(tabFromHash());
    loadAll();
    loadSettings();
  });
})();
</script>
</body>
</html>`;
}
