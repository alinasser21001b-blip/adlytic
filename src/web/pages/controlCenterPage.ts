// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/controlCenterPage.ts
//
//  THE CONTROL CENTER — the operator's home, at /admin.
//
//  ── What it replaces and why ──────────────────────────────────────────
//
//  The Admin OS put eleven views behind a sidebar and opened on "الآن", a
//  long diagnostic column. It answered a great deal, but it answered it in
//  the order the DATA arrives, not the order an operator asks. Opening the
//  console at 9am, the first questions are always the same three: is anything
//  broken, does anyone need me, and which customers are affected. Everything
//  else is follow-up.
//
//  So this page is those three, above the fold, and then the follow-ups:
//  what changed recently, what the intelligence layer has been doing, and a
//  live preview of the system map to jump from.
//
//  ── It computes nothing ───────────────────────────────────────────────
//
//  Every value comes from `/api/admin/ops` (adminOpsHealth) or
//  `/api/admin/platform-stats` (getPlatformStats). The ranking of the
//  attention queue uses the severity those services already assigned; there
//  is no score invented here, no threshold, and no health composite. Where a
//  subsystem reports UNKNOWN or NOT_TESTED, the tile says so in the canonical
//  vocabulary rather than rounding it to something calmer.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';
import { GRAPH_VIEW_CSS, GRAPH_VIEW_JS } from './systemGraphView';

const CSS = `
  .pulse { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 9px; }
  .pt { border: 1px solid var(--border); border-radius: 10px; padding: 9px 11px; background: var(--surface); }
  .pt-k { font-size: 9.5px; font-weight: 800; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.06em; }
  .pt-s { margin-top: 5px; }
  .pt-w { font-size: 11px; color: var(--text-2); margin-top: 5px; line-height: 1.45; }
  .pt.absent { border-style: dashed; }
  .row { display: flex; align-items: center; gap: 8px; }
  .risk-name { font-weight: 600; }
  .risk-sub { font-size: 10.5px; color: var(--text-3); }
  .tl { border-inline-start: 2px solid var(--border); padding-inline-start: 12px; }
  .tl-i { padding: 6px 0; border-bottom: 1px dotted var(--border); font-size: 11.5px; }
  .tl-t { color: var(--text-3); font-size: 10.5px; }
${GRAPH_VIEW_CSS}
`;

const BODY = `
  <section class="card">
    <div class="card-h"><div class="h2">نبض المنظومة</div>
      <span class="muted" id="pulse-at">…</span></div>
    <div class="pulse" id="pulse"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
    <div class="muted" id="pulse-unknown"></div>
  </section>

  <div class="grid g2">
    <section class="card">
      <div class="card-h"><div class="h2">ما يحتاج انتباهاً</div>
        <span class="muted" id="att-n"></span></div>
      <div id="attention"><div class="skel"></div></div>
    </section>
    <section class="card">
      <div class="card-h"><div class="h2">مساحات عمل معرّضة</div>
        <a class="btn" href="/admin/customers">كل المساحات</a></div>
      <table class="t"><thead><tr>
        <th>مساحة العمل</th><th>الاتصال</th><th>البيانات</th><th>الخلاصة</th>
      </tr></thead><tbody id="risk"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody></table>
    </section>
  </div>

  <div class="grid g2">
    <section class="card">
      <div class="card-h"><div class="h2">تغيّرات الذكاء</div>
        <a class="btn" href="/admin/intelligence">مساحة الذكاء</a></div>
      <div id="intel"><div class="skel"></div></div>
    </section>
    <section class="card">
      <div class="card-h"><div class="h2">الخط الزمني التشغيلي</div></div>
      <div class="tl" id="timeline"><div class="skel"></div></div>
    </section>
  </div>

  <section class="card">
    <div class="card-h"><div class="h2">خريطة المنظومة</div>
      <a class="btn" href="/admin/graph">الخريطة الكاملة</a></div>
    <div class="gv" id="gv"></div>
  </section>
`;

const SCRIPT = `
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // The canonical vocabulary, rendered — never re-decided. Absence keeps the
  // dashed treatment adminStatus.ts defines; nothing here turns UNKNOWN green.
  var LABEL = {
    HEALTHY: ['ok', 'سليم'], RUNNING: ['ok', 'قيد التشغيل'],
    DEGRADED: ['warn', 'متدهور'], WARNING: ['warn', 'يحتاج نظراً'],
    BLOCKED: ['bad', 'محجوب'], ERROR: ['bad', 'فاشل'],
    UNKNOWN: ['absent', 'غير معروف'], NOT_TESTED: ['absent', 'لم يُختبر']
  };
  var ABSENT = { UNKNOWN: 1, NOT_TESTED: 1 };
  function chip(s) {
    var m = LABEL[s] || ['absent', s];
    var glyph = { ok: '●', warn: '▲', bad: '■', absent: '◌' }[m[0]];
    return '<span class="st-chip st-' + m[0] + '" title="' + esc(s) + '">'
      + '<span class="st-glyph">' + glyph + '</span>' + esc(m[1]) + '</span>';
  }
  var SUBS = {
    database: 'قاعدة البيانات', redis: 'Redis', queue: 'الطوابير',
    workers: 'العمّال', meta: 'Meta', intelligence: 'الذكاء'
  };

  function renderPulse(ops) {
    var host = document.getElementById('pulse');
    var tiles = [];
    // The API tile is evidence, not inference: this page rendered.
    tiles.push({ k: 'الواجهة', s: 'HEALTHY', w: 'تستجيب — هذه الصفحة نفسها دليل ذلك' });
    (ops.subsystems || []).forEach(function (s) {
      tiles.push({ k: SUBS[s.key] || s.key, s: s.status, w: s.summary, d: s.detail });
    });
    var b = ops.build || {};
    tiles.push({
      k: 'النسخة العاملة',
      s: b.commit ? 'HEALTHY' : 'UNKNOWN',
      w: b.commit ? (String(b.commit).slice(0, 7) + ' · ' + (b.environment || 'بيئة غير معلنة'))
                  : 'لم يمكن تحديد الـcommit العامل'
    });
    host.innerHTML = tiles.map(function (t) {
      return '<div class="pt' + (ABSENT[t.s] ? ' absent' : '') + '">'
        + '<div class="pt-k">' + esc(t.k) + '</div>'
        + '<div class="pt-s">' + chip(t.s) + '</div>'
        + '<div class="pt-w">' + esc(t.w) + '</div>'
        + (t.d ? '<div class="pt-w mono">' + esc(t.d) + '</div>' : '')
        + '</div>';
    }).join('');
    document.getElementById('pulse-at').innerHTML = 'محسوبة ' + window.adminTime(ops.computedAt);
    var unknown = ops.unknown || [];
    document.getElementById('pulse-unknown').textContent = unknown.length
      ? ('لم نتمكّن من تحديد: ' + unknown.map(function (u) { return SUBS[u] || u; }).join('، ')
         + ' — وهذا ليس ادّعاءً بالسلامة.')
      : '';
  }

  function renderAttention(ops) {
    // Rank by the severity the service already assigned. No new scoring.
    var RANK = { ERROR: 0, WARNING: 1, INFO: 2 };
    var items = (ops.attention || []).slice().sort(function (a, b) {
      return (RANK[a.severity] === undefined ? 3 : RANK[a.severity])
           - (RANK[b.severity] === undefined ? 3 : RANK[b.severity]);
    });
    document.getElementById('att-n').textContent = items.length ? (items.length + ' بند') : '';
    document.getElementById('attention').innerHTML = items.length ? items.map(function (a) {
      return '<div class="att sev-' + esc(a.severity) + '">'
        + '<div class="att-t">' + esc(a.title) + '</div>'
        + '<div class="att-w">' + esc(a.because) + '</div>'
        + (a.href ? '<div style="margin-top:7px;"><a class="btn" href="' + esc(a.href) + '">'
            + esc(a.action || 'افتح') + '</a></div>' : '')
        + '</div>';
    }).join('') : '<div class="muted" style="padding:18px;text-align:center;">لا شيء يحتاج تدخّلاً الآن.</div>';
  }

  function renderRisk(ops) {
    var rows = (ops.workspaces || []).filter(function (w) { return w.overall !== 'HEALTHY'; });
    var body = document.getElementById('risk');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">لا مساحة عمل خارج الحالة السليمة.</td></tr>';
      return;
    }
    var RANK = { ERROR: 0, BLOCKED: 1, WARNING: 2, DEGRADED: 3, UNKNOWN: 4, NOT_TESTED: 5 };
    rows.sort(function (a, b) {
      return (RANK[a.overall] === undefined ? 9 : RANK[a.overall])
           - (RANK[b.overall] === undefined ? 9 : RANK[b.overall]);
    });
    body.innerHTML = rows.map(function (w) {
      return '<tr>'
        + '<td><div class="risk-name">' + esc(w.workspaceName) + '</div>'
        + '<div class="risk-sub">' + esc(w.adAccountName || 'لا حساب إعلاني') + '</div></td>'
        + '<td>' + chip(w.connection) + '</td>'
        + '<td>' + chip(w.data)
        + (w.dataAgeDays != null ? ' <span class="muted mono">' + w.dataAgeDays + 'ي</span>' : '') + '</td>'
        + '<td>' + esc(w.headline) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderTimeline(ops) {
    var items = (ops.activity || []);
    document.getElementById('timeline').innerHTML = items.length ? items.map(function (a) {
      return '<div class="tl-i"><div class="tl-t">' + window.adminTime(a.at) + '</div>'
        + esc(a.workspaceName) + ' · ' + esc(a.kind) + ' · ' + esc(a.status)
        + (a.detail ? ' — <span class="muted">' + esc(a.detail) + '</span>' : '') + '</div>';
    }).join('') : '<div class="muted">لا نشاط مسجّل.</div>';
  }

  function renderIntel(stats) {
    var host = document.getElementById('intel');
    var brain = stats && stats.brain;
    if (!brain) { host.innerHTML = '<div class="muted">لا إحصاءات ذكاء متاحة.</div>'; return; }
    // Displayed verbatim from getPlatformStats. This page does not compute
    // coverage, and does not turn a missing snapshot into a zero.
    var cov = brain.narrationCoveragePct;
    host.innerHTML =
      '<div class="row" style="gap:16px;flex-wrap:wrap;">'
      + '<div><div class="muted">لقطات الدماغ</div><div style="font-size:19px;font-weight:700;" class="mono">'
        + esc(brain.snapshotsLastNDays != null ? brain.snapshotsLastNDays : '—') + '</div></div>'
      + '<div><div class="muted">مسرودة</div><div style="font-size:19px;font-weight:700;" class="mono">'
        + esc(brain.narrationsLastNDays != null ? brain.narrationsLastNDays : '—') + '</div></div>'
      + '<div><div class="muted">تغطية السرد</div><div style="font-size:19px;font-weight:700;" class="mono">'
        + (cov == null ? '—' : esc(cov) + '%') + '</div></div>'
      + '</div>'
      + (cov == null ? '<div class="muted">لا لقطات في النافذة — التغطية غير محسوبة، لا صفر.</div>' : '');
  }

  document.addEventListener('ops:ready', function (e) {
    var ops = e.detail;
    renderPulse(ops); renderAttention(ops); renderRisk(ops); renderTimeline(ops);
  });
  // Every region fed by the ops snapshot needs its own failure state. The
  // acceptance audit caught two skeletons here still animating after the
  // request had already failed — a spinner that never resolves tells the
  // operator "loading" forever, which is worse than an error.
  document.addEventListener('ops:failed', function () {
    var why = '<div class="muted" style="padding:14px;text-align:center;">'
      + 'تعذّر قراءة لقطة التشغيل — هذه اللوحة غير متاحة الآن.</div>';
    document.getElementById('pulse').innerHTML =
      '<div class="muted">تعذّر قراءة حالة التشغيل — لا يمكن عرض النبض.</div>';
    document.getElementById('pulse-at').textContent = '';
    document.getElementById('attention').innerHTML = why;
    document.getElementById('timeline').innerHTML = why;
    document.getElementById('risk').innerHTML =
      '<tr><td colspan="4" class="empty">غير متاح — تعذّر قراءة لقطة التشغيل</td></tr>';
  });

  window.adminFetch('/api/admin/platform-stats').then(renderIntel).catch(function () {
    document.getElementById('intel').innerHTML = '<div class="muted">تعذّر تحميل إحصاءات المنصة.</div>';
  });

  // Compact: the preview opens on the infrastructure spine rather than all
  // 135 nodes. A thumbnail of the whole graph is unreadable at this size, and
  // an unreadable picture on the home page is decoration.
  window.AdlyticGraph.mount({ host: 'gv', modes: ['architecture', 'runtime'], height: 330, compact: true });
})();
`;

export function controlCenterPage(): string {
  return adminShell({
    active: 'control-center',
    title: 'الحالة الآن',
    subtitle: 'ما الذي يحدث في المنصة هذه اللحظة',
    css: CSS,
    body: BODY,
    script: GRAPH_VIEW_JS + SCRIPT,
    commands: [
      { label: 'خريطة المنظومة', href: '/admin/graph', hint: 'الوضع: البنية' },
      { label: 'Admin OS (الواجهة السابقة)', href: '/admin/os', hint: 'إرث' },
    ],
  });
}
