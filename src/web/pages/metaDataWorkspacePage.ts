// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/metaDataWorkspacePage.ts
//
//  META & DATA — /admin/meta. One workspace, seven views.
//
//  ── What was scattered ────────────────────────────────────────────────
//
//  Meta lived in four places. Readiness and quota were on /admin/meta-readiness,
//  a page with its own layout that read as a different application. The
//  capability probe was a tab in the classic console AND a view in the Admin
//  OS — the same POST, rendered twice. Account discovery was buried inside
//  the add-client wizard. Sync state and data freshness were rows on a
//  workspace table in a third console.
//
//  An operator asking "is our Meta connection healthy" therefore had to visit
//  three products and already know which one owned which half of the answer.
//
//  ── The rule applied here ─────────────────────────────────────────────
//
//  Every view below is backed by a route that already exists. None was added
//  and none was invented: overview and sync read the ops snapshot,
//  capabilities runs the existing probe, entities calls the existing
//  discovery route, failures reads the existing Meta audit trail. A view with
//  no backing route would be a heading that promises an answer the platform
//  cannot give, which is the same dishonesty as rendering UNKNOWN as healthy.
//
//  The legacy readiness page stays mounted and is linked from Overview: it
//  still owns the detailed quota breakdown, and removing it before that
//  detail exists here would trade one gap for another.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; font-size: 12px; }
  .kv dt { color: var(--text-3); }
  .kv dd { font-weight: 600; }
  .inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 5px 9px; font-size: 12px; font-family: inherit; }
  .inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .bar { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  pre.out { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px;
            font-family: var(--font-mono); font-size: 10.5px; direction: ltr; text-align: left;
            max-height: 340px; overflow: auto; white-space: pre-wrap; }
`;

const BODY = `
  <section class="view on" id="v-overview">
    <div class="grid g2">
      <div class="card">
        <div class="h2">حالة الاتصال بـMeta</div>
        <div id="meta-sub"><div class="skel"></div></div>
        <div class="muted">مصدر الحالة: لقطة التشغيل الرسمية (adminOpsHealth).</div>
      </div>
      <div class="card">
        <div class="h2">استهلاك الحصّة</div>
        <dl class="kv" id="usage"><dd class="skel"></dd></dl>
        <div style="margin-top:10px;">
          <a class="btn" href="/admin/meta-readiness">صفحة الجاهزية التفصيلية</a>
        </div>
        <div class="muted">الصفحة السابقة ما زالت تملك التفصيل الكامل للاستهلاك — تُقرأ منها حتى تكتمل هنا.</div>
      </div>
    </div>
  </section>

  <section class="view" id="v-connections">
    <table class="t"><thead><tr>
      <th>مساحة العمل</th><th>الحساب الإعلاني</th><th>الرمز</th><th>ينتهي</th>
      <th>حالة Meta</th><th>الاتصال</th>
    </tr></thead><tbody id="conn"><tr><td colspan="6" class="empty">جارٍ التحميل…</td></tr></tbody></table>
  </section>

  <section class="view" id="v-capabilities">
    <div class="bar">
      <input class="inp" id="probe-ws" placeholder="workspaceId" size="26" />
      <button class="btn btn-primary" id="probe-run">شغّل المرقاب</button>
      <span class="muted">قراءة فقط مقابل Meta — لا يغيّر شيئاً، لكنه ينفق من الحصّة.</span>
    </div>
    <div id="probe-out"><div class="muted">لم يُشغَّل بعد — وهذا ليس ادّعاءً بأن القدرات متاحة.</div></div>
  </section>

  <section class="view" id="v-entities">
    <div class="bar">
      <button class="btn" id="disc-run">اكتشف الحسابات المتاحة</button>
      <input class="inp" id="check-acct" placeholder="act_XXXXXXXX" size="22" />
      <button class="btn" id="check-run">افحص حساباً</button>
    </div>
    <div id="disc-out"><div class="muted">لم يُشغَّل بعد.</div></div>
  </section>

  <section class="view" id="v-sync">
    <table class="t"><thead><tr>
      <th>مساحة العمل</th><th>آخر مزامنة</th><th>الحالة</th><th>الخطأ</th>
    </tr></thead><tbody id="sync"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
  </section>

  <section class="view" id="v-coverage">
    <table class="t"><thead><tr>
      <th>مساحة العمل</th><th>أحدث يوم بيانات</th><th>العمر</th><th>حالة البيانات</th>
    </tr></thead><tbody id="cov"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
  </section>

  <section class="view" id="v-failures">
    <table class="t"><thead><tr>
      <th>الوقت</th><th>الحدث</th><th>مساحة العمل</th><th>التفصيل</th>
    </tr></thead><tbody id="fail"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
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
  function chip(s) {
    var m = TONE[s] || ['absent', s];
    return '<span class="st-chip st-' + m[0] + '" title="' + esc(s) + '">'
      + '<span class="st-glyph">' + GLYPH[m[0]] + '</span>' + esc(m[1]) + '</span>';
  }

  document.addEventListener('ops:ready', function (e) {
    var ops = e.detail;
    var meta = (ops.subsystems || []).filter(function (s) { return s.key === 'meta'; })[0];
    document.getElementById('meta-sub').innerHTML = meta
      ? (chip(meta.status) + '<div style="margin-top:7px;">' + esc(meta.summary) + '</div>')
      : '<div class="muted">لا حالة Meta في اللقطة.</div>';

    var rows = ops.workspaces || [];
    document.getElementById('conn').innerHTML = rows.length ? rows.map(function (w) {
      return '<tr><td>' + esc(w.workspaceName) + '</td>'
        + '<td>' + esc(w.adAccountName || '—') + '<div class="muted mono">'
          + esc(w.externalAccountId || '') + '</div></td>'
        + '<td>' + (w.hasToken ? esc(w.tokenSource || 'مخزَّن') : '<span class="muted">لا رمز</span>') + '</td>'
        + '<td class="mono">' + esc(w.tokenExpiresAt || '—') + '</td>'
        + '<td class="mono">' + esc(w.metaAccountStatus == null ? '—' : w.metaAccountStatus) + '</td>'
        + '<td>' + chip(w.connection) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">لا مساحة عمل مرتبطة.</td></tr>';

    document.getElementById('sync').innerHTML = rows.length ? rows.map(function (w) {
      return '<tr><td>' + esc(w.workspaceName) + '</td>'
        + '<td class="mono">' + esc(w.lastSyncedAt || '—') + '</td>'
        + '<td>' + esc(w.lastSyncStatus || '—') + '</td>'
        + '<td class="muted">' + esc(w.lastSyncError || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا مزامنة مسجّلة.</td></tr>';

    document.getElementById('cov').innerHTML = rows.length ? rows.map(function (w) {
      return '<tr><td>' + esc(w.workspaceName) + '</td>'
        + '<td class="mono">' + esc(w.freshestDataDate || '—') + '</td>'
        + '<td class="mono">' + (w.dataAgeDays == null ? '—' : esc(w.dataAgeDays) + ' يوم') + '</td>'
        + '<td>' + chip(w.data) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا بيانات مخزّنة.</td></tr>';
  });

  window.adminFetch('/api/admin/meta-usage').then(function (u) {
    var host = document.getElementById('usage');
    var entries = Object.keys(u || {}).slice(0, 12);
    host.innerHTML = entries.length ? entries.map(function (k) {
      var v = u[k];
      if (v && typeof v === 'object') v = JSON.stringify(v);
      return '<dt>' + esc(k) + '</dt><dd class="mono">' + esc(v) + '</dd>';
    }).join('') : '<dt class="muted">لا عدّادات</dt><dd class="muted">Redis غير متصل أو لم تُسجَّل نداءات</dd>';
  }).catch(function (e) {
    document.getElementById('usage').innerHTML =
      '<dt class="muted">تعذّر</dt><dd class="muted">' + esc(e.message) + '</dd>';
  });

  window.adminFetch('/api/admin/meta-audit?limit=60').then(function (r) {
    var ev = (r && r.events) || [];
    document.getElementById('fail').innerHTML = ev.length ? ev.map(function (x) {
      return '<tr><td class="mono">' + esc(x.createdAt || x.at || '') + '</td>'
        + '<td>' + esc(x.event || x.kind || '') + '</td>'
        + '<td>' + esc(x.workspaceId || '—') + '</td>'
        + '<td class="muted">' + esc(x.detail || x.reason || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا أحداث مسجّلة.</td></tr>';
  }).catch(function (e) {
    document.getElementById('fail').innerHTML =
      '<tr><td colspan="4" class="empty">تعذّر: ' + esc(e.message) + '</td></tr>';
  });

  document.getElementById('probe-run').addEventListener('click', function () {
    var ws = document.getElementById('probe-ws').value.trim();
    var out = document.getElementById('probe-out');
    if (!ws) { out.innerHTML = '<div class="muted">أدخل workspaceId أولاً.</div>'; return; }
    out.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/capability-probe', {
      method: 'POST', body: JSON.stringify({ workspaceId: ws })
    }).then(function (r) {
      out.innerHTML = '<pre class="out">' + esc(JSON.stringify(r, null, 2)) + '</pre>';
    }).catch(function (e) {
      out.innerHTML = '<div class="muted">فشل المرقاب: ' + esc(e.message) + '</div>';
    });
  });

  document.getElementById('disc-run').addEventListener('click', function () {
    var out = document.getElementById('disc-out');
    out.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/meta/discover-accounts').then(function (r) {
      out.innerHTML = '<pre class="out">' + esc(JSON.stringify(r, null, 2)) + '</pre>';
    }).catch(function (e) {
      out.innerHTML = '<div class="muted">تعذّر الاكتشاف: ' + esc(e.message) + '</div>';
    });
  });

  document.getElementById('check-run').addEventListener('click', function () {
    var id = document.getElementById('check-acct').value.trim();
    var out = document.getElementById('disc-out');
    if (!id) { out.innerHTML = '<div class="muted">أدخل معرّف الحساب.</div>'; return; }
    out.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/meta/check-account?accountId=' + encodeURIComponent(id))
      .then(function (r) { out.innerHTML = '<pre class="out">' + esc(JSON.stringify(r, null, 2)) + '</pre>'; })
      .catch(function (e) { out.innerHTML = '<div class="muted">تعذّر الفحص: ' + esc(e.message) + '</div>'; });
  });
})();
`;

export function metaDataWorkspacePage(): string {
  return adminShell({
    active: 'meta',
    title: 'Meta والبيانات',
    subtitle: 'هل اتصالنا بـMeta وحقيقة بياناتنا سليمة؟',
    css: CSS,
    body: BODY,
    views: [
      { id: 'overview', label: 'نظرة عامة', hint: 'الاتصال والحصّة' },
      { id: 'connections', label: 'الاتصالات', hint: 'الرموز والحسابات' },
      { id: 'capabilities', label: 'القدرات', hint: 'مرقاب Meta' },
      { id: 'entities', label: 'الكيانات', hint: 'اكتشاف الحسابات' },
      { id: 'sync', label: 'المزامنة', hint: 'آخر تشغيل وحالته' },
      { id: 'coverage', label: 'التغطية', hint: 'حداثة البيانات' },
      { id: 'failures', label: 'الإخفاقات', hint: 'سجل تدقيق Meta' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'مرقاب قدرات Meta', href: '#capabilities', hint: 'Meta والبيانات' },
      { label: 'اكتشاف الحسابات', href: '#entities', hint: 'Meta والبيانات' },
      { label: 'صفحة الجاهزية السابقة', href: '/admin/meta-readiness', hint: 'إرث' },
    ],
  });
}
