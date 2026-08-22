// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/operationsWorkspacePage.ts
//
//  OPERATIONS — /admin/operations. Is the platform itself working?
//
//  ── The two conflations this page refuses ─────────────────────────────
//
//  NOT_CONFIGURED is not FAILED. Redis absent by configuration is a working
//  system with in-process fallbacks, not an outage; painting it red teaches
//  the operator that red is noise, and the next real outage gets ignored.
//
//  UNKNOWN is not HEALTHY. When no sync has run in 48 hours we cannot see
//  whether a separate worker service is alive — the honest answer is that we
//  do not know, and it is rendered dashed and muted, never green.
//
//  Both distinctions are already drawn by `adminOpsHealth`; this page's job
//  is to not throw them away at the last inch, which is where they are
//  usually lost.
//
//  ── Writes here are the two that already existed ──────────────────────
//
//  Cache bust (safe) and user activate/deactivate (privileged). Both call the
//  same guarded routes the previous consoles called; neither was invented for
//  this page, and both confirm before firing.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  .sub { border: 1px solid var(--border); border-radius: 10px; padding: 11px 13px; }
  .sub.absent { border-style: dashed; }
  .sub-k { font-weight: 700; font-size: 12.5px; }
  .sub-w { font-size: 11.5px; color: var(--text-2); margin-top: 5px; }
  .big { font-family: var(--font-display); font-size: 22px; font-weight: 700; }
  .inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 5px 9px; font-size: 12px; font-family: inherit; }
  .bar { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
`;

const BODY = `
  <section class="view on" id="v-services">
    <div class="grid g3" id="subs"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
    <div class="card">
      <div class="h2">ما لم نستطع تحديده</div>
      <div class="muted" id="unknown">…</div>
    </div>
    <div class="card">
      <div class="card-h"><div class="h2">الطوابير</div></div>
      <div class="muted">أسماء الطوابير معلَنة في lib/queue.ts. عمق كل طابور غير مرصود — لا فحص حي لكل طابور،
        وعرض رقم هنا سيكون اختراعاً.</div>
      <div id="queues" class="mono muted"></div>
    </div>
  </section>

  <section class="view" id="v-build">
    <div class="grid g2">
      <div class="card"><div class="h2">النسخة العاملة</div>
        <div class="big mono" id="b-commit">—</div>
        <div class="muted" id="b-detail">…</div>
        <div class="muted">هذا ما ينفَّذ فعلاً، لا ما دُفع إلى الفرع.</div></div>
      <div class="card"><div class="h2">إحصاءات المنصة</div>
        <div id="stats"><div class="skel"></div></div>
        <div class="bar" style="margin-top:10px;">
          <button class="btn" id="bust">أبطل ذاكرة الإحصاءات</button>
          <a class="btn" href="/admin/observability">صفحة المراقبة السابقة</a>
        </div>
        <div class="muted">الصفحة السابقة ما زالت تملك جداول الوصول والأموال المفصّلة.</div>
      </div>
    </div>
  </section>

  <section class="view" id="v-users">
    <div class="bar">
      <input class="inp" id="uq" placeholder="ابحث بالبريد أو الاسم" size="26" />
      <select class="inp" id="ust"><option value="all">الكل</option>
        <option value="pending">بانتظار التفعيل</option><option value="active">مفعّل</option></select>
      <button class="btn" id="uload">حدّث</button>
    </div>
    <table class="t"><thead><tr>
      <th>المستخدم</th><th>البريد</th><th>الحالة</th><th>إجراء</th>
    </tr></thead><tbody id="users"><tr><td colspan="4" class="empty">اضغط «حدّث»</td></tr></tbody></table>
  </section>

  <section class="view" id="v-timeline">
    <div class="card"><div class="h2">النشاط التشغيلي</div>
      <div id="acts"><div class="skel"></div></div></div>
  </section>
`;

const SCRIPT = `
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var GLYPH = { ok: '●', warn: '▲', bad: '■', absent: '◌' };
  var TONE = {
    HEALTHY: ['ok', 'سليم'], RUNNING: ['ok', 'قيد التشغيل'],
    DEGRADED: ['warn', 'متدهور'], WARNING: ['warn', 'يحتاج نظراً'],
    BLOCKED: ['bad', 'محجوب'], ERROR: ['bad', 'فاشل'],
    UNKNOWN: ['absent', 'غير معروف'], NOT_TESTED: ['absent', 'لم يُختبر']
  };
  var ABSENT = { UNKNOWN: 1, NOT_TESTED: 1 };
  function chip(s) {
    var m = TONE[s] || ['absent', s];
    return '<span class="st-chip st-' + m[0] + '" title="' + esc(s) + '">'
      + '<span class="st-glyph">' + GLYPH[m[0]] + '</span>' + esc(m[1]) + '</span>';
  }
  var NAME = {
    database: 'قاعدة البيانات', redis: 'Redis', queue: 'الطوابير',
    workers: 'العمّال', meta: 'Meta', intelligence: 'الذكاء'
  };

  document.addEventListener('ops:ready', function (e) {
    var ops = e.detail;
    document.getElementById('subs').innerHTML = (ops.subsystems || []).map(function (s) {
      return '<div class="sub' + (ABSENT[s.status] ? ' absent' : '') + '">'
        + '<div class="sub-k">' + esc(NAME[s.key] || s.key) + ' ' + chip(s.status) + '</div>'
        + '<div class="sub-w">' + esc(s.summary) + '</div>'
        + (s.detail ? '<div class="sub-w mono">' + esc(s.detail) + '</div>' : '')
        + (s.actionHref ? '<div style="margin-top:8px;"><a class="btn" href="' + esc(s.actionHref) + '">'
            + esc(s.actionLabel || 'افتح') + '</a></div>' : '')
        + '</div>';
    }).join('');

    var unk = ops.unknown || [];
    document.getElementById('unknown').textContent = unk.length
      ? (unk.map(function (u) { return NAME[u] || u; }).join('، ')
         + ' — لم يُحدَّد. هذا ليس ادّعاءً بأنها سليمة، وليس ادّعاءً بأنها معطّلة.')
      : 'كل نظام فرعي في هذه اللقطة تم تحديد حالته.';

    var b = ops.build || {};
    document.getElementById('b-commit').textContent = b.commit ? String(b.commit).slice(0, 10) : 'غير محدّدة';
    document.getElementById('b-detail').textContent =
      [b.environment, b.builtAt, b.source].filter(Boolean).join(' · ') || 'لا بيانات نسخة';

    document.getElementById('acts').innerHTML = (ops.activity || []).length
      ? (ops.activity).map(function (a) {
          return '<div style="padding:6px 0;border-bottom:1px dotted var(--border);font-size:11.5px;">'
            + window.adminTime(a.at) + ' · ' + esc(a.workspaceName)
            + ' · ' + esc(a.kind) + ' · ' + esc(a.status)
            + (a.detail ? ' — <span class="muted">' + esc(a.detail) + '</span>' : '') + '</div>';
        }).join('')
      : '<div class="muted">لا نشاط مسجّل.</div>';
  });

  document.addEventListener('ops:failed', function () {
    var why = '<div class="muted" style="padding:14px;">تعذّر قراءة لقطة التشغيل — '
      + 'حالة الأنظمة الفرعية غير متاحة. هذا ليس ادّعاءً بأنها سليمة.</div>';
    document.getElementById('subs').innerHTML = why;
    document.getElementById('acts').innerHTML = why;
    document.getElementById('unknown').textContent = 'غير متاح — لم تُقرأ اللقطة أصلاً.';
    document.getElementById('b-commit').textContent = 'غير محدّدة';
    document.getElementById('b-detail').textContent = 'تعذّر قراءة هوية النسخة';
  });

  document.getElementById('queues').textContent =
    'sync-account-v1 · engines-and-brain-v1 · reconcile-campaigns-v1 · maintenance-v1';

  window.adminFetch('/api/admin/platform-stats').then(function (s) {
    var host = document.getElementById('stats');
    var reach = s.reach || {};
    host.innerHTML = '<div class="mono" style="font-size:12px;line-height:1.9;">'
      + 'workspaces: ' + esc(reach.workspaces != null ? reach.workspaces : '—') + '<br>'
      + 'accounts: ' + esc(reach.accounts != null ? reach.accounts : '—') + '<br>'
      + 'activeAccounts: ' + esc(reach.activeAccounts != null ? reach.activeAccounts : '—') + '<br>'
      + 'campaigns: ' + esc(reach.campaigns != null ? reach.campaigns : '—')
      + '</div>';
  }).catch(function (e) {
    document.getElementById('stats').innerHTML = '<div class="muted">تعذّر: ' + esc(e.message) + '</div>';
  });

  document.getElementById('bust').addEventListener('click', function () {
    if (!confirm('إبطال ذاكرة الإحصاءات؟ سيُعاد الحساب عند الطلب التالي.')) return;
    window.adminFetch('/api/admin/cache/bust', { method: 'POST' })
      .then(function () { location.reload(); })
      .catch(function (e) { alert('تعذّر: ' + e.message); });
  });

  function loadUsers() {
    var q = document.getElementById('uq').value.trim();
    var st = document.getElementById('ust').value;
    var host = document.getElementById('users');
    host.innerHTML = '<tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr>';
    window.adminFetch('/api/admin/users?status=' + encodeURIComponent(st)
      + (q ? '&q=' + encodeURIComponent(q) : '')).then(function (r) {
      var list = (r && (r.users || r.items || r)) || [];
      if (!Array.isArray(list)) list = [];
      host.innerHTML = list.length ? list.map(function (u) {
        var active = u.isActive !== false && u.status !== 'pending';
        return '<tr><td>' + esc(u.name || '—') + '</td>'
          + '<td class="mono">' + esc(u.email || '') + '</td>'
          + '<td>' + (active ? 'مفعّل' : 'بانتظار التفعيل') + '</td>'
          + '<td><button class="btn" data-act="' + (active ? 'deactivate' : 'activate')
          + '" data-id="' + esc(u.id) + '">' + (active ? 'تعليق' : 'تفعيل') + '</button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">لا نتائج.</td></tr>';
    }).catch(function (e) {
      host.innerHTML = '<tr><td colspan="4" class="empty">تعذّر: ' + esc(e.message) + '</td></tr>';
    });
  }
  document.getElementById('uload').addEventListener('click', loadUsers);
  document.getElementById('users').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (!confirm(act === 'activate' ? 'تفعيل هذا الحساب؟' : 'تعليق هذا الحساب؟ سيفقد الوصول فوراً.')) return;
    // Two literal routes rather than one built by concatenation. The
    // capability registry names these exactly, and a parity check that has to
    // guess what a string concatenation resolves to cannot prove anything.
    var url = act === 'activate' ? '/api/admin/users/activate' : '/api/admin/users/deactivate';
    window.adminFetch(url, {
      method: 'POST', body: JSON.stringify({ userId: b.getAttribute('data-id') })
    }).then(loadUsers).catch(function (err) { alert('تعذّر: ' + err.message); });
  });
})();
`;

export function operationsWorkspacePage(): string {
  return adminShell({
    active: 'operations',
    title: 'تشغيل المنصة',
    subtitle: 'هل المنصة نفسها تعمل بشكل صحيح؟',
    css: CSS,
    body: BODY,
    views: [
      { id: 'services', label: 'الخدمات', hint: 'الأنظمة الفرعية والطوابير' },
      { id: 'build', label: 'النسخة والإحصاءات', hint: 'ما ينفَّذ الآن' },
      { id: 'users', label: 'المستخدمون', hint: 'التفعيل والتعليق' },
      { id: 'timeline', label: 'النشاط', hint: 'ما جرى مؤخراً' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'أبطل ذاكرة الإحصاءات', href: '#build', hint: 'العمليات' },
      { label: 'صفحة المراقبة السابقة', href: '/admin/observability', hint: 'إرث' },
    ],
  });
}
