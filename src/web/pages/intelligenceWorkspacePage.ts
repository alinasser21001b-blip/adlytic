// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/intelligenceWorkspacePage.ts
//
//  INTELLIGENCE — /admin/intelligence. What Adlytic knows, and what it does not.
//
//  ── Progressive disclosure, in that order ─────────────────────────────
//
//  Operator view first: how much of the platform the Brain has actually
//  reached, and which campaigns are inspectable. Forensic provenance second:
//  the knowledge boundary — every question this platform currently cannot
//  answer, with the mechanism and what would close it. Raw technical detail
//  on demand: the Brain Observatory, full-screen, unchanged.
//
//  ── This page does not simplify away uncertainty ──────────────────────
//
//  The knowledge boundary is a VIEW here, not a footnote. `adminOpsHealth`
//  already emits it as first-class data (`boundary[]`, each item saying
//  whether we tried and failed or never asked, why, and what would resolve
//  it). Burying that under an expander would undo the reason it exists: an
//  operator who can see the edge of the map navigates better than one shown
//  a map with no edge.
//
//  ── And it computes no intelligence ───────────────────────────────────
//
//  Coverage numbers come verbatim from `/api/admin/platform-stats`. The
//  campaign list comes from the Observatory's own route, so this page and the
//  Observatory can never disagree about what is inspectable. Nothing here
//  reconciles, diagnoses, scores or recommends — the deep inspection stays
//  where its authority lives.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  .big { font-family: var(--font-display); font-size: 26px; font-weight: 700; line-height: 1.1; }
  .bnd { border: 1px dashed var(--text-3); border-radius: 9px; padding: 10px 12px; margin-bottom: 9px; }
  .bnd-s { font-size: 9.5px; font-weight: 800; letter-spacing: 0.06em; color: var(--text-3); }
  .bnd-t { font-weight: 700; font-size: 12.5px; margin-top: 3px; }
  .bnd-w { font-size: 11.5px; color: var(--text-2); margin-top: 4px; }
  .bnd-r { font-size: 11.5px; margin-top: 5px; }
  .chain { display: flex; gap: 5px; flex-wrap: wrap; }
  .chain span { border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px;
                font-size: 10.5px; font-family: var(--font-mono); }
  .inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 5px 9px; font-size: 12px; font-family: inherit; }
`;

const BODY = `
  <section class="view on" id="v-overview">
    <div class="grid g3">
      <div class="card"><div class="h2">لقطات الدماغ</div>
        <div class="big mono" id="k-snap">—</div>
        <div class="muted">خلال النافذة التي يقيسها getPlatformStats</div></div>
      <div class="card"><div class="h2">مسرودة</div>
        <div class="big mono" id="k-narr">—</div>
        <div class="muted">لقطات صاغ لها النموذج نصّاً</div></div>
      <div class="card"><div class="h2">تغطية السرد</div>
        <div class="big mono" id="k-cov">—</div>
        <div class="muted" id="k-cov-note"></div></div>
    </div>
    <div class="card">
      <div class="h2">سلسلة الاستدلال</div>
      <div class="muted">الترتيب الرسمي من hierarchy.ts — تتوقّف السلسلة عند أول طبقة تعذّرت.</div>
      <div class="chain">
        <span>DATA_VALIDITY</span><span>SEMANTIC_VALIDITY</span><span>FUNNEL_DIAGNOSIS</span>
        <span>ANOMALY_DETECTION</span><span>HEALTH_IMPACT</span><span>RECOMMENDATION</span>
      </div>
      <div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="/admin/brain-observatory">افتح مرصد الدماغ</a>
        <a class="btn" href="/admin/graph">اعرض الأثر على الخريطة</a>
      </div>
    </div>
  </section>

  <section class="view" id="v-boundary">
    <div class="card">
      <div class="h2">حدود المعرفة</div>
      <div class="muted">ما لا نستطيع تحديده الآن، ولماذا، وما الذي يغلق الفجوة. الغياب معروض، لا مخفيّ.</div>
      <div id="boundary"><div class="skel"></div></div>
    </div>
  </section>

  <section class="view" id="v-campaigns">
    <div class="card">
      <div class="h2">حملات قابلة للفحص</div>
      <div class="muted">القائمة نفسها التي يقرأها المرصد — مصدر واحد، فلا اختلاف بين السطحين.</div>
      <table class="t"><thead><tr><th>الحملة</th><th>المعرّف</th><th></th></tr></thead>
        <tbody id="camps"><tr><td colspan="3" class="empty">جارٍ التحميل…</td></tr></tbody></table>
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

  window.adminFetch('/api/admin/platform-stats').then(function (s) {
    var b = (s && s.brain) || {};
    document.getElementById('k-snap').textContent = b.snapshotsLastNDays != null ? b.snapshotsLastNDays : '—';
    document.getElementById('k-narr').textContent = b.narrationsLastNDays != null ? b.narrationsLastNDays : '—';
    var cov = b.narrationCoveragePct;
    document.getElementById('k-cov').textContent = cov == null ? '—' : (cov + '%');
    document.getElementById('k-cov-note').textContent = cov == null
      ? 'لا لقطات في النافذة — التغطية غير محسوبة، وليست صفراً.'
      : 'محسوبة من اللقطات المخزّنة.';
  }).catch(function (e) {
    document.getElementById('k-cov-note').textContent = 'تعذّر تحميل الإحصاءات: ' + e.message;
  });

  document.addEventListener('ops:ready', function (e) {
    var items = e.detail.boundary || [];
    document.getElementById('boundary').innerHTML = items.length ? items.map(function (b) {
      return '<div class="bnd">'
        + '<div class="bnd-s">' + esc(b.state) + '</div>'
        + '<div class="bnd-t">' + esc(b.subject) + '</div>'
        + '<div class="bnd-w">' + esc(b.why) + '</div>'
        + '<div class="bnd-r">يُغلقها: ' + esc(b.resolvedBy) + '</div>'
        + (b.href ? '<div style="margin-top:7px;"><a class="btn" href="' + esc(b.href) + '">اذهب</a></div>' : '')
        + '</div>';
    }).join('') : '<div class="muted">لا فجوة مسجّلة في هذه اللقطة.</div>';
  });
  document.addEventListener('ops:failed', function () {
    document.getElementById('boundary').innerHTML =
      '<div class="muted">تعذّر قراءة لقطة التشغيل — حدود المعرفة غير متاحة.</div>';
  });

  window.adminFetch('/api/admin/brain-observatory/campaigns').then(function (r) {
    var list = (r && (r.campaigns || r.items || r)) || [];
    if (!Array.isArray(list)) list = [];
    document.getElementById('camps').innerHTML = list.length ? list.map(function (c) {
      var id = c.id || c.campaignId || '';
      return '<tr><td>' + esc(c.name || c.campaignName || id) + '</td>'
        + '<td class="mono">' + esc(id) + '</td>'
        + '<td><a class="btn" href="/admin/brain-observatory#' + encodeURIComponent(id) + '">افحص</a></td></tr>';
    }).join('') : '<tr><td colspan="3" class="empty">لا حملة عليها لقطة دماغ مخزّنة.</td></tr>';
  }).catch(function (e) {
    document.getElementById('camps').innerHTML =
      '<tr><td colspan="3" class="empty">تعذّر: ' + esc(e.message) + '</td></tr>';
  });
})();
`;

export function intelligenceWorkspacePage(): string {
  return adminShell({
    active: 'intelligence',
    title: 'مساحة الذكاء',
    subtitle: 'ماذا تعرف أدلَيتِك، وكيف استنتجت، وماذا قرّرت',
    css: CSS,
    body: BODY,
    views: [
      { id: 'overview', label: 'نظرة المشغّل', hint: 'التغطية والسلسلة' },
      { id: 'boundary', label: 'حدود المعرفة', hint: 'ما لا نعرفه' },
      { id: 'campaigns', label: 'الحملات', hint: 'قابلة للفحص العميق' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'حدود المعرفة', href: '#boundary', hint: 'الذكاء' },
      { label: 'مرصد الدماغ', href: '/admin/brain-observatory', hint: 'فحص عميق' },
    ],
  });
}
