// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/supportWorkspacePage.ts
//
//  SUPPORT — /admin/support. Who needs help, and what is unresolved.
//
//  ── What changed, and what deliberately did not ───────────────────────
//
//  The backend did not change. Every route here — counts, list, thread,
//  reply, triage — is the one `/admin/inbox` already called, and no messaging
//  behaviour was touched: rewriting a working support pipeline because the
//  page around it was being restyled would be risk with no return.
//
//  What changed is the frame. The inbox used to be its own application with
//  its own chrome, so an operator handling a ticket lost the platform context
//  that usually explains it. Here it renders in the Control Plane shell, so
//  the environment, the build and the attention centre stay one glance away,
//  and the customer's workspace is shown beside their message.
//
//  Filters, unread and urgent state, and empty states are the improvements —
//  each is a rendering of a field the API already returns.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  /* A mail client fills the screen even with two messages. The previous
     layout sized to content, so an inbox with a short list left two-thirds of
     the viewport as background — measured at 30% content occupancy. */
  .inbox { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 14px;
           align-items: stretch; min-height: calc(100vh - 250px); }
  .inbox > .card { display: flex; flex-direction: column; min-height: 0; }
  .inbox > .card > .card-b, .inbox .pane { overflow-y: auto; flex: 1; min-height: 0; }
  @media (max-width: 940px) { .inbox { grid-template-columns: 1fr; min-height: 0; } }
  .tk { border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; margin-bottom: 7px;
        cursor: pointer; transition: var(--transition); }
  .tk:hover { background: var(--surface-2); }
  .tk.sel { border-color: var(--accent); background: var(--accent-dim); }
  .tk-s { font-size: 12.5px; font-weight: 700; }
  .tk-m { font-size: 10.5px; color: var(--text-3); margin-top: 3px; }
  .tk.urgent { border-inline-start: 3px solid var(--error); }
  .tk.unread .tk-s::after { content: '●'; color: var(--accent); font-size: 8px; vertical-align: super;
                            margin-inline-start: 5px; }
  .msg { border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; margin-bottom: 8px; }
  .msg.staff { background: var(--accent-dim); border-color: var(--accent); }
  .msg-w { font-size: 10.5px; color: var(--text-3); margin-bottom: 4px; }
  .inp, textarea.inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
    border-radius: 7px; padding: 6px 9px; font-size: 12px; font-family: inherit; width: 100%; }
  .bar { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; margin-bottom: 9px; }
  /* An empty pane that is 750px tall and holds one line reads as a rendering
     bug. It gets real guidance, centred in the space it actually occupies. */
  .empty-pane { height: 100%; display: flex; flex-direction: column; justify-content: center;
                align-items: center; gap: 9px; padding: 40px 34px; text-align: center; }
  .empty-pane-t { font-size: 15px; font-weight: 700; color: var(--text-2); }
  .empty-pane-w { font-size: 12.5px; color: var(--text-3); max-width: 46ch; line-height: 1.7; }
`;

const BODY = `
  <div class="bar">
    <select class="inp" id="f-status" style="width:auto;">
      <option value="">كل الحالات</option><option value="OPEN">مفتوحة</option>
      <option value="PENDING">قيد المتابعة</option><option value="CLOSED">مغلقة</option>
    </select>
    <select class="inp" id="f-priority" style="width:auto;">
      <option value="">كل الأولويات</option><option value="URGENT">عاجل</option>
      <option value="HIGH">مرتفع</option><option value="NORMAL">عادي</option><option value="LOW">منخفض</option>
    </select>
    <button class="btn" id="reload">حدّث</button>
    <span class="muted" id="counts"></span>
    <span style="flex:1"></span>
    <a class="btn" href="/admin/inbox">الصندوق الكلاسيكي</a>
  </div>

  <div class="inbox">
    <div class="card">
      <div class="card-h"><div class="h2">التذاكر</div><div class="sec-n" id="tk-n"></div></div>
      <div class="card-b pane" id="list"><div class="skel"></div></div>
    </div>
    <div class="card">
      <div class="card-h"><div class="h2" id="th-subject">لم تُختَر تذكرة</div>
        <div id="th-actions"></div></div>
      <div class="muted" id="th-context" style="padding:0 14px;"></div>
      <div class="pane" id="thread">
        <div class="empty-pane">
          <div class="empty-pane-t">لم تُختَر تذكرة</div>
          <div class="empty-pane-w">اختر تذكرة من القائمة لعرض المحادثة كاملة، مع بريد الزبون
            ومساحة عمله وحالة التذكرة وأولويتها — قبل أن تردّ.</div>
          <div class="empty-pane-w">المرشّحات في الأعلى تحصر القائمة بالحالة أو الأولوية.</div>
        </div>
      </div>
      <div id="reply-box" style="display:none;margin-top:10px;">
        <textarea class="inp" id="reply" rows="3" placeholder="اكتب رداً…"></textarea>
        <div style="margin-top:7px;"><button class="btn btn-primary" id="send">أرسل الرد</button></div>
      </div>
    </div>
  </div>
`;

const SCRIPT = `
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var current = null;

  window.adminFetch('/api/admin/support/counts').then(function (c) {
    var bits = [];
    if (c.open != null) bits.push(c.open + ' مفتوحة');
    if (c.urgent != null) bits.push(c.urgent + ' عاجلة');
    if (c.unread != null) bits.push(c.unread + ' غير مقروءة');
    document.getElementById('counts').textContent = bits.join(' · ');
  }).catch(function () { /* counts are a convenience; the list is the truth */ });

  function loadList() {
    var st = document.getElementById('f-status').value;
    var pr = document.getElementById('f-priority').value;
    var qs = [];
    if (st) qs.push('status=' + encodeURIComponent(st));
    if (pr) qs.push('priority=' + encodeURIComponent(pr));
    var host = document.getElementById('list');
    host.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/support/tickets' + (qs.length ? '?' + qs.join('&') : ''))
      .then(function (r) {
        var list = (r && (r.tickets || r.items || r)) || [];
        if (!Array.isArray(list)) list = [];
        host.innerHTML = list.length ? list.map(function (t) {
          var cls = 'tk'
            + (t.priority === 'URGENT' ? ' urgent' : '')
            + (t.unreadForAdmin || t.hasUnread ? ' unread' : '')
            + (current === t.id ? ' sel' : '');
          return '<div class="' + cls + '" data-t="' + esc(t.id) + '">'
            + '<div class="tk-s">' + esc(t.subject || 'بلا عنوان') + '</div>'
            + '<div class="tk-m">' + esc(t.status || '') + ' · ' + esc(t.priority || '')
            + ' · ' + esc(t.userEmail || t.customerEmail || '') + '</div></div>';
        }).join('')
        : '<div class="empty-pane"><div class="empty-pane-t">'
          + (st || pr ? 'لا تذكرة بهذا المرشّح' : 'لا تذاكر مفتوحة')
          + '</div><div class="empty-pane-w">'
          + (st || pr
              ? 'جرّب حالة أو أولوية أخرى، أو أزل المرشّحات لرؤية كل التذاكر.'
              : 'لم يفتح أي زبون تذكرة دعم. تظهر التذاكر هنا فور وصولها، مرتّبة بالأولوية.')
          + '</div></div>';
        document.getElementById('tk-n').textContent = list.length ? (list.length + ' تذكرة') : '';
      }).catch(function (e) {
        host.innerHTML = '<div class="muted">تعذّر: ' + esc(e.message) + '</div>';
      });
  }

  function openTicket(id) {
    current = id;
    loadList();
    var thread = document.getElementById('thread');
    thread.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/support/tickets/' + encodeURIComponent(id)).then(function (r) {
      var t = r.ticket || r;
      var msgs = r.messages || t.messages || [];
      document.getElementById('th-subject').textContent = t.subject || 'تذكرة';
      document.getElementById('th-context').textContent =
        [t.userEmail || t.customerEmail, t.workspaceName || t.workspaceId, t.status, t.priority]
          .filter(Boolean).join(' · ');
      document.getElementById('th-actions').innerHTML =
        '<button class="btn" data-set="CLOSED">أغلق</button> '
        + '<button class="btn" data-set="OPEN">أعد الفتح</button>';
      thread.innerHTML = msgs.length ? msgs.map(function (m) {
        var staff = m.authorRole === 'ADMIN' || m.isStaff || m.fromAdmin;
        return '<div class="msg' + (staff ? ' staff' : '') + '">'
          + '<div class="msg-w">' + window.adminTime(m.createdAt) + ' · '
          + esc(staff ? 'الدعم' : (m.authorName || 'الزبون')) + '</div>'
          + esc(m.body || m.message || '') + '</div>';
      }).join('') : '<div class="muted">لا رسائل في هذه التذكرة.</div>';
      document.getElementById('reply-box').style.display = '';
    }).catch(function (e) {
      thread.innerHTML = '<div class="muted">تعذّر: ' + esc(e.message) + '</div>';
    });
  }

  document.getElementById('list').addEventListener('click', function (e) {
    var d = e.target.closest ? e.target.closest('[data-t]') : null;
    if (d) openTicket(d.getAttribute('data-t'));
  });
  document.getElementById('reload').addEventListener('click', loadList);
  document.getElementById('f-status').addEventListener('change', loadList);
  document.getElementById('f-priority').addEventListener('change', loadList);

  document.getElementById('send').addEventListener('click', function () {
    var body = document.getElementById('reply').value.trim();
    if (!current || !body) return;
    window.adminFetch('/api/admin/support/tickets/' + encodeURIComponent(current) + '/reply', {
      method: 'POST', body: JSON.stringify({ body: body, message: body })
    }).then(function () {
      document.getElementById('reply').value = '';
      openTicket(current);
    }).catch(function (e) { alert('تعذّر الإرسال: ' + e.message); });
  });

  document.getElementById('th-actions').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-set]') : null;
    if (!b || !current) return;
    window.adminFetch('/api/admin/support/tickets/' + encodeURIComponent(current), {
      method: 'PATCH', body: JSON.stringify({ status: b.getAttribute('data-set') })
    }).then(function () { openTicket(current); })
      .catch(function (err) { alert('تعذّر: ' + err.message); });
  });

  loadList();
})();
`;

export function supportWorkspacePage(): string {
  return adminShell({
    active: 'support',
    title: 'صندوق الدعم',
    subtitle: 'من يحتاج مساعدة وما الذي لم يُحلّ',
    css: CSS,
    body: BODY,
    script: SCRIPT,
    commands: [
      { label: 'الصندوق الكلاسيكي', href: '/admin/inbox', hint: 'إرث' },
    ],
  });
}
