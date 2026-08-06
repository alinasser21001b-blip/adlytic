// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/addClientPage.ts
//
//  Guided "Add a Client" Partner-Access onboarding (Arabic RTL, operator-only).
//  Walks the platform owner through the Meta Partner Access / System User flow:
//  request access → client approves in Business Manager → assign to the System
//  User → link to Adlytic. Backed by the read-only admin endpoints
//  /api/admin/meta/discover-accounts and /api/admin/meta/check-account, with
//  each ad account's currency surfaced prominently. Gated by requirePlatformAdmin.
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
    .steps { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (max-width: 760px) { .steps { grid-template-columns: 1fr; } .sidebar { display: none; } }
    .step {
      border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
      background: var(--surface); display: flex; gap: 12px; align-items: flex-start;
    }
    .step-num {
      flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;
      background: rgba(217,167,89,0.14); color: var(--accent-2); border: 1px solid rgba(217,167,89,0.3);
    }
    .step-title { font-weight: 800; font-size: 14px; margin-bottom: 4px; }
    .step-desc { color: var(--text-2); font-size: 12.5px; line-height: 1.7; }
    .field {
      background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
      padding: 9px 12px; color: var(--text); min-width: 0;
    }
    .field:focus { outline: none; border-color: rgba(217,167,89,0.55); }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .check-result {
      margin-top: 14px; border-radius: 10px; padding: 14px 16px; font-size: 13.5px;
      display: none; line-height: 1.8;
    }
    .check-result.show { display: block; }
    .check-result.ok { border: 1px solid rgba(52,168,113,0.4); background: rgba(52,168,113,0.08); color: var(--success); }
    .check-result.warn { border: 1px solid rgba(199,122,31,0.4); background: rgba(199,122,31,0.08); color: var(--warning); }
    .check-result.err { border: 1px solid rgba(226,96,79,0.4); background: rgba(226,96,79,0.08); color: #ffb4a8; }
    .cur-chip {
      display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px;
      font-size: 13px; font-weight: 800; border: 1px solid rgba(217,167,89,0.35);
      background: rgba(217,167,89,0.14); color: var(--accent-2); margin: 0 4px;
    }
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
      font-size: 11px; font-weight: 700; border: 1px solid transparent;
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
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث القائمة</button>
      </div>
    </header>

    <main class="content">
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <div class="intro">
        نربط حسابات عملائك الإعلانية على Meta عبر نظام <strong>الوصول كشريك (Partner Access)</strong> ومستخدم النظام (System User):
        تطلب أنت الوصول لحساب العميل الإعلاني، يوافق العميل من مدير الأعمال الخاص به، ثم تُعيّن الحساب لمستخدم النظام، فيصبح الحساب مرئياً للمنصة وجاهزاً للربط. تتبّع الخطوات أدناه وتحقّق من ظهور الحساب مباشرةً.
      </div>

      <!-- 4-step checklist -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">خطوات ربط حساب عميل جديد</div>
            <div class="panel-sub">أربع خطوات — من طلب الوصول حتى الربط بالمنصة</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="steps">
            <div class="step">
              <div class="step-num">1</div>
              <div>
                <div class="step-title">اطلب الوصول لحساب العميل الإعلاني</div>
                <div class="step-desc">من إعدادات الأعمال في Meta، أدخل معرّف حساب العميل الإعلاني واطلب الوصول إليه كشريك. استخدم الزر أدناه لفتح الصفحة مباشرةً.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-num">2</div>
              <div>
                <div class="step-title">العميل يوافق من Business Manager حقّه</div>
                <div class="step-desc">يستلم العميل طلب الوصول ويوافق عليه من مدير الأعمال (Business Manager) الخاص به. لا يمكنك المتابعة قبل موافقته.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-num">3</div>
              <div>
                <div class="step-title">عيّن الحساب لمستخدم النظام</div>
                <div class="step-desc">بعد الموافقة، عيّن حساب العميل الإعلاني لمستخدم النظام (System User) الخاص بالمنصة مع صلاحية الإدارة أو التحليل.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-num">4</div>
              <div>
                <div class="step-title">اربطه بالمنصة</div>
                <div class="step-desc">تحقّق من ظهور الحساب أدناه — عند ظهوره يصبح مرئياً لتوكن مستخدم النظام وجاهزاً لإسناده لمساحة عمل العميل داخل المنصة.</div>
              </div>
            </div>
          </div>

          <div style="margin-top:18px;">
            <a class="btn btn-primary" href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noopener noreferrer">فتح إعدادات حسابات Meta الإعلانية ↗</a>
            <div class="muted" style="margin-top:8px;line-height:1.7;">
              في تلك الصفحة اختر «طلب الوصول» أو «إضافة حساب إعلاني»، ثم الصق معرّف حساب العميل الإعلاني (مثل <span class="mono">act_1234567890</span> أو الأرقام فقط).
            </div>
          </div>
        </div>
      </section>

      <!-- Check status -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">تحقّق من حالة حساب</div>
            <div class="panel-sub">ألصق معرّف حساب العميل الإعلاني لمعرفة إن كان قد ظهر لمستخدم النظام</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <input class="field mono" id="check-input" placeholder="act_1234567890 أو 1234567890" style="min-width:280px;flex:1;" />
            <button class="btn btn-primary" id="btn-check">تحقق من الحالة</button>
          </div>
          <div class="check-result" id="check-result"></div>
        </div>
      </section>

      <!-- Discovered accounts -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">الحسابات المكتشفة</div>
            <div class="panel-sub" id="discover-sub">الحسابات المرئية حالياً لتوكن مستخدم النظام</div>
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
  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    window.location.href = '/login';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

  // ── Check a single account's visibility ──────────────────────────────────
  async function checkAccount() {
    var input = document.getElementById('check-input');
    var box = document.getElementById('check-result');
    var raw = (input.value || '').trim();
    box.className = 'check-result';
    if (!raw) {
      box.className = 'check-result show warn';
      box.textContent = 'أدخل معرّف حساب إعلاني أولاً.';
      return;
    }
    var btn = document.getElementById('btn-check');
    btn.disabled = true;
    box.className = 'check-result show';
    box.style.borderColor = 'var(--border)';
    box.style.color = 'var(--text-2)';
    box.textContent = 'جارٍ التحقق…';
    try {
      var qs = '?adAccountId=' + encodeURIComponent(raw);
      var res = await api('/api/admin/meta/check-account' + qs);
      box.style.borderColor = '';
      box.style.color = '';
      if (res.configured === false) {
        box.className = 'check-result show err';
        box.innerHTML = 'مستخدم النظام غير مُهيّأ على الخادم: ' + esc(res.reason || 'META_SYSTEM_USER_TOKEN غير مضبوط.');
        return;
      }
      if (res.error) {
        box.className = 'check-result show err';
        box.innerHTML = 'تعذّر الاتصال بـ Meta: ' + esc(res.error);
        return;
      }
      if (res.visible && res.account) {
        box.className = 'check-result show ok';
        box.innerHTML = '✓ ظهر الحساب لمستخدم النظام — <strong>' + esc(res.account.name) + '</strong>'
          + '<span class="cur-chip">' + esc(currencyLabel(res.account.currency)) + '</span>'
          + '<div class="muted mono" style="margin-top:6px;">' + esc(res.account.id) + '</div>';
      } else {
        box.className = 'check-result show warn';
        box.textContent = 'لم يظهر بعد — تأكد من الموافقة والتعيين.';
      }
    } catch (e) {
      box.style.borderColor = '';
      box.style.color = '';
      if (e.status === 401 || e.status === 403) {
        box.className = 'check-result show err';
        box.textContent = 'غير مصرّح.';
      } else {
        box.className = 'check-result show err';
        box.textContent = e.message || 'تعذّر التحقق.';
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ── Discover all visible accounts ────────────────────────────────────────
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
        + '</tr>';
    }).join('');
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
      if (e.status === 401 || e.status === 403) {
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
      if (e && (e.status === 401 || e.status === 403)) {
        if (g) g.innerHTML = '<div style="max-width:320px;line-height:1.8;">غير مصرّح. <a href="/login" style="color:var(--accent);text-decoration:underline;">تسجيل الدخول</a></div>';
        return false;
      }
      if (g) g.innerHTML = '<div style="max-width:320px;line-height:1.8;">تعذّر التحقق من الصلاحية. تحقق من اتصالك ثم <a href="javascript:location.reload()" style="color:var(--accent);text-decoration:underline;">أعد المحاولة</a>.</div>';
      return false;
    }
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', function () { loadDiscover(); });
  document.getElementById('btn-check').addEventListener('click', function () { checkAccount(); });
  document.getElementById('check-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') checkAccount();
  });

  if (!token()) { window.location.replace('/login'); return; }
  ensureAdmin().then(function (ok) {
    if (!ok) return;
    loadDiscover();
  });
})();
</script>
</body>
</html>`;
}
