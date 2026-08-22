// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminInboxPage.ts
//
//  المحادثة الكاملة وسياق الزبون وأدوات الفرز — التفاصيل التي تكمّل «صندوق الدعم».
//
//  ── Why it renders inside the Control Plane shell ─────────────────────
//
//  This page was reachable from the Control Plane and drew its own sidebar,
//  topbar and header. An operator who followed that link left one product and
//  arrived in another — same platform, different application. The navigation
//  audit named it: shell lost, context bar emptied, no active nav item.
//
//  Nothing it renders was removed. The detail it uniquely owns is exactly why
//  this is a WRAP and not a redirect: deleting the route would delete the
//  detail. What is gone is the chrome it duplicated — navigation, context,
//  the command palette and operator identity belong to the shell, here as
//  everywhere else.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
/* The status filter strip that replaced the legacy sidebar's filter nav. */
.filter-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                margin-bottom: 12px; }
.filter-strip .chip { display: inline-flex; align-items: center; gap: 7px;
                      padding: 5px 11px; border-radius: 999px; cursor: pointer;
                      border: 1px solid var(--border); background: var(--surface);
                      color: var(--text-2); font-size: 12.5px; white-space: nowrap; }
.filter-strip .chip:hover { border-color: var(--text-3); color: var(--text); }
.filter-strip .chip.active { background: var(--surface-2); color: var(--text);
                             border-color: var(--text-3); font-weight: 600; }
.filter-strip .cnt { font-family: var(--font-mono); font-size: 11.5px;
                     direction: ltr; color: var(--text-3); }
.filter-strip .cnt.red { color: var(--error); }
.filter-strip .cnt.gold { color: var(--warning); }
.filter-strip .strip-spacer { flex: 1; }
/* The page was authored against --font; the system calls it --font-body. */
    :root { --font: var(--font-body); }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: none; background: none; }
.access-gate.hidden { display: none; }
@keyframes gate-spin { to { transform: rotate(360deg); }
}
.nav-item.active { background: var(--accent-dim); color: var(--accent-2); }
.nav-count {
      display: inline-flex; align-items: center; justify-content: center; min-width: 20px;
      height: 20px; border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 6px;
    }
.nav-count.red { background: var(--error); color: #fff; }
.nav-count.gold { background: var(--accent-dim); color: var(--accent-2); }
.nav-count.muted { background: var(--surface-2); color: var(--text-3); }
/* One card holding the three panes, sized to the content area rather than to
   the sum of its children — the inbox is a workspace, not a document. */
.inbox-split {
      display: flex; align-items: stretch;
      height: calc(100vh - var(--top-h) - var(--ctx-h) - 210px);
      min-height: 460px;
      border: 1px solid var(--border); border-radius: 12px;
      background: var(--surface); overflow: hidden;
    }
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
      background: var(--surface-2); border: 1px solid var(--border-control); border-radius: 9px;
      padding: 7px 10px; color: var(--text); min-width: 0; font-size: 12.5px;
    }
.field:focus { outline: none; border-color: var(--accent); }
.ticket-item {
      padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.15s;
    }
.ticket-item:hover { background: var(--surface-2); }
.ticket-item.active { background: var(--accent-dim); border-right: 3px solid var(--accent); }
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
.msg.admin { align-self: flex-end; background: var(--accent-dim); border: 1px solid var(--accent-dim); }
.msg.internal { align-self: flex-end; background: var(--error-dim); border: 1px dashed var(--error); }
.msg-sender { font-size: 11px; font-weight: 700; color: var(--accent-2); margin-bottom: 4px; }
.msg-time { font-size: 10px; color: var(--text-3); margin-top: 4px; }
.msg-label { font-size: 10px; color: var(--error); font-weight: 700; }
.thread-compose {
      padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: flex-end;
    }
.compose-area {
      flex: 1; background: var(--surface-2); border: 1px solid var(--border-control); border-radius: 12px;
      padding: 10px 14px; color: var(--text); resize: none; min-height: 42px; max-height: 160px;
      font-size: 13.5px; line-height: 1.6;
    }
.compose-area:focus { outline: none; border-color: var(--accent); }
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
.badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 700; border: 1px solid transparent;
    }
.badge-ok { background: var(--success-dim); color: var(--success); border-color: var(--success); }
.badge-warn { background: var(--warning-dim); color: var(--warning); border-color: var(--warning); }
.badge-err { background: var(--error-dim); color: var(--error); border-color: var(--error); }
.badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
.badge-gold { background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent); }
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
      box-shadow: none; display: none; max-width: 360px;
    }
.toast.show { display: block; }
.toast.ok { border-color: var(--success); }
.toast.err { border-color: var(--error); color: var(--error); }
.check-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }
@media (max-width: 1024px) {
      .sidebar { display: none; }
.ticket-list { width: 100%; }
.context-panel { display: none !important; }
}`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">صندوق الدعم التفصيلي</div>
      <div class="phead-s">المحادثة الكاملة وسياق الزبون وأدوات الفرز — التفاصيل التي تكمّل «صندوق الدعم».</div>
    </div>
    <div class="phead-actions"><a class="btn" href="/admin/support">صندوق الدعم</a></div>
  </div>
`;

const BODY = `
      <!--
        Ticket status filters. These were nav items in the legacy sidebar, so
        the first wrap pass removed them along with it and took six live counts
        with them. They are how this surface is worked — rebuilt here as a
        filter strip rather than deleted to make the route tidier.
      -->
      <div class="filter-strip" id="status-filters">
        <a class="chip active" data-filter="OPEN"><span>تحتاج رد</span><b class="cnt red" id="cnt-open">0</b></a>
        <a class="chip" data-filter="AWAITING_CUSTOMER"><span>بانتظار العميل</span><b class="cnt gold" id="cnt-awaiting">0</b></a>
        <a class="chip" data-filter="URGENT"><span>عاجلة</span><b class="cnt red" id="cnt-urgent">0</b></a>
        <a class="chip" data-filter="STARRED"><span>مميزة</span><b class="cnt gold" id="cnt-starred">0</b></a>
        <a class="chip" data-filter="RESOLVED"><span>محلولة</span><b class="cnt" id="cnt-resolved">0</b></a>
        <a class="chip" data-filter="CLOSED"><span>مغلقة</span><b class="cnt" id="cnt-closed">0</b></a>
        <span class="strip-spacer"></span>
        <span class="muted" id="unread-label"></span>
        <button class="btn btn-sm" id="btn-refresh">تحديث</button>
      </div>

      <!--
        The three panes were laid out by the legacy .main; inside the shell
        they had no flex parent and no height, so the list floated in a tall
        empty band. This container is that missing parent.
      -->
      <div class="inbox-split">
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

  <!-- Every write on this surface reports through the toast. It sat outside
       .main before the move into the shell, which is why the wrap lost it and
       toast() has been writing to null ever since. -->
  <div class="toast" id="toast"></div>`;

const SCRIPT = `
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
  var rf = document.getElementById('btn-refresh');
  if (rf) rf.addEventListener('click', function() { loadCounts(); loadTickets(); });
  document.getElementById('btn-send').addEventListener('click', sendReply);
  document.getElementById('compose-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
  });
  document.getElementById('search-q').addEventListener('input', function() { loadTickets(); });
  document.getElementById('filter-category').addEventListener('change', function() { loadTickets(); });

  document.querySelectorAll('#status-filters [data-filter]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('#status-filters [data-filter]').forEach(function(n) { n.classList.remove('active'); });
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

  // The client-side access gate is gone, and deliberately so. It reached for
  // a chrome (.app, #access-gate, #admin-email) this page no longer owns — the
  // Control Plane shell does — so it threw, the .catch() below treated that as
  // a failed authorisation check, and the page redirected itself away instead
  // of loading. Authorisation is the route's job: GET /admin/inbox resolves the
  // session server-side and redirects a non-admin to /dashboard.
  if (!token()) { window.location.replace('/login'); return; }
  (function() {
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
  })();
})();
`;

export function adminInboxPage(): string {
  return adminShell({
    active: 'inbox',
    title: 'صندوق الدعم التفصيلي',
    subtitle: 'المحادثة الكاملة وسياق الزبون وأدوات الفرز — التفاصيل التي تكمّل «صندوق الدعم».',
    css: CSS,
    header: HEADER,
    body: BODY,
    script: SCRIPT,
    commands: [
      { label: 'صندوق الدعم', href: '/admin/support', hint: 'الدعم' },
    ],
  });
}
