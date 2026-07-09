// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminConsolePage.ts
//
//  Platform-owner revenue console (Arabic RTL): subscriptions, manual
//  Premium activation/cancel, and payment ledger.
//  Gated by /api/admin/* + PLATFORM_ADMIN_EMAILS.
// ════════════════════════════════════════════════════════════════════════

export function adminConsolePage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إدارة الإيرادات — Adlytic</title>
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
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 12px; font-weight: 700; color: var(--text-2); }
    .form-group.full { grid-column: 1 / -1; }
    .hint { font-size: 12px; color: var(--text-3); line-height: 1.5; }
    .status-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .toast {
      position: fixed; bottom: 20px; left: 20px; z-index: 60; padding: 12px 16px; border-radius: 10px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35); display: none; max-width: 360px;
    }
    .toast.show { display: block; }
    .toast.ok { border-color: rgba(52,168,113,0.4); }
    .toast.err { border-color: rgba(226,96,79,0.4); color: #ffb4a8; }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="logo">
      <div class="logo-brand">Ad<span>lytic</span></div>
      <div class="logo-sub">لوحة المالك · الإيرادات</div>
    </div>
    <nav class="nav">
      <div class="nav-label">الإيرادات</div>
      <a class="nav-item active" href="#settings" data-tab="settings">إعدادات التسعير</a>
      <a class="nav-item" href="#subscriptions" data-tab="subscriptions">الاشتراكات</a>
      <a class="nav-item" href="#ledger" data-tab="ledger">سجل المدفوعات</a>
      <div class="nav-label">أخرى</div>
      <a class="nav-item" href="/dashboard">لوحة التحكم</a>
    </nav>
    <div class="nav-foot">
      <div class="muted" id="admin-email">—</div>
      <button class="btn btn-secondary btn-sm" id="btn-logout" style="margin-top:8px;width:100%;">تسجيل الخروج</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <h1 id="page-heading">إعدادات التسعير</h1>
      <div class="topbar-actions">
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث</button>
      </div>
    </header>

    <main class="content">
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <div class="kpi-grid" id="kpi-grid">
        <div class="kpi"><div class="kpi-label">اشتراكات Premium نشطة</div><div class="kpi-value gold" id="kpi-premium">—</div></div>
        <div class="kpi"><div class="kpi-label">مساحات العمل</div><div class="kpi-value" id="kpi-workspaces">—</div></div>
        <div class="kpi"><div class="kpi-label">أحداث دفع (7 أيام)</div><div class="kpi-value" id="kpi-payments">—</div></div>
        <div class="kpi"><div class="kpi-label">زبائن نشطون</div><div class="kpi-value" id="kpi-active">—</div></div>
      </div>

      <section class="panel view" id="view-settings">
        <div class="panel-head">
          <div>
            <div class="panel-title">إعدادات الإيرادات</div>
            <div class="panel-sub">سعر Premium الظاهر للزبائن · رقم واتساب للدفع اليدوي</div>
          </div>
        </div>
        <div class="panel-body">
          <form id="revenue-form" class="form-grid">
            <div class="form-group">
              <label>سعر Premium</label>
              <input class="field" name="premiumPriceAmount" type="number" min="0" max="100000" step="0.01" required />
            </div>
            <div class="form-group">
              <label>العملة</label>
              <select class="field" name="premiumPriceCurrency">
                <option value="USD">USD</option>
                <option value="IQD">IQD</option>
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div class="form-group">
              <label>الفترة</label>
              <select class="field" name="premiumPricePeriod">
                <option value="month">شهري</option>
                <option value="year">سنوي</option>
              </select>
            </div>
            <div class="form-group">
              <label>رقم واتساب الدعم</label>
              <input class="field" name="supportWhatsappNumber" placeholder="+9647XXXXXXXX" />
            </div>
            <div class="form-group full">
              <div class="hint" id="cta-preview">معاينة زر الترقية: —</div>
              <div class="status-row">
                <span class="badge badge-muted" id="badge-stripe">Stripe: —</span>
                <span class="badge badge-muted" id="badge-wa">واتساب: —</span>
              </div>
              <div class="hint" style="margin-top:10px;">
                سعر العرض يظهر في صفحة إعدادات الزبون. خصم Stripe الفعلي يبقى مضبوطاً عبر
                <code>STRIPE_PREMIUM_PRICE_ID</code> في بيئة السيرفر.
              </div>
            </div>
            <div class="form-group full actions">
              <button class="btn btn-primary" type="submit" id="revenue-save">حفظ إعدادات الإيرادات</button>
            </div>
          </form>
        </div>
      </section>

      <section class="panel view" id="view-subscriptions" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">الاشتراكات</div>
            <div class="panel-sub">تفعيل يدوي · إلغاء · حالة Stripe / WhatsApp</div>
          </div>
          <div class="toolbar">
            <input class="field field-sm" id="search-q" placeholder="بحث بالمساحة أو المالك…" style="min-width:220px;" />
            <select class="field field-sm" id="filter-tier">
              <option value="all">كل الخطط</option>
              <option value="PREMIUM">Premium</option>
              <option value="FREE">مجاني</option>
            </select>
            <select class="field field-sm" id="filter-status">
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

<div class="toast" id="toast"></div>

<script>
(function () {
  var state = { subscriptions: [], events: [], overview: null, settings: null };

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
      settings: ['view-settings', 'إعدادات التسعير'],
      subscriptions: ['view-subscriptions', 'الاشتراكات'],
      ledger: ['view-ledger', 'سجل المدفوعات'],
    };
    var conf = map[name] || map.settings;
    document.getElementById(conf[0]).style.display = '';
    document.getElementById('page-heading').textContent = conf[1];
  }

  function tierBadge(tier, subStatus) {
    if (tier === 'PREMIUM' && subStatus === 'ACTIVE') {
      return '<span class="badge badge-gold">Premium</span>';
    }
    if (subStatus === 'CANCELED') return '<span class="badge badge-err">ملغى</span>';
    if (subStatus === 'PAST_DUE') return '<span class="badge badge-warn">متأخر</span>';
    if (tier === 'PREMIUM') return '<span class="badge badge-warn">Premium · غير نشط</span>';
    return '<span class="badge badge-muted">مجاني</span>';
  }

  function payMethodLabel(m) {
    if (m === 'STRIPE_CARD') return 'Stripe';
    if (m === 'WHATSAPP_MANUAL') return 'واتساب / يدوي';
    return '—';
  }

  function renderOverview(o) {
    if (!o) return;
    document.getElementById('kpi-premium').textContent = o.premiumActive;
    document.getElementById('kpi-workspaces').textContent = o.workspacesTotal;
    document.getElementById('kpi-payments').textContent = o.paymentEvents7d;
    document.getElementById('kpi-active').textContent = o.usersActive;
  }

  function fillRevenueForm(payload) {
    var s = (payload && payload.settings) || {};
    var form = document.getElementById('revenue-form');
    form.premiumPriceAmount.value = s.premiumPriceAmount != null ? s.premiumPriceAmount : 10;
    form.premiumPriceCurrency.value = s.premiumPriceCurrency || 'USD';
    form.premiumPricePeriod.value = s.premiumPricePeriod || 'month';
    form.supportWhatsappNumber.value = s.supportWhatsappNumber || '';
    document.getElementById('cta-preview').textContent = 'معاينة زر الترقية: ' + (payload.ctaLabel || '—');
    var stripeBadge = document.getElementById('badge-stripe');
    stripeBadge.textContent = s.stripeConfigured ? 'Stripe: مفعّل' : 'Stripe: غير مضبوط';
    stripeBadge.className = 'badge ' + (s.stripeConfigured ? 'badge-ok' : 'badge-warn');
    var waBadge = document.getElementById('badge-wa');
    waBadge.textContent = s.whatsappConfigured ? 'واتساب: مفعّل' : 'واتساب: غير مضبوط';
    waBadge.className = 'badge ' + (s.whatsappConfigured ? 'badge-ok' : 'badge-warn');
  }

  function filteredSubscriptions() {
    var q = (document.getElementById('search-q').value || '').trim().toLowerCase();
    var tier = document.getElementById('filter-tier').value;
    var status = document.getElementById('filter-status').value;
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
        + '<td>' + tierBadge(w.tier, w.subscriptionStatus) + '</td>'
        + '<td><span class="badge badge-muted">' + esc(w.subscriptionStatus) + '</span></td>'
        + '<td class="muted">' + esc(payMethodLabel(w.paymentMethod)) + '</td>'
        + '<td class="muted">' + esc(fmtShort(w.subscriptionExpiresAt)) + '</td>'
        + '<td><div class="actions">'
        +   '<button class="btn btn-success btn-sm" data-grant="' + esc(w.id) + '">تفعيل Premium</button>'
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

      var results = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/subscriptions?take=100'),
        api('/api/admin/payment-events?take=50'),
        api('/api/admin/revenue-settings'),
      ]);
      state.overview = results[0];
      state.subscriptions = results[1].subscriptions || [];
      state.events = results[2].events || [];
      state.settings = results[3];
      renderOverview(state.overview);
      renderSubscriptions();
      renderLedger(state.events);
      fillRevenueForm(state.settings);
    } catch (e) {
      gate.style.display = '';
      if (e.status === 403 || e.status === 503) {
        gate.textContent = e.message || 'غير مصرح — تأكد من PLATFORM_ADMIN_EMAILS.';
      } else {
        gate.textContent = e.message || 'تعذّر تحميل لوحة الإيرادات.';
      }
    }
  }

  async function grantPremium(workspaceId) {
    var days = prompt('مدة الاشتراك بالأيام؟', '30');
    if (!days) return;
    var n = Math.max(1, Math.min(730, Number(days) || 30));
    var expiresAt = new Date(Date.now() + n * 864e5).toISOString();
    var note = prompt('ملاحظة (اختياري):', 'تفعيل يدوي من لوحة الإيرادات') || '';
    await api('/api/admin/subscriptions/activate-manual', {
      method: 'POST',
      body: { workspaceId: workspaceId, tier: 'PREMIUM', expiresAt: expiresAt, note: note },
    });
    toast('تم تفعيل Premium', 'ok');
    await loadAll();
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
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', function () { loadAll(); });
  document.getElementById('search-q').addEventListener('input', function () { renderSubscriptions(); });
  document.getElementById('filter-tier').addEventListener('change', function () { renderSubscriptions(); });
  document.getElementById('filter-status').addEventListener('change', function () { renderSubscriptions(); });

  document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      showView(el.getAttribute('data-tab'));
    });
  });

  document.getElementById('revenue-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var btn = document.getElementById('revenue-save');
    btn.disabled = true;
    try {
      var res = await api('/api/admin/revenue-settings', {
        method: 'PUT',
        body: {
          premiumPriceAmount: Number(fd.get('premiumPriceAmount')),
          premiumPriceCurrency: fd.get('premiumPriceCurrency'),
          premiumPricePeriod: fd.get('premiumPricePeriod'),
          supportWhatsappNumber: String(fd.get('supportWhatsappNumber') || '').trim() || null,
        },
      });
      state.settings = res;
      fillRevenueForm(res);
      toast('تم حفظ إعدادات الإيرادات', 'ok');
    } catch (err) {
      toast(err.message || 'فشل الحفظ', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-grant],[data-cancel]');
    if (!t) return;
    var grant = t.getAttribute('data-grant');
    var cancel = t.getAttribute('data-cancel');
    if (grant) grantPremium(grant).catch(function (err) { toast(err.message, 'err'); });
    else if (cancel) cancelSub(cancel).catch(function (err) { toast(err.message, 'err'); });
  });

  if (!token()) { window.location.href = '/login'; return; }
  showView('settings');
  loadAll();
})();
</script>
</body>
</html>`;
}
