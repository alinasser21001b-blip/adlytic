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
//  removes an edge. What moves is colour and emphasis; the map holds still,
//  which is also what makes the three views comparable.
//
//  ── The read-only guarantee, in the component ─────────────────────────
//
//  This component issues GET requests and nothing else. There is no form, no
//  POST, no PATCH, no DELETE anywhere in it. Clicking a node opens an
//  inspector; the inspector's only actions are LINKS to canonical admin
//  surfaces that own their own writes. The graph observes and navigates.
//
//  ── Layout ────────────────────────────────────────────────────────────
//
//  Deterministic layered placement by node class, not force simulation. An
//  operator comparing today's graph with yesterday's screenshot needs the
//  same node in the same place; a force layout moves everything whenever one
//  node is added, which destroys exactly that comparison. Determinism beats
//  prettiness here.
// ════════════════════════════════════════════════════════════════════════

export const GRAPH_VIEW_CSS = `
  .gv { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
        background: var(--bg); overflow: hidden; }
  .gv-bar { display: flex; align-items: center; gap: 7px; padding: 8px 10px; flex-wrap: wrap;
            border-bottom: 1px solid var(--border); background: var(--surface); }
  .gv-modes { display: inline-flex; border: 1px solid var(--border-control); border-radius: 8px; overflow: hidden; }
  .gv-mode { padding: 4px 11px; font-size: 11.5px; font-weight: 600; background: none; border: 0;
             color: var(--text-3); cursor: pointer; font-family: inherit; }
  .gv-mode.on { background: var(--accent-dim); color: var(--accent-2); }
  .gv-mode:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .gv-canvas { display: block; width: 100%; touch-action: none; cursor: grab; background: var(--bg); }
  .gv-canvas.drag { cursor: grabbing; }
  .gv-node rect { stroke-width: 1.2px; }
  .gv-node text { font-size: 9px; font-family: var(--font-mono); fill: var(--text-2); pointer-events: none; }
  .gv-node.sel rect { stroke: var(--accent); stroke-width: 2.4px; }
  .gv-node.dim { opacity: 0.16; }
  .gv-edge { fill: none; stroke: var(--gridline); stroke-width: 1px; }
  .gv-edge.hot { stroke: var(--accent); stroke-width: 1.8px; }
  .gv-edge.dim { opacity: 0.08; }
  .gv-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: var(--text-3);
               padding: 7px 10px; border-top: 1px solid var(--border); background: var(--surface); }
  .gv-key { display: inline-flex; align-items: center; gap: 4px; }
  .gv-sw { width: 9px; height: 9px; border-radius: 2px; display: inline-block; border: 1px solid var(--border-2); }
  .gv-note { padding: 10px 12px; font-size: 11.5px; color: var(--text-3); }
  .gv-err { padding: 16px; font-size: 12px; color: var(--error); }

  /* Inspector */
  .gvi { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
         padding: 13px; font-size: 12px; }
  .gvi h3 { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .gvi .k { font-size: 9.5px; font-weight: 800; color: var(--text-3); text-transform: uppercase;
            letter-spacing: 0.06em; margin-top: 11px; }
  .gvi ul { list-style: none; margin-top: 3px; }
  .gvi li { padding: 2px 0; border-bottom: 1px dotted var(--border); }
  .gvi .unk { border: 1px dashed var(--text-3); border-radius: 7px; padding: 8px 10px;
              color: var(--text-3); font-size: 11.5px; }
`;

/**
 * The browser component.
 *
 * `AdlyticGraph.mount(opts)` renders into a host element. `opts.modes`
 * selects which of the three questions the surface offers — the Control
 * Center preview offers architecture and runtime; the full page offers all
 * three. There is still only one implementation.
 */
export const GRAPH_VIEW_JS = `
window.AdlyticGraph = (function () {
  var W = 1180, H = 620, PAD = 26;

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

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Deterministic: column by class, row by stable sort within the column. */
  function layout(nodes) {
    var cols = [[], [], [], [], [], []];
    nodes.forEach(function (n) {
      var c = COLUMN[n.nodeClass];
      cols[c === undefined ? 1 : c].push(n);
    });
    var pos = {};
    var colW = (W - PAD * 2) / cols.length;
    cols.forEach(function (list, ci) {
      list.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      var step = (H - PAD * 2) / Math.max(list.length, 1);
      list.forEach(function (n, ri) {
        pos[n.id] = {
          x: PAD + ci * colW + colW / 2,
          y: PAD + ri * step + step / 2,
          col: ci
        };
      });
    });
    return pos;
  }

  function mount(opts) {
    var host = typeof opts.host === 'string' ? document.getElementById(opts.host) : opts.host;
    if (!host) return null;
    var modes = opts.modes || ['architecture'];
    var state = {
      mode: modes[0], snapshot: null, runtime: null, trace: null,
      selected: null, pos: {}, view: { x: 0, y: 0, k: 1 }
    };

    host.innerHTML =
      '<div class="gv-bar">'
      + '<div class="gv-modes">' + modes.map(function (m) {
          return '<button class="gv-mode' + (m === state.mode ? ' on' : '') + '" data-mode="' + m + '">'
            + ({ architecture: 'البنية', runtime: 'التشغيل', trace: 'أثر القرار' }[m] || m) + '</button>';
        }).join('') + '</div>'
      + '<span class="gv-note" id="' + host.id + '-note">جارٍ التحميل…</span>'
      + '<span style="flex:1"></span>'
      + '<button class="btn" data-zoom="in" aria-label="تكبير">+</button>'
      + '<button class="btn" data-zoom="out" aria-label="تصغير">−</button>'
      + '<button class="btn" data-zoom="fit">ملء</button>'
      + '</div>'
      + '<svg class="gv-canvas" id="' + host.id + '-svg" viewBox="0 0 ' + W + ' ' + H + '" '
      + 'height="' + (opts.height || 520) + '" role="img" aria-label="خريطة المنظومة"></svg>'
      + '<div class="gv-legend" id="' + host.id + '-legend"></div>';

    var svg = document.getElementById(host.id + '-svg');
    var note = document.getElementById(host.id + '-note');
    var legend = document.getElementById(host.id + '-legend');

    function fail(msg) {
      // A malformed or unavailable graph degrades THIS panel and nothing
      // else. The surrounding console keeps working — that is the whole
      // point of an operations console.
      svg.innerHTML = '';
      note.innerHTML = '<span class="gv-err">' + esc(msg) + '</span>';
    }

    function paintNote() {
      var s = state.snapshot;
      if (!s) return;
      var bits = [s.nodes.length + ' عقدة', s.edges.length + ' علاقة'];
      if (s.repositoryCommit) bits.push('commit ' + String(s.repositoryCommit).slice(0, 7));
      if (state.mode === 'runtime') {
        bits.push(state.runtime ? 'حالة مرصودة: ' + state.runtime.states.length
                                : 'لا لقطة تشغيل — كل شيء غير معروف');
      }
      if (state.mode === 'trace') {
        bits.push(state.trace ? 'حملة: ' + state.trace.campaignName : 'لم تُختَر حملة');
      }
      note.textContent = bits.join(' · ');
    }

    function paintLegend() {
      if (state.mode === 'runtime') {
        legend.innerHTML = ['HEALTHY', 'DEGRADED', 'FAILED', 'UNKNOWN', 'NOT_TESTED', 'NOT_CONFIGURED']
          .map(function (s) {
            var style = ABSENT[s]
              ? 'background:transparent;border:1px dashed var(--text-3);'
              : 'background:' + RUNTIME_FILL[s] + ';';
            return '<span class="gv-key"><span class="gv-sw" style="' + style + '"></span>' + s + '</span>';
          }).join('')
          + '<span class="gv-key" style="margin-inline-start:auto;">الغياب مرسوم متقطّعاً — لا أخضر ولا أحمر</span>';
      } else if (state.mode === 'trace') {
        legend.innerHTML =
          '<span class="gv-key"><span class="gv-sw" style="background:var(--accent);"></span>REACHED</span>'
          + '<span class="gv-key"><span class="gv-sw" style="background:transparent;border:1px dashed var(--text-3);"></span>NOT_REACHED</span>'
          + '<span class="gv-key" style="margin-inline-start:auto;">الخريطة تعرض ما خلص إليه الدماغ — ولا تحسب شيئاً</span>';
      } else {
        legend.innerHTML = COL_LABEL.map(function (l, i) {
          return '<span class="gv-key">' + (i + 1) + '. ' + l + '</span>';
        }).join('');
      }
    }

    function nodeFill(n) {
      if (state.mode === 'runtime') {
        var r = state.runtime && state.runtime.index[n.id];
        if (!r) return 'transparent';
        return RUNTIME_FILL[r.state] || 'transparent';
      }
      if (state.mode === 'trace') {
        var t = state.trace && state.trace.index[n.id];
        if (!t) return 'transparent';
        return t.state === 'REACHED' ? 'var(--accent)' : 'transparent';
      }
      return CLASS_FILL[n.nodeClass] || 'var(--text-3)';
    }

    function nodeDashed(n) {
      if (state.mode === 'runtime') {
        var r = state.runtime && state.runtime.index[n.id];
        return !r || !!ABSENT[r.state];
      }
      if (state.mode === 'trace') {
        var t = state.trace && state.trace.index[n.id];
        return !t || t.state !== 'REACHED';
      }
      return false;
    }

    function neighbours(id) {
      var set = {};
      state.snapshot.edges.forEach(function (e) {
        if (e.from === id) set[e.to] = 1;
        if (e.to === id) set[e.from] = 1;
      });
      set[id] = 1;
      return set;
    }

    function render() {
      var s = state.snapshot;
      if (!s) return;
      var near = state.selected ? neighbours(state.selected) : null;
      var parts = ['<g transform="translate(' + state.view.x + ',' + state.view.y + ') scale(' + state.view.k + ')">'];

      s.edges.forEach(function (e) {
        var a = state.pos[e.from], b = state.pos[e.to];
        if (!a || !b) return;
        var hot = state.selected && (e.from === state.selected || e.to === state.selected);
        var dim = near && !hot;
        var mx = (a.x + b.x) / 2;
        parts.push('<path class="gv-edge' + (hot ? ' hot' : '') + (dim ? ' dim' : '') + '" d="M'
          + a.x + ',' + a.y + ' C' + mx + ',' + a.y + ' ' + mx + ',' + b.y + ' ' + b.x + ',' + b.y + '"></path>');
      });

      s.nodes.forEach(function (n) {
        var p = state.pos[n.id];
        if (!p) return;
        var dim = near && !near[n.id];
        var w = 116, h = 17;
        var label = n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label;
        parts.push('<g class="gv-node' + (state.selected === n.id ? ' sel' : '') + (dim ? ' dim' : '')
          + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" style="cursor:pointer">'
          + '<title>' + esc(n.label) + ' — ' + esc(n.nodeClass) + '</title>'
          + '<rect x="' + (p.x - w / 2) + '" y="' + (p.y - h / 2) + '" width="' + w + '" height="' + h
          + '" rx="4" fill="' + nodeFill(n) + '" fill-opacity="' + (state.mode === 'architecture' ? 0.22 : 0.5) + '"'
          + ' stroke="' + (nodeDashed(n) ? 'var(--text-3)' : (nodeFill(n) === 'transparent' ? 'var(--border-2)' : nodeFill(n))) + '"'
          + (nodeDashed(n) ? ' stroke-dasharray="3 2"' : '') + '></rect>'
          + '<text x="' + p.x + '" y="' + (p.y + 3) + '" text-anchor="middle">' + esc(label) + '</text>'
          + '</g>');
      });
      parts.push('</g>');
      svg.innerHTML = parts.join('');
      paintNote();
      paintLegend();
    }

    function select(id) {
      state.selected = id;
      render();
      if (opts.onSelect) {
        var n = state.snapshot.nodes.filter(function (x) { return x.id === id; })[0] || null;
        opts.onSelect(n, {
          snapshot: state.snapshot,
          runtime: state.runtime ? state.runtime.index[id] : null,
          trace: state.trace ? state.trace.index[id] : null
        });
      }
    }

    // ── Interaction: pan, zoom, select. All read-only. ────────────────
    host.addEventListener('click', function (e) {
      var m = e.target.closest ? e.target.closest('.gv-mode') : null;
      if (m) {
        state.mode = m.getAttribute('data-mode');
        Array.prototype.forEach.call(host.querySelectorAll('.gv-mode'), function (b) {
          b.classList.toggle('on', b === m);
        });
        if (state.mode === 'runtime' && !state.runtime) loadRuntime();
        render();
        if (opts.onMode) opts.onMode(state.mode);
        return;
      }
      var z = e.target.closest ? e.target.closest('[data-zoom]') : null;
      if (z) {
        var d = z.getAttribute('data-zoom');
        if (d === 'fit') state.view = { x: 0, y: 0, k: 1 };
        else state.view.k = Math.max(0.4, Math.min(3, state.view.k * (d === 'in' ? 1.25 : 0.8)));
        render();
        return;
      }
      var g = e.target.closest ? e.target.closest('.gv-node') : null;
      if (g) select(g.getAttribute('data-id'));
    });
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target.closest ? e.target.closest('.gv-node') : null;
      if (g) { e.preventDefault(); select(g.getAttribute('data-id')); }
    });
    var drag = null;
    svg.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.gv-node')) return;
      drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
      svg.classList.add('drag');
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var scale = W / svg.getBoundingClientRect().width;
      state.view.x = drag.vx + (e.clientX - drag.x) * scale;
      state.view.y = drag.vy + (e.clientY - drag.y) * scale;
      render();
    });
    svg.addEventListener('pointerup', function () { drag = null; svg.classList.remove('drag'); });

    // ── Loading. GET only, everywhere. ───────────────────────────────
    function loadRuntime() {
      return window.adminFetch('/api/admin/graph/runtime').then(function (r) {
        if (!r || !r.ok) { state.runtime = null; render(); return; }
        var idx = {};
        r.overlay.states.forEach(function (s) { idx[s.nodeId] = s; });
        state.runtime = { index: idx, states: r.overlay.states, unmatched: r.overlay.unmatched };
        render();
      }).catch(function () { state.runtime = null; render(); });
    }

    function loadTrace(campaignId) {
      return window.adminFetch('/api/admin/graph/trace/' + encodeURIComponent(campaignId))
        .then(function (r) {
          if (!r || !r.ok) { state.trace = null; render(); return; }
          var idx = {};
          r.overlay.stages.forEach(function (s) { idx[s.nodeId] = s; });
          state.trace = {
            index: idx, stages: r.overlay.stages,
            campaignName: r.overlay.campaignName, campaignId: r.overlay.campaignId
          };
          state.mode = 'trace';
          Array.prototype.forEach.call(host.querySelectorAll('.gv-mode'), function (b) {
            b.classList.toggle('on', b.getAttribute('data-mode') === 'trace');
          });
          render();
        }).catch(function () { state.trace = null; render(); });
    }

    window.adminFetch('/api/admin/graph/architecture').then(function (r) {
      // The adapter refused it, or the route could not build it. Say which.
      if (!r || !r.ok) {
        fail('تعذّر تحميل الخريطة: ' + ((r && (r.reason || r.code)) || 'سبب غير معروف'));
        return;
      }
      state.snapshot = r.snapshot;
      state.pos = layout(r.snapshot.nodes);
      render();
      if (state.mode === 'runtime') loadRuntime();
      if (opts.onReady) opts.onReady(state.snapshot);
    }).catch(function (e) {
      fail('تعذّر تحميل الخريطة: ' + e.message);
    });

    return {
      select: select,
      loadTrace: loadTrace,
      setMode: function (m) { state.mode = m; if (m === 'runtime' && !state.runtime) loadRuntime(); render(); },
      snapshot: function () { return state.snapshot; }
    };
  }

  /**
   * The node inspector. Answers the operator questions in a fixed order, and
   * renders "what we do not know" as a first-class block rather than an
   * omission — an inspector that silently drops its unknowns teaches the
   * reader that everything shown is everything there is.
   */
  function inspector(node, ctx) {
    if (!node) return '<div class="gvi"><div class="muted">اختر عقدة من الخريطة لعرض تفاصيلها.</div></div>';
    var s = ctx.snapshot;
    var out = ['<div class="gvi">'];
    out.push('<h3>' + esc(node.label) + '</h3>');
    out.push('<div class="muted mono">' + esc(node.nodeClass) + ' · ' + esc(node.id) + '</div>');
    out.push('<div class="k">ما هذا؟</div><div>' + esc(node.what) + '</div>');
    out.push('<div class="k">المالك الرسمي</div><div class="mono">' + esc(node.owner) + '</div>');

    if (ctx.runtime) {
      out.push('<div class="k">الحالة الآن</div>');
      out.push('<div>' + esc(ctx.runtime.state) + ' — ' + esc(ctx.runtime.summary) + '</div>');
      if (ctx.runtime.detail) out.push('<div class="mono muted">' + esc(ctx.runtime.detail) + '</div>');
    }
    if (ctx.trace) {
      out.push('<div class="k">في هذا القرار</div>');
      out.push('<div>' + esc(ctx.trace.state)
        + (ctx.trace.conclusion ? ' — ' + esc(ctx.trace.conclusion) : '') + '</div>');
      if (ctx.trace.absenceReason) out.push('<div class="muted">' + esc(ctx.trace.absenceReason) + '</div>');
      out.push('<div class="muted mono">قرّرها: ' + esc(ctx.trace.canonicalSource) + '</div>');
      out.push('<div class="muted mono">من: ' + esc(ctx.trace.inputSource) + '</div>');
    }

    function rel(list, title) {
      if (!list.length) return;
      out.push('<div class="k">' + title + '</div><ul>');
      list.slice(0, 14).forEach(function (e) {
        var other = s.nodes.filter(function (n) { return n.id === (e.__other); })[0];
        out.push('<li><span class="mono">' + esc(e.kind) + '</span> · '
          + esc(other ? other.label : e.__other) + '</li>');
      });
      if (list.length > 14) out.push('<li class="muted">+' + (list.length - 14) + ' أخرى</li>');
      out.push('</ul>');
    }
    var outgoing = s.edges.filter(function (e) { return e.from === node.id; })
      .map(function (e) { return Object.assign({}, e, { __other: e.to }); });
    var incoming = s.edges.filter(function (e) { return e.to === node.id; })
      .map(function (e) { return Object.assign({}, e, { __other: e.from }); });
    rel(outgoing.filter(function (e) { return e.kind === 'READS' || e.kind === 'CONSUMES'; }), 'ماذا يقرأ');
    rel(outgoing.filter(function (e) {
      return e.kind === 'WRITES' || e.kind === 'PERSISTS_TO' || e.kind === 'PRODUCES';
    }), 'ماذا يكتب');
    rel(outgoing.filter(function (e) {
      return ['READS', 'CONSUMES', 'WRITES', 'PERSISTS_TO', 'PRODUCES'].indexOf(e.kind) < 0;
    }), 'على ماذا يعتمد');
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
    out.push('</div>');
    return out.join('');
  }

  return { mount: mount, inspector: inspector };
})();
`;
