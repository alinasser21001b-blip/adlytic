// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/metaDataWorkspacePage.ts
//
//  META & DATA — /admin/meta.
//
//  ── Why this page was rebuilt ─────────────────────────────────────────
//
//  The first version passed a browser acceptance audit and then failed on a
//  real screenshot. Its quota card did this:
//
//      Object.keys(payload).slice(0, 12).map(k =>
//        typeof v === 'object' ? JSON.stringify(v) : v)
//
//  That is not a UI. It is a key-dumper: it renders whatever the API returns,
//  with no opinion about what any field means. Against the real
//  `MetaUsageStats` — which carries THREE nested objects — it printed raw
//  serialized JSON at an operator, and the strings overflowed their card into
//  the page margin. The harness missed it because its fixture had been written
//  from memory with one small nested object, and because no assertion asked
//  whether the content was comprehensible.
//
//  The lesson is not "add a JSON assertion". It is that a page which renders
//  whatever it is handed cannot be verified, because it has no fixed content
//  to verify. So this page now KNOWS its payload: every field it shows, it
//  names, explains, and gives an operator meaning.
//
//  ── What an operator gets in the first screen ─────────────────────────
//
//   1. Is Meta connected?          → health header
//   2. Which accounts are affected? → connected / blocked counts, then the table
//   3. Is data flowing?            → last successful sync
//   4. Is data fresh?              → worst data age across workspaces
//   5. Are capabilities sufficient?→ capability state (NOT_TESTED until probed)
//   6. Is quota healthy?           → error gate vs. the rate Meta actually gates on
//   7. What needs me?              → attention strip, each item a link to the row
//
//  ── Translation, not decoration ───────────────────────────────────────
//
//  `errorRateGatePct`, `meetsErrorGate`, `recentWindowSize` and
//  `progressToThresholdPct` are Meta-quota implementation details. They are
//  rendered as what they MEAN — "Meta gates access on the error rate of the
//  last 500 calls; ours is 1.2% against a 15% ceiling" — with the raw payload
//  available behind a Technical-details disclosure and never before it.
//
//  Nothing here computes: every number is copied from `getMetaUsageStats()`
//  or the ops snapshot. The page decides presentation, not truth.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  .inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 6px 10px; font-size: 12.5px; font-family: inherit; }
  .inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .two { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px;
         align-items: start; }
  @media (max-width: 1080px) { .two { grid-template-columns: 1fr; } }
  .q { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
       padding: 9px 0; border-bottom: 1px dotted var(--border); }
  .q:last-child { border-bottom: 0; }
  .q-k { font-size: 12.5px; }
  .q-h { font-size: 11.5px; color: var(--text-2); margin-top: 2px; }
  .q-v { font-size: 14px; font-weight: 700; white-space: nowrap; }
  .q-v.ok { color: var(--success); }
  .q-v.bad { color: var(--error); }
  .q-v.absent { color: var(--text-3); font-weight: 600; }
  .bars { display: flex; flex-direction: column; gap: 7px; }
  .barrow { display: grid; grid-template-columns: 128px 1fr 46px; gap: 10px; align-items: center;
            font-size: 12px; }
  /* display:block is load-bearing, not tidiness. These are rendered as <span>
     in one caller and <div> in another; an inline element ignores width and
     height, so every fill measured 0px and the operator saw six identical
     empty tracks — a chart that looks like information and carries none. */
  .bartrack { display: block; height: 8px; background: var(--surface-2);
              border-radius: 4px; overflow: hidden; }
  .barfill { display: block; height: 100%; min-width: 2px; background: var(--accent);
             border-radius: 4px; }
  .impact { font-size: 11.5px; color: var(--text-2); }
  .wsname { font-weight: 600; }
  .wssub { font-size: 11px; color: var(--text-3); }
  .matrix td:first-child { font-weight: 600; }
`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">Meta والبيانات</div>
      <div class="phead-s">هل اتصالنا بـMeta سليم، وهل البيانات تتدفّق وطازجة، وهل الحصّة والصلاحيات كافية.</div>
    </div>
    <div class="phead-actions">
      <button class="btn" id="reload">تحديث</button>
    </div>
  </div>
`;

const BODY = `
  <section class="view on" id="v-overview">
    <div class="stats" id="health"></div>
    <div class="sec" id="attn-sec" style="display:none;">
      <div class="sec-h"><div class="sec-t">يحتاج إجراءً</div><div class="sec-n" id="attn-n"></div></div>
      <div class="strip" id="attn"></div>
    </div>
    <div class="two">
      <div class="card">
        <div class="card-h"><div class="h2">الاتصالات</div>
          <button class="btn" data-view-jump="connections">كل التفاصيل</button></div>
        <table class="t"><thead><tr>
          <th>مساحة العمل</th><th>الاتصال</th><th>آخر مزامنة</th><th>حداثة البيانات</th>
        </tr></thead><tbody id="conn-brief"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
      </div>
      <div class="card">
        <div class="card-h"><div class="h2">حصّة Meta</div>
          <button class="btn" data-view-jump="quota">التفاصيل</button></div>
        <div class="card-b" id="quota-brief"><div class="skel"></div></div>
      </div>
    </div>
    <div class="two">
      <div class="card">
        <div class="card-h"><div class="h2">أحدث أحداث Meta</div>
          <button class="btn" data-view-jump="failures">السجل الكامل</button></div>
        <table class="t"><thead><tr><th>الوقت</th><th>الحدث</th><th>مساحة العمل</th></tr></thead>
          <tbody id="ev-brief"><tr><td colspan="3" class="empty">جارٍ التحميل…</td></tr></tbody></table>
      </div>
      <div class="card">
        <div class="card-h"><div class="h2">أسباب الأخطاء — ١٥ يوماً</div></div>
        <div class="card-b" id="errcat-brief"><div class="skel"></div></div>
      </div>
    </div>
  </section>

  <section class="view" id="v-connections">
    <div class="card">
      <div class="card-h"><div class="h2">كل الاتصالات</div><div class="sec-n" id="conn-n"></div></div>
      <table class="t"><thead><tr>
        <th>مساحة العمل</th><th>حساب Meta</th><th>الاتصال</th><th>الرمز</th>
        <th>آخر مزامنة</th><th>حداثة البيانات</th><th>الأثر</th><th></th>
      </tr></thead><tbody id="conn"><tr><td colspan="8" class="empty">جارٍ التحميل…</td></tr></tbody></table>
    </div>
  </section>

  <section class="view" id="v-quota">
    <div class="two">
      <div class="card">
        <div class="card-h"><div class="h2">استهلاك واجهة Meta</div></div>
        <div class="card-b" id="quota"><div class="skel"></div></div>
      </div>
      <div class="card">
        <div class="card-h"><div class="h2">أسباب الأخطاء — آخر ١٥ يوماً</div></div>
        <div class="card-b" id="errcat"><div class="skel"></div></div>
      </div>
    </div>
    <details class="tech" id="quota-tech">
      <summary>تفاصيل تقنية — الاستجابة الخام</summary>
      <div class="tech-b"><pre class="raw" id="quota-raw">—</pre></div>
    </details>
  </section>

  <section class="view" id="v-capabilities">
    <div class="card">
      <div class="card-h"><div class="h2">مرقاب قدرات Meta</div></div>
      <div class="card-b">
        <div class="bar">
          <input class="inp" id="probe-ws" placeholder="workspaceId" size="26" />
          <button class="btn btn-primary" id="probe-run">شغّل المرقاب</button>
          <span class="muted">قراءة فقط مقابل Meta — لا يغيّر شيئاً، لكنه ينفق من الحصّة.</span>
        </div>
        <div id="probe-out"><div class="muted">لم يُشغَّل بعد — وهذا ليس ادّعاءً بأن القدرات متاحة.</div></div>
      </div>
    </div>
  </section>

  <section class="view" id="v-entities">
    <div class="card">
      <div class="card-h"><div class="h2">اكتشاف الحسابات والكيانات</div></div>
      <div class="card-b">
        <div class="bar">
          <button class="btn" id="disc-run">اكتشف الحسابات المتاحة</button>
          <input class="inp" id="check-acct" placeholder="act_XXXXXXXX" size="22" />
          <button class="btn" id="check-run">افحص حساباً</button>
        </div>
        <div id="disc-out"><div class="muted">لم يُشغَّل بعد.</div></div>
      </div>
    </div>
  </section>

  <section class="view" id="v-sync">
    <div class="card">
      <div class="card-h"><div class="h2">المزامنة</div></div>
      <table class="t"><thead><tr>
        <th>مساحة العمل</th><th>آخر مزامنة</th><th>الحالة</th><th>الخطأ</th>
      </tr></thead><tbody id="sync"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
    </div>
  </section>

  <section class="view" id="v-coverage">
    <div class="card">
      <div class="card-h"><div class="h2">تغطية البيانات</div></div>
      <table class="t"><thead><tr>
        <th>مساحة العمل</th><th>أحدث يوم بيانات</th><th>العمر</th><th>حالة البيانات</th>
      </tr></thead><tbody id="cov"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
    </div>
  </section>

  <section class="view" id="v-failures">
    <div class="card">
      <div class="card-h"><div class="h2">سجل أحداث Meta</div><div class="sec-n" id="fail-n"></div></div>
      <table class="t"><thead><tr>
        <th>الوقت</th><th>الحدث</th><th>مساحة العمل</th><th>التفصيل</th>
      </tr></thead><tbody id="fail"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
    </div>
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
  var num = function (n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); };

  var S = { ops: null, usage: null };

  // ── Health header: the seven questions, as facts ───────────────────
  function renderHealth() {
    var host = document.getElementById('health');
    var o = S.ops, u = S.usage;
    var rows = o ? (o.workspaces || []) : [];
    var connected = rows.filter(function (w) { return w.adAccountId; });
    var blocked = rows.filter(function (w) { return w.connection === 'ERROR' || w.connection === 'BLOCKED'; });
    var synced = rows.map(function (w) { return w.lastSyncedAt; }).filter(Boolean).sort();
    var ages = rows.map(function (w) { return w.dataAgeDays; }).filter(function (d) { return d != null; });
    var meta = o ? (o.subsystems || []).filter(function (s) { return s.key === 'meta'; })[0] : null;

    function tile(k, v, w, absent) {
      return '<div class="stat' + (absent ? ' absent' : '') + '">'
        + '<div class="stat-k">' + esc(k) + '</div>'
        + '<div class="stat-v">' + v + '</div>'
        + '<div class="stat-w">' + esc(w) + '</div></div>';
    }

    var tiles = [];
    tiles.push(tile('الاتصال بـMeta', o ? chip(meta ? meta.status : 'UNKNOWN') : chip('UNKNOWN'),
      o && meta ? meta.summary : 'لم تُقرأ لقطة التشغيل', !o));
    tiles.push(tile('حسابات متصلة', o ? String(connected.length) : '—',
      o ? ('من ' + rows.length + ' مساحة عمل') : 'غير معروف', !o));
    tiles.push(tile('حسابات محجوبة', o ? String(blocked.length) : '—',
      blocked.length ? 'المزامنة متوقفة عليها' : 'لا حساب محجوب', !o || blocked.length === 0));
    tiles.push(tile('آخر مزامنة ناجحة',
      synced.length ? '<span class="mono" style="font-size:13px;">' + esc(String(synced[synced.length - 1]).slice(0, 10)) + '</span>' : '—',
      synced.length ? 'عبر كل الحسابات' : 'لا مزامنة مسجّلة', !synced.length));
    tiles.push(tile('أقدم بيانات',
      ages.length ? (Math.max.apply(null, ages) + ' يوم') : '—',
      ages.length ? 'أسوأ حساب' : 'لا بيانات مخزّنة', !ages.length));
    // Capabilities are NOT_TESTED until somebody runs the probe. Saying
    // anything else here would be the manufactured certainty this console
    // exists to avoid.
    tiles.push(tile('القدرات', chip('NOT_TESTED'), 'يُحسم بتشغيل المرقاب', true));

    if (!u) {
      tiles.push(tile('حصّة Meta', chip('UNKNOWN'), 'تعذّر قراءة العدّادات', true));
    } else if (!u.redisAvailable) {
      // The critical honesty: with the counter backend down the numbers are
      // zeros, and a zero here would read as "no errors", not "no data".
      tiles.push(tile('حصّة Meta', chip('UNKNOWN'), 'عدّاد الاستهلاك غير متاح — لا قياس', true));
    } else {
      var gate = u.counts.meetsErrorGate;
      tiles.push(tile('حصّة Meta',
        '<span class="q-v ' + (gate ? 'ok' : 'bad') + '" style="font-size:17px;">'
          + esc(u.counts.errorRateLast500) + '%</span>',
        'معدّل الخطأ مقابل سقف ' + esc(u.errorRateGatePct) + '%', false));
    }
    host.innerHTML = tiles.join('');
  }

  // ── Attention: only real issues, and each one goes somewhere ───────
  function renderAttention() {
    var o = S.ops, u = S.usage;
    var items = [];
    if (o) {
      (o.workspaces || []).forEach(function (w) {
        if (w.connection === 'ERROR' || w.connection === 'BLOCKED') {
          items.push({ sev: 'ERROR', t: 'حساب Meta محجوب — ' + w.workspaceName,
            w: w.headline || 'المزامنة متوقفة، وكل رقم يراه الزبون يتقادم من الآن.',
            go: 'افتح الاتصال', view: 'connections', focus: w.workspaceId });
        } else if (w.data === 'WARNING' || w.data === 'DEGRADED') {
          items.push({ sev: 'WARNING', t: 'بيانات متقادمة — ' + w.workspaceName,
            w: (w.dataAgeDays != null ? ('أحدث يوم مخزَّن عمره ' + w.dataAgeDays + ' يوماً. ') : '')
              + 'التوصيات تُبنى على ماضٍ بعيد.',
            go: 'افتح التغطية', view: 'coverage', focus: w.workspaceId });
        }
      });
    }
    if (u && !u.redisAvailable) {
      items.push({ sev: 'ERROR', t: 'عدّاد استهلاك Meta غير متاح',
        w: 'Redis غير متصل، فكل عدّادات الحصّة تقرأ صفراً. لا يمكن تأكيد أننا ضمن حدود Meta.',
        go: 'افتح الحصّة', view: 'quota' });
    } else if (u && !u.counts.meetsErrorGate && u.counts.recentWindowSize > 0) {
      items.push({ sev: 'WARNING', t: 'معدّل خطأ Meta فوق السقف',
        w: 'آخر ' + u.counts.recentWindowSize + ' نداء بمعدّل خطأ ' + u.counts.errorRateLast500
          + '% مقابل سقف ' + u.errorRateGatePct + '% — وهو المعيار الذي تقيس عليه Meta ترقية الطبقة.',
        go: 'افتح الحصّة', view: 'quota' });
    }
    var sec = document.getElementById('attn-sec');
    if (!items.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    document.getElementById('attn-n').textContent = items.length + ' بند';
    document.getElementById('attn').innerHTML = items.map(function (i) {
      return '<button class="strip-i sev-' + i.sev + '" data-go-view="' + esc(i.view) + '"'
        + (i.focus ? ' data-focus="' + esc(i.focus) + '"' : '') + '>'
        + '<span><span class="strip-t">' + esc(i.t) + '</span>'
        + '<span class="strip-w" style="display:block;">' + esc(i.w) + '</span></span>'
        + '<span class="strip-go">' + esc(i.go) + ' ←</span></button>';
    }).join('');
  }

  // ── Connections ────────────────────────────────────────────────────
  function impactOf(w) {
    if (w.connection === 'ERROR' || w.connection === 'BLOCKED') return 'لا مزامنة — الأرقام تتجمّد';
    if (w.data === 'WARNING' || w.data === 'DEGRADED') return 'التوصيات على بيانات قديمة';
    if (w.data === 'NOT_TESTED') return 'لا بيانات بعد';
    return 'لا أثر';
  }
  function renderConnections() {
    var rows = S.ops ? (S.ops.workspaces || []) : [];
    document.getElementById('conn-n').textContent = rows.length + ' مساحة عمل';
    var brief = document.getElementById('conn-brief');
    var full = document.getElementById('conn');
    if (!rows.length) {
      brief.innerHTML = '<tr><td colspan="4" class="empty">لا مساحة عمل مرتبطة بحساب إعلاني.</td></tr>';
      full.innerHTML = '<tr><td colspan="8" class="empty">لا مساحة عمل مرتبطة بحساب إعلاني.</td></tr>';
      return;
    }
    // Worst first: an operator opening this page is looking for the problem.
    var RANK = { ERROR: 0, BLOCKED: 1, WARNING: 2, DEGRADED: 3, UNKNOWN: 4, NOT_TESTED: 5, HEALTHY: 6 };
    var sorted = rows.slice().sort(function (a, b) {
      return (RANK[a.overall] == null ? 9 : RANK[a.overall]) - (RANK[b.overall] == null ? 9 : RANK[b.overall]);
    });
    brief.innerHTML = sorted.slice(0, 6).map(function (w) {
      return '<tr data-ws="' + esc(w.workspaceId) + '"><td><div class="wsname">' + esc(w.workspaceName) + '</div></td>'
        + '<td>' + chip(w.connection) + '</td>'
        + '<td>' + window.adminTime(w.lastSyncedAt) + '</td>'
        + '<td>' + (w.dataAgeDays == null ? '<span class="dim">—</span>' : esc(w.dataAgeDays) + ' يوم') + '</td></tr>';
    }).join('');
    full.innerHTML = sorted.map(function (w) {
      return '<tr data-ws="' + esc(w.workspaceId) + '">'
        + '<td><div class="wsname">' + esc(w.workspaceName) + '</div>'
        + '<div class="wssub">' + esc(w.ownerEmail || '') + '</div></td>'
        + '<td>' + esc(w.adAccountName || '—')
        + (w.externalAccountId ? '<div class="wssub mono">' + esc(w.externalAccountId) + '</div>' : '') + '</td>'
        + '<td>' + chip(w.connection) + '</td>'
        + '<td>' + (w.hasToken ? esc(w.tokenSource || 'مخزَّن') : '<span class="dim">لا رمز</span>')
        + (w.tokenExpiresAt ? '<div class="wssub mono">' + esc(String(w.tokenExpiresAt).slice(0, 10)) + '</div>' : '') + '</td>'
        + '<td>' + window.adminTime(w.lastSyncedAt) + '</td>'
        + '<td>' + chip(w.data)
        + (w.dataAgeDays != null ? ' <span class="dim"><span class="mono">' + w.dataAgeDays + '</span>\u064A</span>' : '') + '</td>'
        + '<td class="impact">' + esc(impactOf(w)) + '</td>'
        + '<td><a class="btn" href="/admin/customers">افتح الزبون</a></td></tr>';
    }).join('');
  }

  function renderSyncCoverage() {
    var rows = S.ops ? (S.ops.workspaces || []) : [];
    document.getElementById('sync').innerHTML = rows.length ? rows.map(function (w) {
      return '<tr><td>' + esc(w.workspaceName) + '</td>'
        + '<td>' + window.adminTime(w.lastSyncedAt) + '</td>'
        + '<td>' + esc(w.lastSyncStatus || '—') + '</td>'
        + '<td class="muted">' + esc(w.lastSyncError || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا مزامنة مسجّلة.</td></tr>';
    document.getElementById('cov').innerHTML = rows.length ? rows.map(function (w) {
      return '<tr><td>' + esc(w.workspaceName) + '</td>'
        + '<td class="mono">' + esc(w.freshestDataDate || '—') + '</td>'
        + '<td>' + (w.dataAgeDays == null ? '<span class="dim">—</span>' : esc(w.dataAgeDays) + ' يوم') + '</td>'
        + '<td>' + chip(w.data) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا بيانات مخزّنة.</td></tr>';
  }

  // ── Quota, translated ──────────────────────────────────────────────
  //
  // Every row states the operator meaning first and the Meta mechanism
  // second. The raw payload lives in the Technical details disclosure and
  // nowhere else.
  function row(k, hint, value, tone) {
    return '<div class="q"><div><div class="q-k">' + esc(k) + '</div>'
      + (hint ? '<div class="q-h">' + esc(hint) + '</div>' : '') + '</div>'
      + '<div class="q-v ' + (tone || '') + '">' + value + '</div></div>';
  }
  function renderQuota() {
    var u = S.usage;
    var host = document.getElementById('quota');
    var brief = document.getElementById('quota-brief');
    if (!u) {
      var msg = '<div class="muted">تعذّر قراءة عدّادات الاستهلاك.</div>';
      host.innerHTML = msg; brief.innerHTML = msg;
      renderCats(document.getElementById('errcat'));
      renderCats(document.getElementById('errcat-brief'));
      return;
    }
    document.getElementById('quota-raw').textContent = JSON.stringify(u, null, 2);

    if (!u.redisAvailable) {
      var absent = '<div class="q"><div><div class="q-k">تتبّع الاستهلاك غير متاح</div>'
        + '<div class="q-h">العدّادات تُخزَّن في Redis، وهو غير متصل. كل الأرقام أدناه ستقرأ صفراً، '
        + 'وذلك يعني «لا قياس» — لا «لا أخطاء».</div></div>'
        + '<div class="q-v absent">لا قياس</div></div>';
      host.innerHTML = absent; brief.innerHTML = absent;
      renderCats(document.getElementById('errcat'));
      renderCats(document.getElementById('errcat-brief'));
      return;
    }

    var c = u.counts;
    var gateTone = c.meetsErrorGate ? 'ok' : 'bad';
    var briefRows = [
      row('معدّل الخطأ — آخر ' + num(c.recentWindowSize) + ' نداء',
        'هذا هو المعيار الذي تقيس عليه Meta، وسقفه ' + u.errorRateGatePct + '%.',
        esc(c.errorRateLast500) + '%', gateTone),
      row('نداءات ناجحة — ١٥ يوماً', 'حجم الاستخدام الفعلي في النافذة المتحرّكة.', num(c.last15Days)),
      row('أخطاء — ١٥ يوماً', 'بنسبة ' + c.errorRatePct15d + '% من إجمالي النداءات.', num(c.errorsLast15Days),
        c.errorsLast15Days > 0 ? '' : 'ok')
    ];
    brief.innerHTML = briefRows.join('');

    var pct = Math.min(100, Number(c.progressToThresholdPct) || 0);
    host.innerHTML = briefRows.join('')
      + row('نداءات اليوم', 'مقابل ' + num(c.yesterday) + ' أمس.', num(c.today))
      + row('آخر ٧ أيام', '', num(c.last7Days))
      + row('بوّابة معدّل الخطأ',
          c.meetsErrorGate
            ? 'نحن ضمن السقف الذي تشترطه Meta لرفع طبقة الوصول.'
            : 'نحن فوق السقف — ترقية طبقة الوصول محجوبة حتى ينخفض المعدّل.',
          c.meetsErrorGate ? 'مستوفاة' : 'غير مستوفاة', gateTone)
      + row('عتبة عدد النداءات',
          'Meta تشترط ' + num(u.callThreshold) + ' نداء خلال ١٥ يوماً لرفع الطبقة.',
          c.meetsCallThreshold ? 'مستوفاة' : 'غير مستوفاة', c.meetsCallThreshold ? 'ok' : '')
      + '<div class="q"><div style="flex:1;min-width:0;"><div class="q-k">التقدّم نحو رفع الطبقة</div>'
        + '<div class="q-h">' + num(c.last15Days) + ' من ' + num(u.callThreshold) + ' نداء.</div>'
        + '<div class="bartrack" style="margin-top:7px;"><div class="barfill" style="width:' + pct + '%"></div></div>'
        + '</div><div class="q-v">' + esc(c.progressToThresholdPct) + '%</div></div>'
      + (u.latest && u.latest.adAccountUsage
          ? row('استهلاك الحساب الإعلاني لدى Meta',
              'طبقة ' + esc(u.latest.adAccountUsage.tier) + ' حسب آخر استجابة.',
              esc(u.latest.adAccountUsage.utilizationPct) + '%')
          : row('استهلاك الحساب الإعلاني لدى Meta', 'لم تُرجِع Meta هذا الحقل بعد.', 'غير معروف', 'absent'))
      + (u.latest && u.latest.lastUpdated
          ? row('آخر تحديث للعدّادات', '', window.adminTime(u.latest.lastUpdated))
          : '');

    // Error categories as a proportional table — the shape of the problem,
    // not six numbers in a row.
    renderCats(document.getElementById('errcat'));
    renderCats(document.getElementById('errcat-brief'));
  }

  var CAT_AR = {
    token: 'رمز الوصول', rate_limit: 'تجاوز المعدّل', permission: 'صلاحية ناقصة',
    invalid_params: 'وسائط غير صالحة', server: 'خطأ من Meta', other: 'أخرى'
  };
  function renderCats(cats) {
    if (!cats) return;
    var u = S.usage;
    if (!u || !u.redisAvailable) {
      cats.innerHTML = '<div class="muted">لا تصنيف للأخطاء بلا عدّاد.</div>';
      return;
    }
    var b = u.errorBreakdown15d || {};
    var keys = Object.keys(CAT_AR);
    var total = keys.reduce(function (n, k) { return n + (b[k] || 0); }, 0);
    if (!total) {
      cats.innerHTML = '<div class="muted">لا أخطاء مسجّلة في النافذة.</div>';
    } else {
      cats.innerHTML = '<div class="bars">' + keys.map(function (k) {
        var v = b[k] || 0;
        var w = Math.round((v / total) * 100);
        return '<div class="barrow"><span>' + esc(CAT_AR[k]) + '</span>'
          + '<span class="bartrack"><span class="barfill" style="width:' + w + '%"></span></span>'
          + '<span class="mono">' + num(v) + '</span></div>';
      }).join('') + '</div>'
      + '<div class="dim" style="margin-top:9px;">' + num(total) + ' خطأ في آخر ١٥ يوماً.</div>';
    }
  }

  // ── Loading ────────────────────────────────────────────────────────
  document.addEventListener('ops:ready', function (e) {
    S.ops = e.detail;
    renderHealth(); renderAttention(); renderConnections(); renderSyncCoverage();
  });
  document.addEventListener('ops:failed', function () {
    S.ops = null;
    renderHealth(); renderAttention();
    document.getElementById('conn-brief').innerHTML =
      '<tr><td colspan="4" class="empty">تعذّر قراءة لقطة التشغيل</td></tr>';
    ['conn'].forEach(function (id) {
      document.getElementById(id).innerHTML =
        '<tr><td colspan="8" class="empty">تعذّر قراءة لقطة التشغيل</td></tr>';
    });
    ['sync', 'cov'].forEach(function (id) {
      document.getElementById(id).innerHTML =
        '<tr><td colspan="4" class="empty">تعذّر قراءة لقطة التشغيل</td></tr>';
    });
  });

  function loadUsage() {
    return window.adminFetch('/api/admin/meta-usage').then(function (u) {
      S.usage = u; renderHealth(); renderAttention(); renderQuota();
    }).catch(function () {
      S.usage = null; renderHealth(); renderQuota();
    });
  }
  loadUsage();

  window.adminFetch('/api/admin/meta-audit?limit=80').then(function (r) {
    var ev = (r && r.events) || [];
    document.getElementById('fail-n').textContent = ev.length ? (ev.length + ' حدث') : '';
    document.getElementById('ev-brief').innerHTML = ev.length ? ev.slice(0, 6).map(function (x) {
      return '<tr><td>' + window.adminTime(x.createdAt || x.at) + '</td>'
        + '<td>' + esc(x.event || x.kind || '') + '</td>'
        + '<td>' + esc(x.workspaceId || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="empty">لا أحداث مسجّلة.</td></tr>';
    document.getElementById('fail').innerHTML = ev.length ? ev.map(function (x) {
      return '<tr><td>' + window.adminTime(x.createdAt || x.at) + '</td>'
        + '<td>' + esc(x.event || x.kind || '') + '</td>'
        + '<td>' + esc(x.workspaceId || '—') + '</td>'
        + '<td class="muted">' + esc(x.detail || x.reason || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">لا أحداث مسجّلة.</td></tr>';
  }).catch(function (e) {
    document.getElementById('fail').innerHTML =
      '<tr><td colspan="4" class="empty">تعذّر: ' + esc(e.message) + '</td></tr>';
    document.getElementById('ev-brief').innerHTML =
      '<tr><td colspan="3" class="empty">تعذّر تحميل السجل</td></tr>';
  });

  document.getElementById('reload').addEventListener('click', function () { location.reload(); });

  // Drill-down: an attention item takes the operator to the row it is about.
  document.addEventListener('click', function (e) {
    var g = e.target.closest ? e.target.closest('[data-go-view]') : null;
    if (g) {
      window.adminShowView(g.getAttribute('data-go-view'));
      var ws = g.getAttribute('data-focus');
      if (ws) {
        var tr = document.querySelector('tr[data-ws="' + ws + '"]');
        if (tr) { tr.scrollIntoView({ block: 'center' }); tr.style.background = 'var(--accent-dim)'; }
      }
      return;
    }
    var j = e.target.closest ? e.target.closest('[data-view-jump]') : null;
    if (j) window.adminShowView(j.getAttribute('data-view-jump'));
  });

  // ── Probe / discovery: results are SUMMARISED, raw stays disclosed ──
  function resultPanel(title, summaryHtml, raw) {
    return '<div style="margin-top:10px;">' + summaryHtml + '</div>'
      + '<details class="tech" style="margin-top:10px;">'
      + '<summary>تفاصيل تقنية — ' + esc(title) + '</summary>'
      + '<div class="tech-b"><pre class="raw">' + esc(JSON.stringify(raw, null, 2)) + '</pre></div>'
      + '</details>';
  }
  function summarise(r) {
    if (!r || typeof r !== 'object') return '<div class="muted">استجابة فارغة.</div>';
    if (Array.isArray(r)) return '<div class="muted">' + r.length + ' عنصر.</div>';
    var rows = [];
    Object.keys(r).slice(0, 10).forEach(function (k) {
      var v = r[k];
      if (v == null) { rows.push([k, 'غير متاح']); return; }
      if (typeof v === 'object') {
        rows.push([k, Array.isArray(v) ? (v.length + ' عنصر') : (Object.keys(v).length + ' حقل')]);
        return;
      }
      rows.push([k, String(v)]);
    });
    return '<table class="t"><tbody>' + rows.map(function (kv) {
      return '<tr><td style="width:42%">' + esc(kv[0]) + '</td><td class="mono">' + esc(kv[1]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  document.getElementById('probe-run').addEventListener('click', function () {
    var ws = document.getElementById('probe-ws').value.trim();
    var out = document.getElementById('probe-out');
    if (!ws) { out.innerHTML = '<div class="muted">أدخل workspaceId أولاً.</div>'; return; }
    out.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/capability-probe', {
      method: 'POST', body: JSON.stringify({ workspaceId: ws })
    }).then(function (r) {
      out.innerHTML = resultPanel('استجابة المرقاب', summarise(r), r);
    }).catch(function (e) {
      out.innerHTML = '<div class="muted">فشل المرقاب: ' + esc(e.message) + '</div>';
    });
  });

  document.getElementById('disc-run').addEventListener('click', function () {
    var out = document.getElementById('disc-out');
    out.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/meta/discover-accounts').then(function (r) {
      out.innerHTML = resultPanel('استجابة الاكتشاف', summarise(r), r);
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
      .then(function (r) { out.innerHTML = resultPanel('استجابة الفحص', summarise(r), r); })
      .catch(function (e) { out.innerHTML = '<div class="muted">تعذّر الفحص: ' + esc(e.message) + '</div>'; });
  });

  renderHealth();
})();
`;

export function metaDataWorkspacePage(): string {
  return adminShell({
    active: 'meta',
    title: 'Meta والبيانات',
    subtitle: 'هل اتصالنا بـMeta وحقيقة بياناتنا سليمة؟',
    css: CSS,
    header: HEADER,
    body: BODY,
    views: [
      { id: 'overview', label: 'نظرة عامة', hint: 'الحالة وما يحتاج إجراءً' },
      { id: 'connections', label: 'الاتصالات', hint: 'الحسابات والرموز والأثر' },
      { id: 'quota', label: 'الحصّة', hint: 'الاستهلاك ومعدّل الخطأ' },
      { id: 'capabilities', label: 'القدرات', hint: 'مرقاب Meta' },
      { id: 'entities', label: 'الكيانات', hint: 'اكتشاف الحسابات' },
      { id: 'sync', label: 'المزامنة', hint: 'آخر تشغيل وحالته' },
      { id: 'coverage', label: 'التغطية', hint: 'حداثة البيانات' },
      { id: 'failures', label: 'السجل', hint: 'أحداث Meta' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'حصّة Meta والاستهلاك', href: '#quota', hint: 'Meta والبيانات' },
      { label: 'مرقاب قدرات Meta', href: '#capabilities', hint: 'Meta والبيانات' },
      { label: 'اكتشاف الحسابات', href: '#entities', hint: 'Meta والبيانات' },
    ],
  });
}
