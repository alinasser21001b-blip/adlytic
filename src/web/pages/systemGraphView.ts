// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/systemGraphView.ts
//
//  ONE GRAPH COMPONENT. THREE MODES. NO SECOND ENGINE.
//
//  ── Why one component and not three ───────────────────────────────────
//
//  Architecture, runtime and intelligence-trace are three QUESTIONS about
//  the same system, not three systems. Three renderers would drift: nodes
//  would be laid out differently, an edge present in one would be missing in
//  another, and the operator would have to re-learn the picture each time
//  they changed question. Worse, the runtime view would start growing its own
//  idea of what depends on what — and then there would be two answers.
//
//  So: ONE snapshot, ONE layout, and a mode that only changes how nodes are
//  PAINTED. Switching modes never re-lays-out, never adds a node, and never
//  removes an edge.
//
//  ── What the acceptance audit found, and what changed because of it ───
//
//  Rendered at 1680px with the real 135-node graph, the first version was
//  DECORATIVE. Thirty-nine API routes truncated to `_GET /api/admin/c`,
//  `_GET /api/admin/brai` — indistinguishable. Two hundred and seventy-five
//  edges drew as one pale hairball. There was no way to find a node, no way
//  to hide a class, and no way to answer "which systems depend on Redis?"
//  without tracing threads by eye.
//
//  A picture nobody can read is worse than a table, because it looks like
//  understanding. So this version adds exactly the controls that turn it
//  back into an instrument, and nothing else:
//
//   · SEARCH, because 135 nodes is past what a person scans.
//   · CLASS FILTERS, because hiding the routes is how the architecture
//     becomes visible.
//   · A STATUS FILTER in runtime mode, which is literally the question
//     "what is unhealthy?" expressed as a control.
//   · FOCUS, which isolates a node and its neighbours — the only way to
//     answer a dependency question on a dense graph.
//   · TAIL-BIASED LABELS, because the distinguishing part of
//     `GET /api/admin/graph/runtime` is the end, and the head is what every
//     sibling shares.
//   · PRESET QUESTIONS, which are saved filter+focus states, not new logic.
//   · An INSPECTOR DRAWER instead of a permanently empty side column.
//
//  Deliberately NOT added: minimap, edge labels, force layout, animation on
//  load, clustering. Each would add motion or chrome without answering an
//  operator question, and the layout must stay deterministic — an operator
//  comparing today's graph with yesterday's screenshot needs the same node in
//  the same place.
//
//  ── The read-only guarantee, in the component ─────────────────────────
//
//  This component issues GET requests and nothing else. No form, no POST,
//  no PATCH, no DELETE. Clicking a node opens an inspector; the inspector's
//  only actions are LINKS to canonical admin surfaces that own their own
//  writes. The graph observes and navigates.
// ════════════════════════════════════════════════════════════════════════

export const GRAPH_VIEW_CSS = `
  .gv { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
        background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }
  .gv-bar { display: flex; align-items: center; gap: 7px; padding: 8px 10px; flex-wrap: wrap;
            border-bottom: 1px solid var(--border); background: var(--surface); }
  .gv-modes { display: inline-flex; border: 1px solid var(--border-control); border-radius: 8px; overflow: hidden; }
  .gv-mode { padding: 4px 12px; font-size: 11.5px; font-weight: 600; background: none; border: 0;
             color: var(--text-3); cursor: pointer; font-family: inherit; }
  .gv-mode.on { background: var(--accent-dim); color: var(--accent-2); }
  .gv-mode:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .gv-search { border: 1px solid var(--border-control); background: var(--bg); color: var(--text);
               border-radius: 7px; padding: 4px 9px; font-size: 11.5px; font-family: inherit; width: 190px; }
  .gv-search:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .gv-note { font-size: 11px; color: var(--text-3); }
  .gv-err { color: var(--error); font-size: 12px; font-weight: 600; }

  .gv-filters { display: flex; gap: 5px; padding: 7px 10px; flex-wrap: wrap;
                border-bottom: 1px solid var(--border); background: var(--bg); }
  .gv-chip { border: 1px solid var(--border-control); background: var(--surface); color: var(--text-3);
             border-radius: 999px; padding: 2px 9px; font-size: 10.5px; font-weight: 600;
             cursor: pointer; font-family: inherit; white-space: nowrap; }
  .gv-chip.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-2); }
  .gv-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .gv-chip .n { opacity: 0.65; margin-inline-start: 4px; font-family: var(--font-mono); font-size: 9.5px; }
  .gv-ask { display: flex; gap: 5px; padding: 7px 10px; flex-wrap: wrap; align-items: center;
            border-bottom: 1px solid var(--border); background: var(--bg); }
  .gv-ask-k { font-size: 9.5px; font-weight: 800; color: var(--text-3); letter-spacing: 0.05em;
              text-transform: uppercase; margin-inline-end: 3px; }
  .gv-ask button { border: 1px dashed var(--border-2); background: none; color: var(--text-2);
                   border-radius: 7px; padding: 3px 9px; font-size: 11px; cursor: pointer;
                   font-family: inherit; }
  .gv-ask button:hover { border-style: solid; border-color: var(--accent); color: var(--accent-2); }
  .gv-ask button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* The stage scrolls; the graph does not shrink to fit it.
     Squeezing 135 nodes into a fixed panel scaled labels to 5.9px — legible
     as shapes, unreadable as information. The graph now renders at its
     natural size and the panel scrolls, which also makes the filters do real
     work: hiding a class visibly shortens the map. */
  .gv-stage { position: relative; background: var(--bg); overflow: auto; }
  .gv-canvas { display: block; width: 100%; touch-action: none; cursor: grab; }
  .gv-canvas.drag { cursor: grabbing; }
  .gv-node rect { stroke-width: 1.2px; }
  /*
    A node label is one of two things and they need opposite treatment.
    An identifier (adminConsole.ts, GET /api/admin/ops, AdAccount) is mono and
    LTR — that is the project's rule and it is right. An Arabic NAME («خدمة
    الواجهة») is prose, and forcing prose into a monospace face pins every
    glyph to a fixed advance: the cursive joins stretch and words visibly come
    apart. Which one a label is comes from the label itself, below.
  */
  .gv-node text { fill: var(--text-2); pointer-events: none;
                  font-family: var(--font-body); direction: rtl; }
  .gv-node text.id { font-family: var(--font-mono); direction: ltr; }
  .gv-node.sel rect { stroke: var(--accent); stroke-width: 2.4px; }
  .gv-node.hit rect { stroke: var(--accent-2); stroke-width: 2px; }
  .gv-node.dim { opacity: 0.13; }
  .gv-edge { fill: none; stroke: var(--gridline); stroke-width: 1px; }
  .gv-edge.hot { stroke: var(--accent); stroke-width: 1.8px; }
  .gv-edge.dim { opacity: 0.05; }
  .gv-col { font-family: var(--font-body); font-size: 10px; fill: var(--text-3); font-weight: 700; }
  .gv-blank { padding: 46px 20px; text-align: center; color: var(--text-3); font-size: 12.5px; }

  .gv-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: var(--text-3);
               padding: 7px 10px; border-top: 1px solid var(--border); background: var(--surface); }
  .gv-key { display: inline-flex; align-items: center; gap: 4px; }
  .gv-sw { width: 9px; height: 9px; border-radius: 2px; display: inline-block; border: 1px solid var(--border-2); }

  /* Inspector — a drawer over the stage, not a permanently empty column. */
  .gvi { position: absolute; inset-block: 0; inset-inline-start: 0; width: min(370px, 88%);
         background: var(--surface); border-inline-end: 1px solid var(--border);
         box-shadow: var(--shadow-lg); overflow-y: auto; padding: 13px; font-size: 12px;
         transform: translateX(var(--gvi-out, -100%)); transition: transform 170ms ease; }
  html[dir="rtl"] .gvi { --gvi-out: 100%; }
  .gvi.open { transform: translateX(0); }
  .gvi h3 { font-size: 13.5px; font-weight: 700; margin-bottom: 2px; }
  .gvi .k { font-size: 9.5px; font-weight: 800; color: var(--text-3); text-transform: uppercase;
            letter-spacing: 0.06em; margin-top: 12px; }
  .gvi ul { list-style: none; margin-top: 3px; }
  .gvi li { padding: 3px 0; border-bottom: 1px dotted var(--border); }
  .gvi li button { background: none; border: 0; color: inherit; font: inherit; cursor: pointer;
                   padding: 0; text-align: start; }
  .gvi li button:hover { color: var(--accent-2); text-decoration: underline; }
  .gvi .unk { border: 1px dashed var(--text-3); border-radius: 7px; padding: 8px 10px;
              color: var(--text-3); font-size: 11.5px; }
  .gvi-x { position: absolute; inset-block-start: 9px; inset-inline-end: 9px; }
  .gvi-state { border-radius: 7px; padding: 8px 10px; font-size: 11.5px; }
  .gvi-state.ok  { background: var(--success-dim); color: var(--success); }
  .gvi-state.bad { background: var(--error-dim); color: var(--error); }
  .gvi-state.warn{ background: var(--warning-dim); color: var(--warning); }
  .gvi-state.absent { border: 1px dashed var(--text-3); color: var(--text-3); }
`;

/**
 * The browser component.
 *
 * `AdlyticGraph.mount(opts)` renders into a host element. `opts.modes` picks
 * which of the three questions the surface offers — the Control Center
 * preview offers architecture and runtime; the full page offers all three.
 * There is still only one implementation.
 */
export const GRAPH_VIEW_JS = `
window.AdlyticGraph = (function () {
  var PAD = 34, NODE_W = 152, NODE_H = 20, ROW_GAP = 5, COL_GAP = 34;

  // Columns read left-to-right as the system's own direction of flow:
  // what Meta gives us, what crosses the cordon, what reasons over it,
  // where it is stored, what serves it, what an operator sees.
  var COLUMN = {
    META_CAPABILITY: 0, META_ENTITY: 0,
    SERVICE: 1, QUEUE: 1, DEPLOYMENT_SERVICE: 1,
    ENGINE: 2, INTELLIGENCE_LAYER: 2,
    DB_MODEL: 3, PERSISTENCE_OWNER: 3, WORKSPACE: 3,
    API_ROUTE: 4,
    PAGE: 5
  };
  var COL_LABEL = ['Meta', 'خدمات وبنية', 'محرّكات وطبقات', 'تخزين', 'مسارات', 'أسطح'];
  var CLASS_AR = {
    META_CAPABILITY: 'قدرة Meta', META_ENTITY: 'كيان Meta', SERVICE: 'خدمة',
    QUEUE: 'طابور', DEPLOYMENT_SERVICE: 'خدمة منشورة', ENGINE: 'محرّك',
    INTELLIGENCE_LAYER: 'طبقة ذكاء', DB_MODEL: 'نموذج', PERSISTENCE_OWNER: 'مالك تخزين',
    WORKSPACE: 'مساحة عمل', API_ROUTE: 'مسار', PAGE: 'سطح'
  };
  var CLASS_FILL = {
    META_CAPABILITY: 'var(--series-1)', META_ENTITY: 'var(--series-1)',
    SERVICE: 'var(--series-2)', QUEUE: 'var(--series-3)', DEPLOYMENT_SERVICE: 'var(--series-3)',
    ENGINE: 'var(--series-4)', INTELLIGENCE_LAYER: 'var(--series-5)',
    DB_MODEL: 'var(--series-6)', PERSISTENCE_OWNER: 'var(--series-6)', WORKSPACE: 'var(--series-6)',
    API_ROUTE: 'var(--series-2)', PAGE: 'var(--accent)'
  };
  // Runtime palette. UNKNOWN / NOT_TESTED / NOT_CONFIGURED are deliberately
  // NEITHER green NOR red: they are absence, and they are drawn dashed.
  var RUNTIME_FILL = {
    HEALTHY: 'var(--success)', DEGRADED: 'var(--warning)', FAILED: 'var(--error)',
    UNKNOWN: 'transparent', NOT_TESTED: 'transparent', NOT_CONFIGURED: 'transparent'
  };
  var ABSENT = { UNKNOWN: 1, NOT_TESTED: 1, NOT_CONFIGURED: 1 };
  var RUNTIME_AR = {
    HEALTHY: 'سليم', DEGRADED: 'متدهور', FAILED: 'فاشل',
    UNKNOWN: 'غير معروف', NOT_TESTED: 'لم يُختبر', NOT_CONFIGURED: 'غير مضبوط'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Labels that stay distinguishable.
   *
   * Every admin route starts '/api/admin/', so head-truncation turned
   * thirty-nine of them into the same illegible stub. The end is what tells
   * them apart, so the end is what survives.
   */
  /**
   * Is this label an identifier or a name?
   *
   * Derived from the text, not from the node class: the same class carries
   * both (a MODULE is adminConsole.ts, a SERVICE is «خدمة الواجهة»), and a
   * hand-kept class list would go stale the first time either side gained a
   * member. Any Arabic letter means prose; everything else is an identifier
   * and keeps the mono, LTR treatment the rest of the product gives them.
   */
  function isIdentifier(text) {
    return !/[\u0600-\u06FF]/.test(String(text || ''));
  }

  function shortLabel(n, max) {
    var s = n.label;
    max = max || 21;
    if (s.length <= max) return s;
    if (n.nodeClass === 'API_ROUTE') {
      var parts = s.split(' ');
      var verb = parts.length > 1 ? parts[0] + ' ' : '';
      var path = parts.length > 1 ? parts.slice(1).join(' ') : s;
      var tail = path.replace('/api/admin', '');
      if ((verb + tail).length <= max) return verb + tail;
      return verb + '…' + tail.slice(-(max - verb.length - 1));
    }
    return '…' + s.slice(-(max - 1));
  }

  function mount(opts) {
    var host = typeof opts.host === 'string' ? document.getElementById(opts.host) : opts.host;
    if (!host) return null;
    var modes = opts.modes || ['architecture'];
    var compact = !!opts.compact;
    var uid = host.id;
    var S = {
      mode: modes[0], snapshot: null, runtime: null, trace: null,
      selected: null, focus: false, query: '', hidden: {}, statusFilter: null,
      pos: {}, visible: {}, view: { x: 0, y: 0, k: 1 }, W: 1200, H: 640
    };

    host.innerHTML =
      '<div class="gv-bar">'
      + '<div class="gv-modes">' + modes.map(function (m) {
          return '<button class="gv-mode' + (m === S.mode ? ' on' : '') + '" data-mode="' + m + '">'
            + ({ architecture: 'البنية', runtime: 'التشغيل', trace: 'أثر القرار' }[m] || m) + '</button>';
        }).join('') + '</div>'
      + '<input class="gv-search" id="' + uid + '-q" placeholder="ابحث في العقد…" aria-label="ابحث في عقد الخريطة" />'
      + '<button class="gv-chip" data-act="focus" id="' + uid + '-focus" title="اعرض العقدة المختارة وجيرانها فقط">عزل الجوار</button>'
      + '<span class="gv-note" id="' + uid + '-note">جارٍ التحميل…</span>'
      + '<span style="flex:1"></span>'
      + '<button class="btn" data-zoom="in" aria-label="تكبير">+</button>'
      + '<button class="btn" data-zoom="out" aria-label="تصغير">−</button>'
      + '<button class="btn" data-zoom="fit">ملء</button>'
      + '<button class="btn" data-act="reset">إعادة ضبط</button>'
      + '</div>'
      + (compact ? '' : '<div class="gv-ask" id="' + uid + '-ask"></div>')
      + '<div class="gv-filters" id="' + uid + '-filters"></div>'
      + '<div class="gv-stage" id="' + uid + '-stage">'
      + '<svg class="gv-canvas" id="' + uid + '-svg" role="img" aria-label="خريطة المنظومة"></svg>'
      + '<aside class="gvi" id="' + uid + '-insp" aria-label="تفاصيل العقدة"></aside>'
      + '</div>'
      + '<div class="gv-legend" id="' + uid + '-legend"></div>';

    var svg = document.getElementById(uid + '-svg');
    var stage = document.getElementById(uid + '-stage');
    var note = document.getElementById(uid + '-note');
    var legend = document.getElementById(uid + '-legend');
    var filters = document.getElementById(uid + '-filters');
    var insp = document.getElementById(uid + '-insp');
    var ask = document.getElementById(uid + '-ask');
    var maxH = opts.height || 560;
    stage.style.maxHeight = maxH + 'px';

    function fail(msg) {
      // A malformed or unavailable graph degrades THIS panel and nothing else.
      // The surrounding console keeps working — that is the point of an
      // operations surface: the screen you use to find out what is broken must
      // not be the screen that breaks.
      svg.setAttribute('height', '0');
      stage.style.maxHeight = '';
      stage.innerHTML = '<div class="gv-blank">' + esc(msg)
        + '<div style="margin-top:8px;font-size:11.5px;">بقية لوحة التحكّم تعمل — هذه اللوحة وحدها متعذّرة.</div></div>';
      note.innerHTML = '<span class="gv-err">الخريطة غير متاحة</span>';
      legend.innerHTML = '';
      filters.innerHTML = '';
      if (ask) ask.innerHTML = '';
    }

    // ── Which nodes are on screen right now ──────────────────────────
    function matchesQuery(n) {
      if (!S.query) return true;
      var q = S.query.toLowerCase();
      return (n.label + ' ' + n.id + ' ' + n.nodeClass + ' ' + n.owner + ' ' + n.what)
        .toLowerCase().indexOf(q) >= 0;
    }
    function neighbours(id) {
      var set = {};
      S.snapshot.edges.forEach(function (e) {
        if (e.from === id) set[e.to] = 1;
        if (e.to === id) set[e.from] = 1;
      });
      set[id] = 1;
      return set;
    }
    function computeVisible() {
      var near = (S.focus && S.selected) ? neighbours(S.selected) : null;
      var vis = {};
      S.snapshot.nodes.forEach(function (n) {
        if (S.hidden[n.nodeClass]) return;
        if (near && !near[n.id]) return;
        if (S.statusFilter && S.mode === 'runtime') {
          var r = S.runtime && S.runtime.index[n.id];
          var st = r ? r.state : 'UNKNOWN';
          if (S.statusFilter === 'PROBLEM' && (st === 'HEALTHY')) return;
          if (S.statusFilter === 'ABSENT' && !ABSENT[st]) return;
        }
        vis[n.id] = 1;
      });
      S.visible = vis;
    }

    /**
     * Deterministic: column by class, row by stable sort within the column.
     *
     * EMPTY COLUMNS COLLAPSE. The first version always reserved all six, so a
     * filtered view — the compact home-page preview, or "where does Meta data
     * enter?" — laid three columns of content across six columns of width and
     * the viewBox scaled every node down to a few unreadable pixels. A picture
     * nobody can read is worse than a table, because it still looks like
     * understanding. Column ORDER never changes, so a node keeps its place
     * relative to its neighbours and two screenshots stay comparable.
     */
    function layout() {
      var cols = [[], [], [], [], [], []];
      S.snapshot.nodes.forEach(function (n) {
        if (!S.visible[n.id]) return;
        var c = COLUMN[n.nodeClass];
        cols[c === undefined ? 1 : c].push(n);
      });
      var used = [];
      cols.forEach(function (list, ci) { if (list.length) used.push(ci); });
      if (!used.length) { S.pos = {}; S.cols = cols; S.usedCols = []; return; }

      var tallest = Math.max(1, Math.max.apply(null, cols.map(function (c) { return c.length; })));
      S.H = Math.max(240, PAD * 2 + tallest * (NODE_H + ROW_GAP));
      S.W = PAD * 2 + used.length * NODE_W + (used.length - 1) * COL_GAP;
      var pos = {};
      used.forEach(function (ci, slot) {
        var list = cols[ci];
        list.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
        var span = list.length * (NODE_H + ROW_GAP);
        var top = PAD + (S.H - PAD * 2 - span) / 2;
        list.forEach(function (n, ri) {
          pos[n.id] = { x: PAD + slot * (NODE_W + COL_GAP) + NODE_W / 2,
                        y: top + ri * (NODE_H + ROW_GAP) + NODE_H / 2, col: ci };
        });
      });
      S.pos = pos;
      S.cols = cols;
      S.usedCols = used;
    }

    function nodeFill(n) {
      if (S.mode === 'runtime') {
        var r = S.runtime && S.runtime.index[n.id];
        return r ? (RUNTIME_FILL[r.state] || 'transparent') : 'transparent';
      }
      if (S.mode === 'trace') {
        var t = S.trace && S.trace.index[n.id];
        return t && t.state === 'REACHED' ? 'var(--accent)' : 'transparent';
      }
      return CLASS_FILL[n.nodeClass] || 'var(--text-3)';
    }
    function nodeDashed(n) {
      if (S.mode === 'runtime') {
        var r = S.runtime && S.runtime.index[n.id];
        return !r || !!ABSENT[r.state];
      }
      if (S.mode === 'trace') {
        var t = S.trace && S.trace.index[n.id];
        return !t || t.state !== 'REACHED';
      }
      return false;
    }

    function paintNote() {
      var shown = Object.keys(S.visible).length;
      var total = S.snapshot.nodes.length;
      var bits = [shown === total ? (total + ' عقدة') : (shown + ' من ' + total + ' عقدة')];
      if (S.snapshot.repositoryCommit) bits.push('commit ' + String(S.snapshot.repositoryCommit).slice(0, 7));
      if (S.mode === 'runtime') {
        bits.push(S.runtime ? ('حالة مرصودة لـ' + S.runtime.states.length + ' عقدة')
                            : 'لا لقطة تشغيل — كل شيء غير معروف');
      }
      if (S.mode === 'trace') bits.push(S.trace ? ('حملة: ' + S.trace.campaignName) : 'لم تُختَر حملة');
      note.textContent = bits.join(' · ');
    }

    function paintFilters() {
      var counts = {};
      S.snapshot.nodes.forEach(function (n) { counts[n.nodeClass] = (counts[n.nodeClass] || 0) + 1; });
      var chips = Object.keys(counts).sort().map(function (c) {
        return '<button class="gv-chip' + (S.hidden[c] ? '' : ' on') + '" data-class="' + c + '">'
          + esc(CLASS_AR[c] || c) + '<span class="n">' + counts[c] + '</span></button>';
      });
      if (S.mode === 'runtime') {
        chips.push('<span style="width:10px"></span>');
        chips.push('<button class="gv-chip' + (S.statusFilter === 'PROBLEM' ? ' on' : '')
          + '" data-status="PROBLEM">ما ليس سليماً</button>');
        chips.push('<button class="gv-chip' + (S.statusFilter === 'ABSENT' ? ' on' : '')
          + '" data-status="ABSENT">غير محدّد</button>');
      }
      filters.innerHTML = chips.join('');
    }

    // Saved filter+focus states. No new logic — each one is a control
    // combination an operator could set by hand, named after the question it
    // answers so they do not have to know which combination that is.
    var ASKS = [
      { q: 'أين تدخل بيانات Meta؟', run: function () {
          S.hidden = only(['META_CAPABILITY', 'META_ENTITY', 'SERVICE']); S.query = ''; S.focus = false; } },
      { q: 'أين تُخزَّن؟', run: function () {
          S.hidden = only(['DB_MODEL', 'PERSISTENCE_OWNER', 'WORKSPACE', 'SERVICE']); S.query = ''; S.focus = false; } },
      { q: 'من يملك التشخيص والتوصية؟', run: function () {
          S.hidden = only(['INTELLIGENCE_LAYER', 'ENGINE']); S.query = ''; S.focus = false; } },
      { q: 'ما الذي يعتمد على Redis؟', run: function () {
          S.hidden = {}; S.query = ''; S.selected = 'deploy:redis'; S.focus = true; } },
      { q: 'ما الذي يعتمد على العمّال؟', run: function () {
          S.hidden = {}; S.query = ''; S.selected = 'deploy:worker'; S.focus = true; } },
      { q: 'ما حدود الصلاحية؟', run: function () {
          S.hidden = {}; S.query = ''; S.selected = 'service:platform-admin-guard'; S.focus = true; } },
      { q: 'أي أسطح إدارية تراقب هذا؟', run: function () {
          S.hidden = only(['PAGE', 'API_ROUTE']); S.query = ''; S.focus = false; } }
    ];
    function only(keep) {
      var h = {};
      Object.keys(CLASS_AR).forEach(function (c) { if (keep.indexOf(c) < 0) h[c] = 1; });
      return h;
    }
    function paintAsk() {
      if (!ask) return;
      ask.innerHTML = '<span class="gv-ask-k">اسأل الخريطة</span>'
        + ASKS.map(function (a, i) { return '<button data-ask="' + i + '">' + esc(a.q) + '</button>'; }).join('');
    }

    function paintLegend() {
      if (S.mode === 'runtime') {
        legend.innerHTML = ['HEALTHY', 'DEGRADED', 'FAILED', 'UNKNOWN', 'NOT_TESTED', 'NOT_CONFIGURED']
          .map(function (s) {
            var style = ABSENT[s] ? 'background:transparent;border:1px dashed var(--text-3);'
                                  : 'background:' + RUNTIME_FILL[s] + ';';
            return '<span class="gv-key"><span class="gv-sw" style="' + style + '"></span>'
              + esc(RUNTIME_AR[s]) + '</span>';
          }).join('')
          + '<span class="gv-key" style="margin-inline-start:auto;">الغياب مرسوم متقطّعاً — لا أخضر ولا أحمر</span>';
      } else if (S.mode === 'trace') {
        legend.innerHTML =
          '<span class="gv-key"><span class="gv-sw" style="background:var(--accent);"></span>شارك في القرار</span>'
          + '<span class="gv-key"><span class="gv-sw" style="background:transparent;border:1px dashed var(--text-3);"></span>لم يُبلَغ</span>'
          + '<span class="gv-key" style="margin-inline-start:auto;">الخريطة تعرض ما خلص إليه الدماغ — ولا تحسب شيئاً</span>';
      } else {
        legend.innerHTML = COL_LABEL.map(function (l, i) {
          return '<span class="gv-key">' + (i + 1) + '. ' + esc(l) + '</span>';
        }).join('');
      }
    }

    function render() {
      if (!S.snapshot) return;
      computeVisible();
      layout();
      var shown = Object.keys(S.visible).length;
      if (shown === 0) {
        svg.innerHTML = '';
        svg.setAttribute('height', '0');
        svg.removeAttribute('width');
        var why = S.snapshot.nodes.length === 0
          ? 'الخريطة فارغة — لا عقد في هذه اللقطة.'
          : 'لا عقدة تطابق البحث أو المرشّحات الحالية.';
        stage.querySelector('.gv-blank') || stage.insertAdjacentHTML('beforeend',
          '<div class="gv-blank">' + why + '</div>');
        var b = stage.querySelector('.gv-blank'); if (b) b.textContent = why;
        paintNote(); paintFilters(); paintLegend();
        return;
      }
      var b0 = stage.querySelector('.gv-blank'); if (b0) b0.remove();
      // Natural scale: the SVG is as tall as its content, and the stage
      // scrolls. Zoom stays available for deliberate scaling; it is no longer
      // the only thing standing between the operator and a readable label.
      svg.setAttribute('viewBox', '0 0 ' + S.W + ' ' + S.H);
      svg.setAttribute('height', String(Math.round(S.H * S.view.k)));
      svg.setAttribute('width', String(Math.round(S.W * S.view.k)));
      svg.style.minWidth = '100%';

      var near = S.selected ? neighbours(S.selected) : null;
      var hits = {};
      if (S.query) S.snapshot.nodes.forEach(function (n) { if (matchesQuery(n)) hits[n.id] = 1; });

      var parts = ['<g transform="translate(' + S.view.x + ',' + S.view.y + ') scale(' + S.view.k + ')">'];
      (S.usedCols || []).forEach(function (ci, slot) {
        var x = PAD + slot * (NODE_W + COL_GAP) + NODE_W / 2;
        parts.push('<text class="gv-col" x="' + x + '" y="' + (PAD - 12) + '" text-anchor="middle">'
          + esc(COL_LABEL[ci]) + '</text>');
      });

      S.snapshot.edges.forEach(function (e) {
        var a = S.pos[e.from], c = S.pos[e.to];
        if (!a || !c) return;
        var hot = S.selected && (e.from === S.selected || e.to === S.selected);
        var dim = near && !hot;
        var mx = (a.x + c.x) / 2;
        parts.push('<path class="gv-edge' + (hot ? ' hot' : '') + (dim ? ' dim' : '') + '" d="M'
          + a.x + ',' + a.y + ' C' + mx + ',' + a.y + ' ' + mx + ',' + c.y + ' ' + c.x + ',' + c.y + '"></path>');
      });

      S.snapshot.nodes.forEach(function (n) {
        var p = S.pos[n.id];
        if (!p) return;
        var dim = (near && !near[n.id]) || (S.query && !hits[n.id]);
        var fill = nodeFill(n), dashed = nodeDashed(n);
        parts.push('<g class="gv-node' + (S.selected === n.id ? ' sel' : '')
          + (S.query && hits[n.id] ? ' hit' : '') + (dim ? ' dim' : '')
          + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" style="cursor:pointer">'
          + '<title>' + esc(n.label) + ' — ' + esc(CLASS_AR[n.nodeClass] || n.nodeClass) + '</title>'
          + '<rect x="' + (p.x - NODE_W / 2) + '" y="' + (p.y - NODE_H / 2) + '" width="' + NODE_W
          + '" height="' + NODE_H + '" rx="4" fill="' + fill + '" fill-opacity="'
          + (S.mode === 'architecture' ? 0.2 : 0.5) + '" stroke="'
          + (dashed ? 'var(--text-3)' : (fill === 'transparent' ? 'var(--border-2)' : fill)) + '"'
          + (dashed ? ' stroke-dasharray="3 2"' : '') + '></rect>'
          + '<text class="' + (isIdentifier(shortLabel(n)) ? 'id' : 'name')
          + '" x="' + p.x + '" y="' + (p.y + 3.5) + '" text-anchor="middle" font-size="10">'
          + esc(shortLabel(n)) + '</text></g>');
      });
      parts.push('</g>');
      svg.innerHTML = parts.join('');
      paintNote(); paintFilters(); paintLegend();
      var fb = document.getElementById(uid + '-focus');
      if (fb) fb.classList.toggle('on', S.focus);
    }

    // ── Inspector ────────────────────────────────────────────────────
    function openInspector(id) {
      var n = S.snapshot.nodes.filter(function (x) { return x.id === id; })[0];
      if (!n) { insp.classList.remove('open'); return; }
      insp.innerHTML = inspectorHtml(n, {
        snapshot: S.snapshot,
        runtime: S.runtime ? S.runtime.index[id] : null,
        trace: S.trace ? S.trace.index[id] : null
      }) + '<button class="icon-btn gvi-x" data-act="close-insp">إغلاق</button>';
      insp.classList.add('open');
      if (opts.onSelect) opts.onSelect(n);
    }
    function select(id) {
      S.selected = id;
      render();
      openInspector(id);
    }

    // ── Interaction: pan, zoom, filter, select. All read-only. ────────
    function fit() { S.view = { x: 0, y: 0, k: 1 }; }
    host.addEventListener('click', function (e) {
      var t = e.target;
      var m = t.closest ? t.closest('.gv-mode') : null;
      if (m) {
        S.mode = m.getAttribute('data-mode');
        S.statusFilter = null;
        Array.prototype.forEach.call(host.querySelectorAll('.gv-mode'), function (b) {
          b.classList.toggle('on', b === m);
        });
        if (S.mode === 'runtime' && !S.runtime) { loadRuntime(); return; }
        render();
        if (opts.onMode) opts.onMode(S.mode);
        return;
      }
      var cls = t.closest ? t.closest('[data-class]') : null;
      if (cls) {
        var c = cls.getAttribute('data-class');
        if (S.hidden[c]) delete S.hidden[c]; else S.hidden[c] = 1;
        render(); return;
      }
      var st = t.closest ? t.closest('[data-status]') : null;
      if (st) {
        var v = st.getAttribute('data-status');
        S.statusFilter = S.statusFilter === v ? null : v;
        render(); return;
      }
      var a = t.closest ? t.closest('[data-ask]') : null;
      if (a) { ASKS[Number(a.getAttribute('data-ask'))].run(); document.getElementById(uid + '-q').value = S.query;
               render(); if (S.selected && S.focus) openInspector(S.selected); return; }
      var z = t.closest ? t.closest('[data-zoom]') : null;
      if (z) {
        var d = z.getAttribute('data-zoom');
        if (d === 'fit') fit();
        else S.view.k = Math.max(0.4, Math.min(3, S.view.k * (d === 'in' ? 1.25 : 0.8)));
        render(); return;
      }
      var act = t.closest ? t.closest('[data-act]') : null;
      if (act) {
        var kind = act.getAttribute('data-act');
        if (kind === 'focus') { S.focus = !S.focus; render(); return; }
        if (kind === 'close-insp') { insp.classList.remove('open'); return; }
        if (kind === 'reset') {
          S.hidden = {}; S.query = ''; S.focus = false; S.selected = null; S.statusFilter = null;
          document.getElementById(uid + '-q').value = '';
          insp.classList.remove('open'); fit(); render(); return;
        }
        if (kind === 'goto') { select(act.getAttribute('data-target')); return; }
      }
      var g = t.closest ? t.closest('.gv-node') : null;
      if (g) select(g.getAttribute('data-id'));
    });
    host.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { insp.classList.remove('open'); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target.closest ? e.target.closest('.gv-node') : null;
      if (g) { e.preventDefault(); select(g.getAttribute('data-id')); }
    });
    var qEl = document.getElementById(uid + '-q');
    qEl.addEventListener('input', function () { S.query = qEl.value.trim(); render(); });

    var drag = null;
    svg.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.gv-node')) return;
      drag = { x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y };
      svg.classList.add('drag');
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var scale = S.W / svg.getBoundingClientRect().width;
      S.view.x = drag.vx + (e.clientX - drag.x) * scale;
      S.view.y = drag.vy + (e.clientY - drag.y) * scale;
      render();
    });
    svg.addEventListener('pointerup', function () { drag = null; svg.classList.remove('drag'); });

    // ── Loading. GET only, everywhere. ───────────────────────────────
    function loadRuntime() {
      return window.adminFetch('/api/admin/graph/runtime').then(function (r) {
        if (!r || !r.ok) { S.runtime = null; render(); return; }
        var idx = {};
        r.overlay.states.forEach(function (s) { idx[s.nodeId] = s; });
        S.runtime = { index: idx, states: r.overlay.states, unmatched: r.overlay.unmatched };
        render();
      }).catch(function () { S.runtime = null; render(); });
    }
    function loadTrace(campaignId) {
      return window.adminFetch('/api/admin/graph/trace/' + encodeURIComponent(campaignId))
        .then(function (r) {
          if (!r || !r.ok) { S.trace = null; render(); return r; }
          var idx = {};
          r.overlay.stages.forEach(function (s) { idx[s.nodeId] = s; });
          S.trace = { index: idx, stages: r.overlay.stages,
            campaignName: r.overlay.campaignName, campaignId: r.overlay.campaignId };
          S.mode = 'trace';
          Array.prototype.forEach.call(host.querySelectorAll('.gv-mode'), function (b) {
            b.classList.toggle('on', b.getAttribute('data-mode') === 'trace');
          });
          render();
          return r;
        }).catch(function () { S.trace = null; render(); });
    }

    window.adminFetch('/api/admin/graph/architecture').then(function (r) {
      // The adapter refused it, or the route could not build it. Say which.
      if (!r || !r.ok) {
        fail('تعذّر تحميل الخريطة: ' + ((r && (r.reason || r.code)) || 'سبب غير معروف'));
        return;
      }
      S.snapshot = r.snapshot;
      // The compact preview shows the INFRASTRUCTURE SPINE, not a thumbnail of
      // everything. Forty-one nodes in a 330px panel scale down to roughly four
      // unreadable pixels per label — a picture that looks like information and
      // is not. Twenty nodes across three columns stay legible at this height,
      // and the full map is one click away.
      if (compact) S.hidden = only(['DEPLOYMENT_SERVICE', 'QUEUE', 'DB_MODEL',
                                    'WORKSPACE', 'INTELLIGENCE_LAYER']);
      paintAsk();
      render();
      if (S.mode === 'runtime') loadRuntime();
      if (opts.onReady) opts.onReady(S.snapshot);
    }).catch(function (e) {
      fail('تعذّر تحميل الخريطة: ' + e.message);
    });

    return {
      select: select, loadTrace: loadTrace, snapshot: function () { return S.snapshot; },
      setMode: function (m) { S.mode = m; if (m === 'runtime' && !S.runtime) loadRuntime(); else render(); }
    };
  }

  /**
   * The node inspector body.
   *
   * Answers the operator questions in a fixed order and renders "what we do
   * not know" as a first-class block rather than an omission — an inspector
   * that silently drops its unknowns teaches the reader that everything shown
   * is everything there is.
   */
  function inspectorHtml(node, ctx) {
    if (!node) return '<div class="muted">اختر عقدة من الخريطة.</div>';
    var s = ctx.snapshot;
    var CLASS_AR2 = {
      META_CAPABILITY: 'قدرة Meta', META_ENTITY: 'كيان Meta', SERVICE: 'خدمة', QUEUE: 'طابور',
      DEPLOYMENT_SERVICE: 'خدمة منشورة', ENGINE: 'محرّك', INTELLIGENCE_LAYER: 'طبقة ذكاء',
      DB_MODEL: 'نموذج', PERSISTENCE_OWNER: 'مالك تخزين', WORKSPACE: 'مساحة عمل',
      API_ROUTE: 'مسار', PAGE: 'سطح'
    };
    var RT = { HEALTHY: ['ok', 'سليم'], DEGRADED: ['warn', 'متدهور'], FAILED: ['bad', 'فاشل'],
               UNKNOWN: ['absent', 'غير معروف'], NOT_TESTED: ['absent', 'لم يُختبر'],
               NOT_CONFIGURED: ['absent', 'غير مضبوط'] };
    var out = [];
    out.push('<h3>' + esc(node.label) + '</h3>');
    out.push('<div class="muted">' + esc(CLASS_AR2[node.nodeClass] || node.nodeClass)
      + ' · <span class="mono">' + esc(node.id) + '</span></div>');
    out.push('<div class="k">ما هذا؟</div><div>' + esc(node.what) + '</div>');
    out.push('<div class="k">المالك الرسمي</div><div class="mono">' + esc(node.owner) + '</div>');

    out.push('<div class="k">الحالة الآن</div>');
    if (ctx.runtime) {
      var m = RT[ctx.runtime.state] || ['absent', ctx.runtime.state];
      out.push('<div class="gvi-state ' + m[0] + '"><b>' + esc(m[1]) + '</b> — '
        + esc(ctx.runtime.summary) + '</div>');
      if (ctx.runtime.detail) out.push('<div class="mono muted">' + esc(ctx.runtime.detail) + '</div>');
      out.push('<div class="muted mono" style="margin-top:4px;">'
        + esc(ctx.runtime.provenance ? ctx.runtime.provenance.source : '') + '</div>');
    } else {
      // Never blank, and never green: no observation is its own answer.
      out.push('<div class="gvi-state absent">لا رصد لهذه العقدة — الحالة غير معروفة، وليست سليمة.</div>');
    }

    if (ctx.trace) {
      out.push('<div class="k">في هذا القرار</div>');
      out.push('<div class="gvi-state ' + (ctx.trace.state === 'REACHED' ? 'ok' : 'absent') + '">'
        + esc(ctx.trace.state === 'REACHED' ? 'شارك' : 'لم يُبلَغ')
        + (ctx.trace.conclusion ? ' — ' + esc(ctx.trace.conclusion) : '') + '</div>');
      if (ctx.trace.absenceReason) out.push('<div class="muted">' + esc(ctx.trace.absenceReason) + '</div>');
      out.push('<div class="muted mono">قرّرها: ' + esc(ctx.trace.canonicalSource) + '</div>');
      out.push('<div class="muted mono">من: ' + esc(ctx.trace.inputSource) + '</div>');
    }

    var byId = {};
    s.nodes.forEach(function (n) { byId[n.id] = n; });
    function rel(list, title) {
      if (!list.length) return;
      out.push('<div class="k">' + title + '</div><ul>');
      list.slice(0, 12).forEach(function (e) {
        var other = byId[e.__other];
        out.push('<li><span class="mono">' + esc(e.kind) + '</span> · '
          + '<button data-act="goto" data-target="' + esc(e.__other) + '">'
          + esc(other ? other.label : e.__other) + '</button></li>');
      });
      if (list.length > 12) out.push('<li class="muted">+' + (list.length - 12) + ' أخرى</li>');
      out.push('</ul>');
    }
    var outgoing = s.edges.filter(function (e) { return e.from === node.id; })
      .map(function (e) { var o = {}; for (var k in e) o[k] = e[k]; o.__other = e.to; return o; });
    var incoming = s.edges.filter(function (e) { return e.to === node.id; })
      .map(function (e) { var o = {}; for (var k in e) o[k] = e[k]; o.__other = e.from; return o; });
    rel(outgoing.filter(function (e) { return e.kind === 'READS' || e.kind === 'CONSUMES'; }), 'ماذا يقرأ');
    rel(outgoing.filter(function (e) {
      return e.kind === 'WRITES' || e.kind === 'PERSISTS_TO' || e.kind === 'PRODUCES'; }), 'ماذا يكتب');
    rel(outgoing.filter(function (e) {
      return ['READS', 'CONSUMES', 'WRITES', 'PERSISTS_TO', 'PRODUCES'].indexOf(e.kind) < 0; }),
      'على ماذا يعتمد');
    rel(incoming, 'ما الذي يعتمد عليه');

    out.push('<div class="k">من أين جاءت هذه المعلومة</div>');
    out.push('<div class="mono muted">' + esc(node.provenance.method) + ' · ' + esc(node.provenance.source)
      + (node.provenance.note ? ' · ' + esc(node.provenance.note) : '') + '</div>');

    out.push('<div class="k">ما لا نعرفه</div>');
    if (node.unknowns && node.unknowns.length) {
      out.push('<div class="unk">' + node.unknowns.map(esc).join('<br>') + '</div>');
    } else {
      out.push('<div class="muted">لا فجوة مسجّلة على هذه العقدة.</div>');
    }
    if (node.href) {
      out.push('<div style="margin-top:12px;"><a class="btn btn-primary" href="' + esc(node.href)
        + '">افتح السطح الرسمي</a></div>');
    }
    return out.join('');
  }

  return { mount: mount, inspector: function (n, c) { return inspectorHtml(n, c || {}); } };
})();
`;
