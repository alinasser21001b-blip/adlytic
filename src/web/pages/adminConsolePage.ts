// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminConsolePage.ts
//
//  Platform-owner console (Arabic RTL): create customers, manage
//  activation/subscriptions, edit accounts, delete accounts, and inspect
//  activity. Data is gated by /api/admin/* + PLATFORM_ADMIN_EMAILS.
// ════════════════════════════════════════════════════════════════════════

export function adminConsolePage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إدارة المنصة — Adlytic</title>
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
    .app { display: flex; min-height: 100vh; }
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
    .content { padding: 22px 24px 40px; max-width: 1280px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 14px; border-radius: 9px; font-weight: 700; font-size: 13px;
      border: 1px solid transparent; transition: 0.15s;
    }
    .btn-primary { background: var(--accent); color: #100E0D; }
    .btn-primary:hover { filter: brightness(1.05); }
    .btn-secondary { background: var(--surface-2); border-color: var(--border); color: var(--text); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-danger { background: rgba(226,96,79,0.12); border-color: rgba(226,96,79,0.35); color: var(--error); }
    .btn-danger-solid { background: var(--error); color: #fff; }
    .btn-danger-solid:hover { filter: brightness(1.08); }
    .btn-success { background: rgba(52,168,113,0.14); border-color: rgba(52,168,113,0.35); color: var(--success); }
    .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
    .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
    @media (max-width: 980px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } .sidebar { display: none; } }
    .kpi {
      padding: 16px; border-radius: 12px; border: 1px solid var(--border);
      background: linear-gradient(145deg, rgba(217,167,89,0.06), var(--surface));
    }
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
      background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
      padding: 9px 12px; color: var(--text); min-width: 0;
    }
    .field:focus { outline: none; border-color: rgba(217,167,89,0.55); }
    .field-sm { padding: 7px 10px; font-size: 12.5px; }
    table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.data th {
      text-align: right; padding: 10px 12px; font-size: 11px; color: var(--text-3);
      border-bottom: 1px solid var(--border); font-weight: 700;
    }
    table.data td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.data tr:hover td { background: rgba(255,255,255,0.015); }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; border: 1px solid transparent;
    }
    .badge-ok { background: rgba(52,168,113,0.14); color: var(--success); border-color: rgba(52,168,113,0.3); }
    .badge-warn { background: rgba(199,122,31,0.14); color: var(--warning); border-color: rgba(199,122,31,0.3); }
    .badge-err { background: rgba(226,96,79,0.12); color: var(--error); border-color: rgba(226,96,79,0.3); }
    .badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
    .badge-gold { background: rgba(217,167,89,0.14); color: var(--accent-2); border-color: rgba(217,167,89,0.3); }
    .muted { color: var(--text-3); font-size: 12px; }
    .error-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(226,96,79,0.35);
      background: rgba(226,96,79,0.08); color: var(--error); margin-bottom: 14px;
    }
    .empty { text-align: center; padding: 28px 12px; color: var(--text-3); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 12px; font-weight: 700; color: var(--text-2); }
    .form-group.full { grid-column: 1 / -1; }
    .check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); }
    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 40;
      display: none; align-items: stretch; justify-content: flex-start;
    }
    .drawer-backdrop.open { display: flex; }
    .drawer {
      width: min(520px, 100%); background: var(--surface); border-left: 1px solid var(--border);
      padding: 18px; overflow-y: auto; box-shadow: -20px 0 60px rgba(0,0,0,0.35);
    }
    .drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .drawer-title { font-size: 18px; font-weight: 800; }
    .section { margin-bottom: 18px; }
    .section h3 { font-size: 13px; font-weight: 800; color: var(--accent-2); margin-bottom: 8px; }
    .section.danger { border: 1px solid rgba(226,96,79,0.3); border-radius: 10px; padding: 12px; background: rgba(226,96,79,0.04); }
    .section.danger h3 { color: var(--error); }
    .list-card {
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
      background: var(--bg);
    }
    .toast {
      position: fixed; bottom: 20px; left: 20px; z-index: 60; padding: 12px 16px; border-radius: 10px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35); display: none; max-width: 360px;
    }
    .toast.show { display: block; }
    .toast.ok { border-color: rgba(52,168,113,0.4); }
    .toast.err { border-color: rgba(226,96,79,0.4); color: #ffb4a8; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 70;
      display: none; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-backdrop.open { display: flex; }
    .modal { width: min(440px, 100%); background: var(--surface); border: 1px solid rgba(226,96,79,0.35); border-radius: 14px; padding: 20px; }
    .modal-title { font-size: 16px; font-weight: 800; color: var(--error); margin-bottom: 8px; }
    .modal-text { font-size: 13px; color: var(--text-2); margin-bottom: 14px; line-height: 1.6; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="logo">
      <div class="logo-brand">Ad<span>lytic</span></div>
      <div class="logo-sub">لوحة المالك · إدارة المنصة</div>
    </div>
    <nav class="nav">
      <div class="nav-label">الإدارة</div>
      <a class="nav-item active" href="#customers" data-tab="customers">الزبائن</a>
      <a class="nav-item" href="#create" data-tab="create">إنشاء حساب</a>
      <a class="nav-item" href="#subscriptions" data-tab="subscriptions">الاشتراكات</a>
      <a class="nav-item" href="#ledger" data-tab="ledger">سجل المدفوعات</a>
      <div class="nav-label">أخرى</div>
      <a class="nav-item" href="/admin/observability">مراقبة المنصة</a>
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
      <h1 id="page-heading">إدارة الزبائن</h1>
      <div class="topbar-actions">
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث</button>
        <button class="btn btn-primary btn-sm" id="btn-open-create">+ زبون جديد</button>
      </div>
    </header>

    <main class="content">
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <div class="kpi-grid" id="kpi-grid">
        <div class="kpi"><div class="kpi-label">إجمالي الزبائن</div><div class="kpi-value" id="kpi-users">—</div></div>
        <div class="kpi"><div class="kpi-label">نشطون</div><div class="kpi-value" id="kpi-active">—</div></div>
        <div class="kpi"><div class="kpi-label">بانتظار التفعيل</div><div class="kpi-value" id="kpi-pending">—</div></div>
        <div class="kpi"><div class="kpi-label">اشتراكات Premium</div><div class="kpi-value gold" id="kpi-premium">—</div></div>
      </div>

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
              <option value="PAST_DUE">متأخر</option>
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

<div class="modal-backdrop" id="delete-modal">
  <div class="modal">
    <div class="modal-title">حذف الحساب نهائياً</div>
    <div class="modal-text" id="delete-modal-text"></div>
    <div class="form-group">
      <label>اكتب البريد الإلكتروني للتأكيد</label>
      <input class="field" id="delete-confirm-input" placeholder="name@example.com" autocomplete="off" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="delete-modal-cancel">إلغاء</button>
      <button class="btn btn-danger-solid" id="delete-modal-confirm" disabled>حذف نهائياً</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  var state = { customers: [], subscriptions: [], events: [], overview: null, detail: null, deleteTarget: null };

  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    window.location.href = '/login';
  }
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
      customers: ['view-customers', 'إدارة الزبائن'],
      create: ['view-create', 'إنشاء حساب زبون'],
      subscriptions: ['view-subscriptions', 'الاشتراكات'],
      ledger: ['view-ledger', 'سجل المدفوعات'],
    };
    var conf = map[name] || map.customers;
    document.getElementById(conf[0]).style.display = '';
    document.getElementById('page-heading').textContent = conf[1];
  }

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
    document.getElementById('kpi-users').textContent = o.usersTotal;
    document.getElementById('kpi-active').textContent = o.usersActive;
    document.getElementById('kpi-pending').textContent = o.usersPending;
    document.getElementById('kpi-premium').textContent = o.premiumActive;
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
      return '<tr>'
        + '<td><div style="font-weight:700;">' + esc(u.name) + '</div><div class="muted">' + esc(u.email) + '</div></td>'
        + '<td>' + statusBadge(u.isActive) + '</td>'
        + '<td>' + tierBadge(u.hasPremium) + '</td>'
        + '<td><div>' + esc(wsNames) + '</div><div class="muted">' + (u.workspaces || []).length + ' مساحة</div></td>'
        + '<td class="muted">' + esc(fmtShort(u.createdAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-secondary btn-sm" data-open="' + esc(u.id) + '">تفاصيل</button>'
        +   (u.isActive
              ? '<button class="btn btn-danger btn-sm" data-deactivate="' + esc(u.id) + '">إيقاف</button>'
              : '<button class="btn btn-success btn-sm" data-activate="' + esc(u.id) + '">تفعيل</button>')
        +   '<button class="btn btn-danger btn-sm" data-delete="' + esc(u.id) + '" data-delete-email="' + esc(u.email) + '">حذف</button>'
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
        + '<td><span class="badge badge-muted">' + esc(w.subscriptionStatus) + '</span></td>'
        + '<td class="muted">' + esc(payMethodLabel(w.paymentMethod)) + '</td>'
        + '<td class="muted">' + esc(fmtShort(w.subscriptionExpiresAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-success btn-sm" data-grant="' + esc(w.id) + '">' + (w.subscriptionStatus === 'ACTIVE' ? 'تجديد' : 'تفعيل') + ' Premium</button>'
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
        + '<td><span class="badge badge-gold">' + esc(e.eventType) + '</span></td>'
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
          + '<div class="muted">الحالة: ' + esc(w.subscriptionStatus) + ' · طريقة الدفع: ' + esc(payMethodLabel(w.paymentMethod)) + ' · ينتهي: ' + esc(fmtShort(w.subscriptionExpiresAt)) + '</div>'
          + '<div class="actions" style="margin-top:8px;">'
          +   '<button class="btn btn-success btn-sm" data-grant="' + esc(w.id) + '">' + (w.subscriptionStatus === 'ACTIVE' ? 'تجديد' : 'تفعيل') + ' Premium</button>'
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
        + '<div class="muted" style="margin-bottom:10px;">حذف الحساب نهائياً يحذف مساحات عمله المملوكة وكل بياناتها (حسابات Meta، الحملات، الاشتراكات، سجل المدفوعات، محادثات الذكاء الاصطناعي). لا يمكن التراجع.</div>'
        + '<button class="btn btn-danger btn-sm" data-delete="' + esc(d.user.id) + '" data-delete-email="' + esc(d.user.email) + '">حذف الحساب نهائياً</button>'
        + '</div>';
    } catch (e) {
      body.innerHTML = '<div class="error-box">' + esc(e.message || 'تعذّر التحميل') + '</div>';
    }
  }

  async function loadAll() {
    var gate = document.getElementById('gate-error');
    gate.style.display = 'none';
    try {
      var me = await api('/api/auth/me');
      if (!me || !me.isPlatformAdmin) {
        gate.style.display = '';
        gate.textContent = 'هذه الصفحة خاصة بمالك المنصة فقط. أضف بريدك إلى PLATFORM_ADMIN_EMAILS.';
        return;
      }
      document.getElementById('admin-email').textContent = me.email || me.user && me.user.email || '';
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

  function openDeleteModal(userId, email) {
    state.deleteTarget = { userId: userId, email: email };
    document.getElementById('delete-modal-text').textContent =
      'سيتم حذف حساب ' + email + ' نهائياً مع كل مساحات عمله المملوكة وبياناتها. هذا الإجراء لا يمكن التراجع عنه.';
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('delete-modal-confirm').disabled = true;
    document.getElementById('delete-modal-confirm').textContent = 'حذف نهائياً';
    document.getElementById('delete-modal').classList.add('open');
    document.getElementById('delete-confirm-input').focus();
  }
  function closeDeleteModal() {
    state.deleteTarget = null;
    document.getElementById('delete-modal').classList.remove('open');
  }
  async function confirmDelete() {
    if (!state.deleteTarget) return;
    var btn = document.getElementById('delete-modal-confirm');
    btn.disabled = true;
    btn.textContent = 'جارٍ الحذف…';
    try {
      await api('/api/admin/customers/' + encodeURIComponent(state.deleteTarget.userId), {
        method: 'DELETE',
        body: { confirmEmail: document.getElementById('delete-confirm-input').value.trim() },
      });
      toast('تم حذف الحساب نهائياً', 'ok');
      closeDeleteModal();
      document.getElementById('drawer').classList.remove('open');
      await loadAll();
    } catch (err) {
      toast(err.message || 'فشل الحذف', 'err');
      btn.disabled = false;
      btn.textContent = 'حذف نهائياً';
    }
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', function () { loadAll(); });
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
  document.getElementById('delete-modal-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', function (e) {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
  document.getElementById('delete-confirm-input').addEventListener('input', function (e) {
    var target = state.deleteTarget;
    document.getElementById('delete-modal-confirm').disabled =
      !target || e.target.value.trim().toLowerCase() !== target.email.trim().toLowerCase();
  });
  document.getElementById('delete-modal-confirm').addEventListener('click', function () {
    confirmDelete().catch(function (err) { toast(err.message, 'err'); });
  });

  document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      showView(el.getAttribute('data-tab'));
    });
  });

  document.body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-activate],[data-deactivate],[data-grant],[data-cancel],[data-delete]');
    if (!t) return;
    var openId = t.getAttribute('data-open');
    var act = t.getAttribute('data-activate');
    var deact = t.getAttribute('data-deactivate');
    var grant = t.getAttribute('data-grant');
    var cancel = t.getAttribute('data-cancel');
    var del = t.getAttribute('data-delete');
    if (openId) openDetail(openId);
    else if (act) activateUser(act).catch(function (err) { toast(err.message, 'err'); });
    else if (deact) deactivateUser(deact).catch(function (err) { toast(err.message, 'err'); });
    else if (grant) grantPremium(grant).catch(function (err) { toast(err.message, 'err'); });
    else if (cancel) cancelSub(cancel).catch(function (err) { toast(err.message, 'err'); });
    else if (del) openDeleteModal(del, t.getAttribute('data-delete-email') || '');
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

  if (!token()) { window.location.href = '/login'; return; }
  showView('customers');
  loadAll();
})();
</script>
</body>
</html>`;
}
