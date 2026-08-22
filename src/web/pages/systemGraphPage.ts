// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/systemGraphPage.ts
//
//  THE SYSTEM GRAPH — /admin/graph. Three modes, one component, no writes.
//
//  This page hosts `AdlyticGraph` (src/web/pages/systemGraphView.ts) at full
//  size and adds the two things the Control Center preview leaves out: the
//  campaign picker that drives the intelligence-trace mode, and the class
//  filter for working through a large map.
//
//  ── The trace mode is a VIEW, never a second Brain ────────────────────
//
//  Picking a campaign here fetches `/api/admin/graph/trace/:id`, which is a
//  projection of the Brain Observatory's own snapshot onto layer nodes. This
//  page does not decide whether a layer was reached, does not read a metric,
//  and does not hold a threshold. When the Brain says a layer was NOT_REACHED
//  it is drawn dashed with the Brain's own absence reason — never quietly
//  omitted, because a chain missing its unreached links looks complete.
//
//  ── Read-only, structurally ───────────────────────────────────────────
//
//  Every request this page makes is a GET. The only actions in the inspector
//  are links to canonical admin surfaces, which own their own writes and
//  their own authorization. There is no path from this page to a mutation.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';
import { GRAPH_VIEW_CSS, GRAPH_VIEW_JS } from './systemGraphView';

const CSS = `
  .picker { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
  select.inp, input.inp { border: 1px solid var(--border-control); background: var(--surface);
    color: var(--text); border-radius: 7px; padding: 5px 9px; font-size: 12px; font-family: inherit; }
  select.inp:focus-visible, input.inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .stage { display: flex; align-items: center; gap: 8px; padding: 6px 0;
           border-bottom: 1px dotted var(--border); font-size: 11.5px; }
  .stage .ord { font-family: var(--font-mono); color: var(--text-3); font-size: 10px; }
  .stage.no { color: var(--text-3); }
${GRAPH_VIEW_CSS}
`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">خريطة المنظومة</div>
      <div class="phead-s">ما الذي يوجد، وما الذي يعتمد على ماذا، وأين تتدفّق البيانات — بنيةً وتشغيلاً وأثرَ قرار.</div>
    </div>
  </div>
`;

const BODY = `
  <section class="card">
    <div class="card-h">
      <div class="h2">أثر قرار على الخريطة</div>
      <span class="muted">الوضع الثالث يعمل على حملة واحدة</span>
    </div>
    <div class="picker">
      <select class="inp" id="camp"><option value="">— اختر حملة —</option></select>
      <button class="btn" id="btn-trace">اعرض الأثر</button>
      <a class="btn" id="btn-observatory" href="/admin/brain-observatory">افتح مرصد الدماغ</a>
      <span class="muted" id="trace-note">الخريطة تعرض ما خلص إليه الدماغ. لا تحسب شيئاً.</span>
    </div>
    <div id="stages"></div>
  </section>

  <div class="gv" id="gv"></div>
`;

const SCRIPT = `
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var g = window.AdlyticGraph.mount({
    host: 'gv', modes: ['architecture', 'runtime', 'trace'], height: 620,
    onReady: function (snap) {
      // Nodes join the global palette, so Ctrl-K finds a component by name
      // from anywhere in the Control Plane, not only from this page.
      window.adminCommands = snap.nodes.map(function (n) {
        return { label: n.label, href: '/admin/graph?node=' + encodeURIComponent(n.id), hint: n.nodeClass };
      });
      var want = new URLSearchParams(location.search).get('node');
      if (want) g.select(want);
    }
  });

  // Campaign picker — the same list the Brain Observatory offers, from the
  // same route. One list, so the two surfaces can never disagree about which
  // campaigns are inspectable.
  window.adminFetch('/api/admin/brain-observatory/campaigns').then(function (r) {
    var list = (r && (r.campaigns || r.items || r)) || [];
    if (!Array.isArray(list)) list = [];
    var sel = document.getElementById('camp');
    list.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id || c.campaignId || '';
      o.textContent = c.name || c.campaignName || o.value;
      sel.appendChild(o);
    });
    if (!list.length) {
      document.getElementById('trace-note').textContent =
        'لا حملة قابلة للفحص — لا لقطة دماغ مخزّنة بعد.';
    }
  }).catch(function () {
    document.getElementById('trace-note').textContent = 'تعذّر تحميل قائمة الحملات.';
  });

  function renderStages(stages, name) {
    var host = document.getElementById('stages');
    if (!stages || !stages.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="k muted" style="margin-top:10px;">سلسلة ' + esc(name) + '</div>'
      + stages.map(function (s) {
        var reached = s.state === 'REACHED';
        return '<div class="stage' + (reached ? '' : ' no') + '">'
          + '<span class="ord">' + esc(s.ordinal) + '</span>'
          + '<span class="mono">' + esc(s.nodeId.replace('layer:', '')) + '</span>'
          + '<span>' + esc(reached ? (s.conclusion || 'بلا خلاصة نصّية') : (s.absenceReason || 'لم يُبلَغ')) + '</span>'
          + '</div>';
      }).join('');
  }

  document.getElementById('btn-trace').addEventListener('click', function () {
    var id = document.getElementById('camp').value;
    if (!id) return;
    document.getElementById('btn-observatory').href = '/admin/brain-observatory#' + encodeURIComponent(id);
    window.adminFetch('/api/admin/graph/trace/' + encodeURIComponent(id)).then(function (r) {
      if (!r || !r.ok) {
        document.getElementById('trace-note').textContent =
          'تعذّر بناء الأثر: ' + ((r && (r.reason || r.code)) || 'سبب غير معروف');
        renderStages(null);
        return;
      }
      document.getElementById('trace-note').textContent =
        'مصدر الأثر: مرصد الدماغ — القيم منسوخة كما هي.';
      renderStages(r.overlay.stages, r.overlay.campaignName);
      g.loadTrace(id);
    }).catch(function (e) {
      document.getElementById('trace-note').textContent = 'تعذّر بناء الأثر: ' + e.message;
    });
  });
})();
`;

export function systemGraphPage(): string {
  return adminShell({
    active: 'graph',
    title: 'خريطة المنظومة',
    subtitle: 'ما الذي يوجد، وما الذي يعتمد على ماذا، وأين تتدفق البيانات',
    css: CSS,
    header: HEADER,
    body: BODY,
    script: GRAPH_VIEW_JS + SCRIPT,
    commands: [
      { label: 'الوضع: البنية', href: '/admin/graph', hint: 'حقيقة المستودع' },
      { label: 'الوضع: التشغيل', href: '/admin/graph', hint: 'الحالة المرصودة' },
      { label: 'مرصد الدماغ', href: '/admin/brain-observatory', hint: 'الفحص العميق' },
    ],
  });
}
