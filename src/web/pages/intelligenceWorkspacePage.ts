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
  /* The epistemic ladder, ported from the Admin OS. The connector arrow IS
     the argument: each layer rests on the one below, and a break anywhere
     below invalidates everything above it. */
  .ladder { display: flex; flex-direction: column; }
  .rung { border: 1px solid var(--border); border-radius: 11px; background: var(--surface);
          padding: 13px 15px; position: relative; }
  .rung + .rung { margin-top: 21px; }
  .rung + .rung::before { content: '\\2193'; position: absolute; top: -18px; inset-inline-end: 26px;
                          color: var(--text-3); font-size: 15px; }
  .rung-n { font-size: 10px; font-weight: 800; color: var(--text-3); letter-spacing: 0.08em; }
  .rung-t { font-size: 14.5px; font-weight: 800; margin: 3px 0 6px;
            display: flex; align-items: center; gap: 8px; }
  .rung-d { font-size: 12.5px; color: var(--text-2); line-height: 1.7; }
  .rung-ex { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
  .rung-lbl { font-size: 10px; font-weight: 800; color: var(--text-3); letter-spacing: 0.05em; }
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
    <div class="card">
      <div class="card-h"><div class="h2">ما لا نعرفه بعد</div>
        <button class="btn" data-view-jump="boundary">حدود المعرفة</button></div>
      <div class="card-b" id="boundary-brief"><div class="skel"></div></div>
    </div>
  </section>

  <section class="view" id="v-ladder">
    <p class="muted" style="line-height:1.8;margin-bottom:16px;max-width:72ch;">
      كل رقم يعرضه Adlytic يقع على واحدة من أربع طبقات. الخلط بينها هو أصل
      «أنا أشكّ بالأرقام» — فرقمٌ مُلاحَظ ورقمٌ مُستنتَج يبدوان متطابقين على الشاشة
      بينما يستحقان ثقتين مختلفتين تماماً. هذه الصفحة تفصلهما.
    </p>
    <div class="ladder" id="ladder"><div class="skel"></div></div>
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

  var GLYPH = { ok: '●', warn: '▲', bad: '■', absent: '◌' };
  var TONE = {
    HEALTHY: ['ok', 'سليم'], DEGRADED: ['warn', 'متدهور'], WARNING: ['warn', 'يحتاج نظراً'],
    ERROR: ['bad', 'فاشل'], UNKNOWN: ['absent', 'غير معروف'], NOT_TESTED: ['absent', 'لم يُختبر']
  };
  function chip(s) {
    var m = TONE[s] || ['absent', s];
    return '<span class="st-chip st-' + m[0] + '" title="' + esc(s) + '">'
      + '<span class="st-glyph">' + GLYPH[m[0]] + '</span>' + esc(m[1]) + '</span>';
  }

  /**
   * The epistemic ladder — ported from the Admin OS, unchanged in substance.
   *
   * It is the operator-facing form of the chain the acceptance brief names:
   * observed fact → derived signal → interpretation → recommendation. Each
   * rung's state comes from evidence we already hold — a count of fresh
   * accounts from the ops snapshot, narration coverage from platform stats —
   * and the top two rungs stay NOT_TESTED because no live check exists. That
   * is the honest answer, not a gap to paper over, and it is why this belongs
   * beside the knowledge boundary rather than on a status page.
   */
  var LADDER = { ops: null, stats: null };
  function renderLadder() {
    var host = document.getElementById('ladder');
    if (!host) return;
    var o = LADDER.ops, st = LADDER.stats;
    if (!o && !st) return;
    var wss = o ? (o.workspaces || []) : [];
    var fresh = wss.filter(function (w) { return w.data === 'HEALTHY'; }).length;
    var connected = wss.filter(function (w) { return w.adAccountId; }).length;
    var cov = st && st.brain ? st.brain.narrationCoveragePct : null;
    var snaps = st && st.brain ? st.brain.snapshotsLastNDays : 0;

    var rungs = [
      { n: '١ · OBSERVED FACT', t: 'واقعة مرصودة',
        d: 'ما قالته Meta حرفياً، أو ما قرأناه من قاعدة بياناتنا. لا تفسير، لا حساب.',
        state: connected ? (fresh ? 'HEALTHY' : 'WARNING') : 'NOT_TESTED',
        ev: connected ? (fresh + ' من ' + connected + ' حساب ببيانات طازجة')
                      : 'لا حساب إعلاني مرتبط — لا وقائع تُرصَد',
        note: 'المصدر: daily_stats · sync_jobs · ad_accounts' },
      { n: '٢ · DERIVED SIGNAL', t: 'إشارة مشتقّة',
        d: 'ما حسبناه نحن من الوقائع: CTR، التكرار، الاتجاهات. صحيحة حسابياً بقدر صحّة مدخلاتها فقط.',
        state: fresh ? 'HEALTHY' : connected ? 'DEGRADED' : 'NOT_TESTED',
        ev: fresh ? 'تُحسب من الحسابات الطازجة أعلاه'
                  : 'بلا بيانات طازجة تحتها، أي إشارة مشتقّة تصف الماضي لا الحاضر',
        note: 'الاعتماد: كل ما في الطبقة ١' },
      { n: '٣ · INTERPRETATION', t: 'تفسير',
        d: 'حكم النظام على الإشارات: «إرهاق إعلان»، «تشبّع جمهور». هنا يبدأ الاستدلال، وهنا يبدأ احتمال الخطأ.',
        state: 'NOT_TESTED',
        ev: snaps ? (snaps + ' لقطة · تغطية سردية ' + (cov == null ? '—' : cov + '%'))
                  : 'لا لقطات في نافذة الرصد',
        note: 'لا فحص حيّ لصحّة محرّك التفسير — التغطية السردية مؤشر جانبي، لا قياس' },
      { n: '٤ · RECOMMENDATION', t: 'توصية',
        d: 'ما نطلب من التاجر فعله. لا تكون أقوى من التفسير تحتها، ولا التفسير أقوى من إشارته.',
        state: 'NOT_TESTED',
        ev: 'لم تُقَس دقّة التوصيات مقابل نتائج حقيقية',
        note: 'يُحسم بـ: تتبّع أثر التوصيات المطبَّقة — غير مبنيّ' }
    ];

    host.innerHTML = rungs.map(function (r) {
      return '<div class="rung">'
        + '<div class="rung-n">' + esc(r.n) + '</div>'
        + '<div class="rung-t">' + esc(r.t) + chip(r.state) + '</div>'
        + '<div class="rung-d">' + esc(r.d) + '</div>'
        + '<div class="rung-ex"><div class="rung-lbl">ما نعرفه الآن</div>'
        + '<div class="rung-d">' + esc(r.ev) + '</div>'
        + '<div class="muted" style="margin-top:5px;line-height:1.7;">' + esc(r.note) + '</div>'
        + '</div></div>';
    }).join('');
  }

  window.adminFetch('/api/admin/platform-stats').then(function (s) {
    LADDER.stats = s; renderLadder();
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
    LADDER.ops = e.detail; renderLadder();
    var items = e.detail.boundary || [];
    document.getElementById('boundary-brief').innerHTML = items.length
      ? items.slice(0, 3).map(function (b) {
          return '<div class="bnd"><div class="bnd-s">' + esc(b.state) + '</div>'
            + '<div class="bnd-t">' + esc(b.subject) + '</div>'
            + '<div class="bnd-w">' + esc(b.why) + '</div></div>';
        }).join('')
      : '<div class="muted">لا فجوة مسجّلة في هذه اللقطة.</div>';
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
    document.getElementById('ladder').innerHTML =
      '<div class="muted">تعذّر قراءة لقطة التشغيل — لا يمكن وصف الطبقة الأولى، '
      + 'وبدونها لا معنى لحالة الطبقات فوقها.</div>';
    document.getElementById('boundary-brief').innerHTML =
      '<div class="muted">غير متاح — لم تُقرأ اللقطة.</div>';
  });

  document.addEventListener('click', function (e) {
    var j = e.target.closest ? e.target.closest('[data-view-jump]') : null;
    if (j) window.adminShowView(j.getAttribute('data-view-jump'));
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
      { id: 'ladder', label: 'السلّم المعرفي', hint: 'واقعة → إشارة → تفسير → توصية' },
      { id: 'boundary', label: 'حدود المعرفة', hint: 'ما لا نعرفه' },
      { id: 'campaigns', label: 'الحملات', hint: 'قابلة للفحص العميق' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'السلّم المعرفي', href: '#ladder', hint: 'الذكاء' },
      { label: 'حدود المعرفة', href: '#boundary', hint: 'الذكاء' },
      { label: 'مرصد الدماغ', href: '/admin/brain-observatory', hint: 'فحص عميق' },
    ],
  });
}
