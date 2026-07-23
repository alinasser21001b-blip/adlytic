export function adminInboxPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>صندوق الدعم — Adlytic</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #100E0D; --surface: #1A1613; --surface-2: #221D19; --border: #322B25;
      --text: #F3EFE7; --text-2: #B8AC9C; --text-3: #746A5C;
      --accent: #D9A759; --accent-2: #E8C07A;
      --success: #34A871; --warning: #C77A1F; --error: #E2604F;
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
      color: var(--text-2); font-size: 14px; font-weight: 600;
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
      justify-content: space-between;
    }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: rgba(217,167,89,0.14); color: var(--accent-2); }
    .nav-count {
      display: inline-flex; align-items: center; justify-content: center; min-width: 20px;
      height: 20px; border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 6px;
    }
    .nav-count.red { background: var(--error); color: #fff; }
    .nav-count.gold { background: rgba(217,167,89,0.2); color: var(--accent-2); }
    .nav-count.muted { background: var(--surface-2); color: var(--text-3); }
    .nav-foot { padding: 12px; border-top: 1px solid var(--border); }
    .main-wrapper { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      height: 60px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; border-bottom: 1px solid var(--border); background: rgba(26,22,19,0.92);
      backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 20;
    }
    .topbar h1 { font-size: 16px; font-weight: 800; }
    .main { display: flex; flex: 1; min-height: 0; }
    .ticket-list {
      width: 380px; flex-shrink: 0; border-left: 1px solid var(--border);
      overflow-y: auto; display: flex; flex-direction: column;
    }
    .ticket-list-header {
      padding: 14px 16px; border-bottom: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 8px;
    }
    .ticket-list-header .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
    .field {
      background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
      padding: 7px 10px; color: var(--text); min-width: 0; font-size: 12.5px;
    }
    .field:focus { outline: none; border-color: rgba(217,167,89,0.55); }
    .ticket-item {
      padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.15s;
    }
    .ticket-item:hover { background: var(--surface-2); }
    .ticket-item.active { background: rgba(217,167,89,0.08); border-right: 3px solid var(--accent); }
    .ticket-item.unread { border-right: 3px solid var(--error); }
    .ticket-subject { font-weight: 700; font-size: 13px; margin-bottom: 4px; line-height: 1.4; }
    .ticket-meta { font-size: 11px; color: var(--text-3); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .thread-pane {
      flex: 1; display: flex; flex-direction: column; min-width: 0;
    }
    .thread-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 15px; }
    .thread-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex;
      justify-content: space-between; align-items: flex-start; gap: 12px;
    }
    .thread-title { font-size: 16px; font-weight: 800; line-height: 1.4; }
    .thread-actions { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
    .thread-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .msg {
      max-width: 85%; padding: 12px 16px; border-radius: 14px; font-size: 13.5px; line-height: 1.7;
      white-space: pre-wrap; word-break: break-word;
    }
    .msg.user { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--border); }
    .msg.admin { align-self: flex-end; background: rgba(217,167,89,0.1); border: 1px solid rgba(217,167,89,0.2); }
    .msg.internal { align-self: flex-end; background: rgba(226,96,79,0.08); border: 1px dashed rgba(226,96,79,0.3); }
    .msg-sender { font-size: 11px; font-weight: 700; color: var(--accent-2); margin-bottom: 4px; }
    .msg-time { font-size: 10px; color: var(--text-3); margin-top: 4px; }
    .msg-label { font-size: 10px; color: var(--error); font-weight: 700; }
    .thread-compose {
      padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: flex-end;
    }
    .compose-area {
      flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
      padding: 10px 14px; color: var(--text); resize: none; min-height: 42px; max-height: 160px;
      font-size: 13.5px; line-height: 1.6;
    }
    .compose-area:focus { outline: none; border-color: rgba(217,167,89,0.55); }
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
    .badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 700; border: 1px solid transparent;
    }
    .badge-ok { background: rgba(52,168,113,0.14); color: var(--success); border-color: rgba(52,168,113,0.3); }
    .badge-warn { background: rgba(199,122,31,0.14); color: var(--warning); border-color: rgba(199,122,31,0.3); }
    .badge-err { background: rgba(226,96,79,0.12); color: var(--error); border-color: rgba(226,96,79,0.3); }
    .badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
    .badge-gold { background: rgba(217,167,89,0.14); color: var(--accent-2); border-color: rgba(217,167,89,0.3); }
    .muted { color: var(--text-3); font-size: 12px; }
    .context-panel {
      width: 280px; flex-shrink: 0; border-right: 1px solid var(--border);
      overflow-y: auto; padding: 16px; display: none;
    }
    .context-panel.open { display: block; }
    .ctx-section { margin-bottom: 14px; }
    .ctx-section h4 { font-size: 11px; font-weight: 800; color: var(--accent-2); margin-bottom: 6px; }
    .ctx-row { font-size: 12px; color: var(--text-2); margin-bottom: 4px; display: flex; justify-content: space-between; }
    .ctx-row .label { color: var(--text-3); }
    .toast {
      position: fixed; bottom: 20px; left: 20px; z-index: 60; padding: 12px 16px; border-radius: 10px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35); display: none; max-width: 360px;
    }
    .toast.show { display: block; }
    .toast.ok { border-color: rgba(52,168,113,0.4); }
    .toast.err { border-color: rgba(226,96,79,0.4); color: #ffb4a8; }
    .check-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }
    @media (max-width: 980px) {
      .sidebar { display: none; }
      .ticket-list { width: 100%; }
      .context-panel { display: none !important; }
    }
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
      <div class="logo-sub">صندوق الدعم · Customer Inbox</div>
    </div>
    <nav class="nav">
      <div class="nav-label">صندوق الوارد</div>
      <a class="nav-item active" data-filter="OPEN">
        <span>تحتاج رد</span>
        <span class="nav-count red" id="cnt-open">0</span>
      </a>
      <a class="nav-item" data-filter="AWAITING_CUSTOMER">
        <span>بانتظار العميل</span>
        <span class="nav-count gold" id="cnt-awaiting">0</span>
      </a>
      <a class="nav-item" data-filter="RESOLVED">
        <span>محلولة</span>
        <span class="nav-count muted" id="cnt-resolved">0</span>
      </a>
      <a class="nav-item" data-filter="CLOSED">
        <span>مغلقة</span>
        <span class="nav-count muted" id="cnt-closed">0</span>
      </a>
      <a class="nav-item" data-filter="URGENT">
        <span>عاجلة</span>
        <span class="nav-count red" id="cnt-urgent">0</span>
      </a>
      <a class="nav-item" data-filter="STARRED">
        <span>مميزة</span>
        <span class="nav-count gold" id="cnt-starred">0</span>
      </a>
      <div class="nav-label">أخرى</div>
      <a class="nav-item" href="/admin">لوحة الإدارة</a>
      <a class="nav-item" href="/admin/observability">مراقبة المنصة</a>
      <a class="nav-item" href="/dashboard">لوحة التحكم</a>
    </nav>
    <div class="nav-foot">
      <div class="muted" id="admin-email">—</div>
    </div>
  </aside>

  <div class="main-wrapper">
    <header class="topbar">
      <h1>صندوق الدعم</h1>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="muted" id="unread-label"></span>
        <button class="btn btn-secondary btn-sm" id="btn-refresh">تحديث</button>
      </div>
    </header>

    <div class="main">
      <div class="ticket-list">
        <div class="ticket-list-header">
          <div class="toolbar">
            <input class="field" id="search-q" placeholder="بحث…" style="flex:1;min-width:120px;" />
            <select class="field" id="filter-category">
              <option value="all">كل الأنواع</option>
              <option value="BUG">خلل</option>
              <option value="FEATURE_REQUEST">اقتراح</option>
              <option value="QUESTION">سؤال</option>
              <option value="PAYMENT">دفع</option>
              <option value="GENERAL">عام</option>
            </select>
          </div>
        </div>
        <div id="ticket-list-body"></div>
      </div>

      <div class="thread-pane" id="thread-pane">
        <div class="thread-empty" id="thread-empty">اختر محادثة من القائمة</div>
        <div id="thread-content" style="display:none;flex:1;display:none;flex-direction:column;">
          <div class="thread-header">
            <div>
              <div class="thread-title" id="thread-title">—</div>
              <div class="muted" id="thread-meta">—</div>
            </div>
            <div class="thread-actions" id="thread-actions"></div>
          </div>
          <div class="thread-body" id="thread-body"></div>
          <div class="thread-compose">
            <textarea class="compose-area" id="compose-input" placeholder="اكتب ردك هنا…" rows="2"></textarea>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label class="check-row"><input type="checkbox" id="compose-internal" /> ملاحظة داخلية</label>
              <button class="btn btn-primary btn-sm" id="btn-send">إرسال</button>
            </div>
          </div>
        </div>
      </div>

      <div class="context-panel" id="context-panel">
        <div id="context-body"></div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  var state = { tickets: [], current: null, currentFilter: 'OPEN' };

  function token() { try { return localStorage.getItem('adlytic_token'); } catch(e) { return null; } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(v) {
    if (!v) return '';
    try { return new Date(v).toLocaleString('ar-u-nu-latn'); } catch(e) { return String(v); }
  }
  function fmtRel(v) {
    if (!v) return '';
    var parsed = new Date(v);
    if (isNaN(parsed.getTime())) return '';
    var d = Date.now() - parsed.getTime();
    if (d < 6e4) return 'الآن';
    if (d < 36e5) return Math.floor(d/6e4) + ' د';
    if (d < 864e5) return Math.floor(d/36e5) + ' س';
    return Math.floor(d/864e5) + ' ي';
  }
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || 'ok');
    setTimeout(function() { el.className = 'toast'; }, 3000);
  }
  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token() || '') },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var data = await res.json().catch(function() { return {}; });
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!res.ok) { var err = new Error(data.error || 'Request failed'); err.status = res.status; throw err; }
    return data;
  }

  var catLabels = { BUG: 'خلل', FEATURE_REQUEST: 'اقتراح', QUESTION: 'سؤال', PAYMENT: 'دفع', GENERAL: 'عام' };
  var statusLabels = { OPEN: 'تحتاج رد', AWAITING_CUSTOMER: 'بانتظار العميل', RESOLVED: 'محلولة', CLOSED: 'مغلقة' };
  var prioLabels = { LOW: 'منخفض', NORMAL: 'عادي', HIGH: 'مرتفع', URGENT: 'عاجل' };
  var prioBadge = { LOW: 'badge-muted', NORMAL: 'badge-muted', HIGH: 'badge-warn', URGENT: 'badge-err' };
  var statusBadge = { OPEN: 'badge-err', AWAITING_CUSTOMER: 'badge-gold', RESOLVED: 'badge-ok', CLOSED: 'badge-muted' };

  async function loadCounts() {
    try {
      var d = await api('/api/admin/support/counts');
      document.getElementById('cnt-open').textContent = d.open || 0;
      document.getElementById('cnt-awaiting').textContent = d.awaiting || 0;
      document.getElementById('cnt-resolved').textContent = d.resolved || 0;
      document.getElementById('cnt-closed').textContent = d.closed || 0;
      document.getElementById('cnt-urgent').textContent = d.urgent || 0;
      document.getElementById('cnt-starred').textContent = d.starred || 0;
      document.getElementById('unread-label').textContent = d.unread ? (d.unread + ' غير مقروءة') : '';
    } catch(e) {}
  }

  async function loadTickets() {
    var filter = state.currentFilter;
    var q = document.getElementById('search-q').value.trim();
    var cat = document.getElementById('filter-category').value;
    var qs = '?take=100';
    if (filter === 'URGENT') qs += '&priority=URGENT';
    else if (filter === 'STARRED') qs += ''; // handled client-side
    else if (filter !== 'all') qs += '&status=' + encodeURIComponent(filter);
    if (q) qs += '&q=' + encodeURIComponent(q);
    if (cat !== 'all') qs += '&category=' + encodeURIComponent(cat);

    try {
      var data = await api('/api/admin/support/tickets' + qs);
      state.tickets = data.tickets || [];
      renderTicketList();
    } catch(e) {
      toast(e.message, 'err');
    }
  }

  function renderTicketList() {
    var el = document.getElementById('ticket-list-body');
    var tickets = state.tickets;
    if (!tickets.length) {
      el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-3);">لا محادثات</div>';
      return;
    }
    el.innerHTML = tickets.map(function(t) {
      var isActive = state.current && state.current.id === t.id;
      var cls = 'ticket-item' + (isActive ? ' active' : '');
      var user = t.user ? (t.user.name || t.user.email) : '—';
      var ws = t.workspace ? t.workspace.name : '—';
      return '<div class="' + cls + '" data-ticket-id="' + esc(t.id) + '">'
        + '<div class="ticket-subject">'
        + (t.isPinned ? '<span style="color:var(--accent);">📌 </span>' : '')
        + (t.isStarred ? '<span style="color:var(--accent);">⭐ </span>' : '')
        + esc(t.subject)
        + '</div>'
        + '<div class="ticket-meta">'
        + '<span class="badge ' + (statusBadge[t.status] || 'badge-muted') + '">' + esc(statusLabels[t.status] || t.status) + '</span>'
        + '<span class="badge ' + (prioBadge[t.priority] || 'badge-muted') + '">' + esc(prioLabels[t.priority] || t.priority) + '</span>'
        + '<span>' + esc(catLabels[t.category] || t.category) + '</span>'
        + '<span>' + esc(user) + '</span>'
        + '<span>' + esc(fmtRel(t.updatedAt)) + '</span>'
        + '<span class="muted">' + (t._count ? t._count.messages : 0) + ' رسالة</span>'
        + '</div></div>';
    }).join('');
  }

  async function openThread(ticketId) {
    try {
      var data = await api('/api/admin/support/tickets/' + encodeURIComponent(ticketId));
      state.current = data.ticket;
      renderThread();
      renderContext();
      renderTicketList();
    } catch(e) {
      toast(e.message, 'err');
    }
  }

  function renderThread() {
    var t = state.current;
    if (!t) return;
    document.getElementById('thread-empty').style.display = 'none';
    var content = document.getElementById('thread-content');
    content.style.display = 'flex';

    document.getElementById('thread-title').textContent = t.subject;
    document.getElementById('thread-meta').innerHTML =
      '<span class="badge ' + (statusBadge[t.status] || 'badge-muted') + '">' + esc(statusLabels[t.status] || t.status) + '</span> · '
      + esc(t.user ? t.user.name : '') + ' · '
      + esc(t.workspace ? t.workspace.name : '') + ' · '
      + esc(fmtDate(t.createdAt));

    var actHtml = '';
    if (t.status !== 'CLOSED') {
      actHtml += '<button class="btn btn-success btn-sm" data-action="resolve">حل</button>';
      actHtml += '<button class="btn btn-danger btn-sm" data-action="close">إغلاق</button>';
    }
    if (t.status === 'CLOSED' || t.status === 'RESOLVED') {
      actHtml += '<button class="btn btn-secondary btn-sm" data-action="reopen">إعادة فتح</button>';
    }
    actHtml += '<button class="btn btn-secondary btn-sm" data-action="pin">' + (t.isPinned ? 'إلغاء التثبيت' : 'تثبيت') + '</button>';
    actHtml += '<button class="btn btn-secondary btn-sm" data-action="star">' + (t.isStarred ? 'إلغاء النجمة' : 'نجمة') + '</button>';
    actHtml += '<select class="field" data-action="priority" style="font-size:12px;padding:5px 8px;">';
    ['LOW','NORMAL','HIGH','URGENT'].forEach(function(p) {
      actHtml += '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + esc(prioLabels[p]) + '</option>';
    });
    actHtml += '</select>';
    actHtml += '<button class="btn btn-secondary btn-sm" data-action="context">سياق</button>';
    document.getElementById('thread-actions').innerHTML = actHtml;

    var body = document.getElementById('thread-body');
    body.innerHTML = (t.messages || []).map(function(m) {
      var cls = 'msg ' + (m.isInternal ? 'internal' : m.senderType === 'ADMIN' ? 'admin' : 'user');
      var senderName = m.sender ? m.sender.name : (m.senderType === 'ADMIN' ? 'المالك' : 'العميل');
      return '<div class="' + cls + '">'
        + '<div class="msg-sender">' + esc(senderName)
        + (m.isInternal ? ' <span class="msg-label">(ملاحظة داخلية)</span>' : '')
        + '</div>'
        + '<div>' + esc(m.content) + '</div>'
        + '<div class="msg-time">' + esc(fmtDate(m.createdAt)) + '</div>'
        + '</div>';
    }).join('');
    body.scrollTop = body.scrollHeight;
  }

  function renderContext() {
    var t = state.current;
    if (!t || !t.contextJson) return;
    var ctx = t.contextJson;
    var el = document.getElementById('context-body');
    var html = '';

    if (ctx.user) {
      html += '<div class="ctx-section"><h4>المستخدم</h4>'
        + '<div class="ctx-row"><span class="label">الاسم</span><span>' + esc(ctx.user.name) + '</span></div>'
        + '<div class="ctx-row"><span class="label">البريد</span><span>' + esc(ctx.user.email) + '</span></div>'
        + '<div class="ctx-row"><span class="label">اللغة</span><span>' + esc(ctx.user.locale) + '</span></div>'
        + '<div class="ctx-row"><span class="label">الحالة</span><span>' + (ctx.user.isActive ? 'نشط' : 'غير نشط') + '</span></div>'
        + '<div class="ctx-row"><span class="label">انضم</span><span>' + esc(fmtDate(ctx.user.joinedAt)) + '</span></div>'
        + '</div>';
    }
    if (ctx.workspace) {
      html += '<div class="ctx-section"><h4>مساحة العمل</h4>'
        + '<div class="ctx-row"><span class="label">الاسم</span><span>' + esc(ctx.workspace.name) + '</span></div>'
        + '<div class="ctx-row"><span class="label">الخطة</span><span>' + esc(ctx.workspace.tier) + '</span></div>'
        + '<div class="ctx-row"><span class="label">الاشتراك</span><span>' + esc(ctx.workspace.subscriptionStatus) + '</span></div>'
        + '<div class="ctx-row"><span class="label">طريقة الدفع</span><span>' + esc(ctx.workspace.paymentMethod || '—') + '</span></div>'
        + '<div class="ctx-row"><span class="label">ينتهي</span><span>' + esc(fmtDate(ctx.workspace.subscriptionExpiresAt)) + '</span></div>'
        + '<div class="ctx-row"><span class="label">الأعضاء</span><span>' + (ctx.workspace.memberCount || 0) + '</span></div>'
        + '<div class="ctx-row"><span class="label">حسابات Meta</span><span>' + (ctx.workspace.adAccountCount || 0) + '</span></div>'
        + '</div>';
    }
    if (ctx.meta) {
      html += '<div class="ctx-section"><h4>Meta</h4>';
      (ctx.meta.connections || []).forEach(function(c) {
        html += '<div class="ctx-row"><span class="label">' + esc(c.businessName || 'اتصال') + '</span><span>' + esc(c.status) + '</span></div>';
      });
      (ctx.meta.adAccounts || []).forEach(function(a) {
        html += '<div class="ctx-row"><span class="label">' + esc(a.name) + '</span><span>' + (a.campaignCount || 0) + ' حملة</span></div>';
        if (a.tokenExpired) html += '<div class="ctx-row"><span class="label" style="color:var(--error);">الرمز منتهي</span></div>';
      });
      html += '</div>';
    }
    if (ctx.activity) {
      html += '<div class="ctx-section"><h4>النشاط</h4>'
        + '<div class="ctx-row"><span class="label">الحملات</span><span>' + (ctx.activity.campaignCount || 0) + '</span></div>';
      if (ctx.activity.recentErrors && ctx.activity.recentErrors.length) {
        html += '<div style="margin-top:6px;"><div class="muted" style="font-weight:700;">آخر الأخطاء</div>';
        ctx.activity.recentErrors.forEach(function(e) {
          html += '<div class="ctx-row" style="color:var(--error);"><span>' + esc(e.error) + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    if (ctx.client && (ctx.client.userAgent || ctx.client.language)) {
      html += '<div class="ctx-section"><h4>المتصفح</h4>'
        + (ctx.client.userAgent ? '<div class="ctx-row" style="word-break:break-all;">' + esc(ctx.client.userAgent) + '</div>' : '')
        + (ctx.client.language ? '<div class="ctx-row"><span class="label">اللغة</span><span>' + esc(ctx.client.language) + '</span></div>' : '')
        + '</div>';
    }

    el.innerHTML = html || '<div class="muted">لا سياق متوفر</div>';
  }

  async function sendReply() {
    if (!state.current) return;
    var input = document.getElementById('compose-input');
    var content = input.value.trim();
    if (!content) return;
    var isInternal = document.getElementById('compose-internal').checked;
    try {
      await api('/api/admin/support/tickets/' + encodeURIComponent(state.current.id) + '/reply', {
        method: 'POST', body: { content: content, isInternal: isInternal },
      });
      input.value = '';
      document.getElementById('compose-internal').checked = false;
      await openThread(state.current.id);
      loadCounts();
    } catch(e) {
      toast(e.message, 'err');
    }
  }

  async function ticketAction(action, val) {
    if (!state.current) return;
    var tid = state.current.id;
    try {
      if (action === 'resolve') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { status: 'RESOLVED' } });
      else if (action === 'close') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { status: 'CLOSED' } });
      else if (action === 'reopen') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { status: 'OPEN' } });
      else if (action === 'pin') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { pin: true } });
      else if (action === 'star') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { star: true } });
      else if (action === 'priority') await api('/api/admin/support/tickets/' + tid, { method: 'PATCH', body: { priority: val } });
      else if (action === 'context') {
        var panel = document.getElementById('context-panel');
        panel.classList.toggle('open');
        return;
      }
      await openThread(tid);
      loadCounts();
      loadTickets();
      toast('تم التحديث', 'ok');
    } catch(e) { toast(e.message, 'err'); }
  }

  // Events
  document.getElementById('btn-refresh').addEventListener('click', function() { loadCounts(); loadTickets(); });
  document.getElementById('btn-send').addEventListener('click', sendReply);
  document.getElementById('compose-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
  });
  document.getElementById('search-q').addEventListener('input', function() { loadTickets(); });
  document.getElementById('filter-category').addEventListener('change', function() { loadTickets(); });

  document.querySelectorAll('.nav-item[data-filter]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('.nav-item[data-filter]').forEach(function(n) { n.classList.remove('active'); });
      el.classList.add('active');
      state.currentFilter = el.getAttribute('data-filter');
      loadTickets();
    });
  });

  document.getElementById('ticket-list-body').addEventListener('click', function(e) {
    var item = e.target.closest('[data-ticket-id]');
    if (item) openThread(item.getAttribute('data-ticket-id'));
  });

  document.getElementById('thread-actions').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (btn) {
      var action = btn.getAttribute('data-action');
      var val = btn.tagName === 'SELECT' ? btn.value : undefined;
      ticketAction(action, val);
    }
  });
  document.getElementById('thread-actions').addEventListener('change', function(e) {
    var sel = e.target.closest('[data-action="priority"]');
    if (sel) ticketAction('priority', sel.value);
  });

  // Init — admin guard: only platform admins may see this page. The admin
  // shell (.app) stays display:none and a neutral "checking access" gate
  // covers the screen until /api/auth/me confirms isPlatformAdmin, so a
  // customer never sees any admin structure — not even for a frame — before
  // being redirected. Use location.replace so the blocked URL is not left in
  // history for a back-button return.
  if (!token()) { window.location.replace('/login'); return; }
  api('/api/auth/me').then(function(me) {
    if (!me || !me.isPlatformAdmin) {
      window.location.replace('/support');
      return;
    }
    document.getElementById('admin-email').textContent = me.email || '';
    var gate = document.getElementById('access-gate');
    if (gate) gate.classList.add('hidden');
    document.querySelector('.app').style.display = 'flex';
    loadCounts();
    loadTickets();
    var pollId = setInterval(function() { loadCounts(); loadTickets(); }, 15000);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        clearInterval(pollId);
        pollId = 0;
      } else if (!pollId) {
        loadCounts();
        loadTickets();
        pollId = setInterval(function() { loadCounts(); loadTickets(); }, 15000);
      }
    });
  }).catch(function(err) {
    // 401 already redirected inside api(); anything else → send home, never
    // leave the admin gate spinning or reveal the shell.
    if (!err || err.message !== 'Unauthorized') window.location.replace('/support');
  });
})();
</script>
</body>
</html>`;
}
