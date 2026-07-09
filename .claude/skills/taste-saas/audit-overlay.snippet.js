/**
 * taste-saas/audit-overlay.snippet.js — tool-agnostic overlay injector.
 *
 * Paste this snippet into any browser session (chrome-devtool MCP,
 * agent-browser, Playwright/Puppeteer/Cypress, devtools console). It:
 *   1. Walks the page for layout-critical elements (sidebar slots,
 *      sidebar rows, main chrome rows, table thead, first body row).
 *   2. Buckets every left/right/text-x and top/bottom into alignment
 *      lines (tolerance 2 px) and paints a faint grid through them.
 *      The more elements share a line, the bolder it is.
 *   3. Returns a JSON index with the items, four drift reports, and a
 *      gridComplexity summary (uniqueX, uniqueY, topXLines).
 *
 * After running, screenshot the page. Then read the JSON to map a number
 * on the screenshot → source location.
 *
 * USAGE (chrome-devtool MCP / Playwright / Puppeteer):
 *   const snippet = fs.readFileSync('audit-overlay.snippet.js', 'utf8');
 *   const result = await mcp.evaluate(`${snippet}; window.__taste.run();`);
 *   // result has items[], counts, sidebarSlotDrift, mainChromeLeftDrift,
 *   //   mainTextAnchorDrift, crossSeamDrift, gridComplexity
 *   await mcp.screenshot('overlay.png');
 *
 * USAGE (devtools console):
 *   1. Paste snippet contents.
 *   2. Call: window.__taste.run()
 *   3. Right-click → Capture screenshot.
 *
 * The shell API (stable across re-injections):
 *   window.__taste.run()        → paint + return JSON
 *   window.__taste.clear()      → remove overlay
 *   window.__taste.get()        → last JSON without re-running
 *   window.__taste.find(n)      → item by badge number
 *   window.__taste.findText(s)  → items whose text contains s
 *   window.__taste.drift()      → all four drift reports
 *   window.__taste.complexity() → gridComplexity
 */
function runOverlay() {
  // ---- find fiber source for a DOM node (React dev build only) ----
  function findFiberSource(node) {
    if (!node) return null;
    const key = Object.keys(node).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    if (!key) return null;
    let fiber = node[key];
    while (fiber) {
      if (fiber._debugSource) {
        const { fileName, lineNumber, columnNumber } = fiber._debugSource;
        return { file: fileName, line: lineNumber, col: columnNumber || null };
      }
      fiber = fiber.return;
    }
    return null;
  }

  // helpers
  function vw() { return window.innerWidth; }
  function rectOf(el) { return el.getBoundingClientRect(); }
  function isAside(el) { return !!el.closest('aside, [data-sidebar="sidebar"]'); }
  function asideRect() {
    const a = document.querySelector('aside, [data-sidebar="sidebar"]');
    return a ? a.getBoundingClientRect() : null;
  }
  // grab a short text snippet (first 40 chars) used for grep-locating the source
  function snippetText(el) {
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 60);
  }

  // find the x of the first visible TEXT node inside an element (not the wrapper border)
  // — this is the actual alignment line the eye sees.
  function firstTextLeftIn(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return n.textContent && n.textContent.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const node = w.nextNode();
    if (!node) return null;
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, node.textContent.length);
    const rect = r.getBoundingClientRect();
    r.detach?.();
    if (!rect || rect.width === 0) return null;
    return Math.round(rect.left);
  }

  // ---- classify a candidate element ----
  function classify(el) {
    const rect = rectOf(el);
    if (rect.width === 0 || rect.height === 0) return null;
    // viewport-visible only
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;

    const inAside = isAside(el);
    const aR = asideRect();
    const asideRight = aR ? aR.right : 0;

    // ─── sidebar bits ───────────────────────────────────────
    if (inAside) {
      const cs = getComputedStyle(el);
      // slot: small square grid wrapper for icons
      if (
        (cs.display === 'grid' || cs.display === 'inline-grid') &&
        rect.width >= 14 && rect.width <= 28 &&
        Math.abs(rect.width - rect.height) <= 1
      ) {
        return { kind: 'sidebar-slot', color: '#3b82f6' };
      }
      // sidebar row: a horizontal strip that's a direct nav child or header/footer
      if (
        el.matches(
          'aside > header, aside > footer, aside nav > *, aside > div > *, [data-sidebar="header"], [data-sidebar="footer"]',
        ) &&
        rect.height >= 16 && rect.height <= 60 &&
        rect.width >= 80
      ) {
        return { kind: 'sidebar-row', color: '#6366f1' };
      }
      return null;
    }

    // ─── main-pane chrome (universal heuristic) ─────────────
    // A "chrome row" is a horizontal strip in the main area that:
    //   - sits to the right of the sidebar
    //   - is wider than 40% of the main area
    //   - is between 28px and 72px tall
    //   - has a flex/inline-flex layout (so it's an arrangement of items, not a paragraph)
    const mainLeft = asideRight || 0;
    const mainWidth = vw() - mainLeft;
    if (rect.left >= mainLeft - 2 && rect.width >= mainWidth * 0.4) {
      const cs = getComputedStyle(el);
      const isFlexRow =
        (cs.display === 'flex' || cs.display === 'inline-flex') &&
        (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
      if (isFlexRow && rect.height >= 28 && rect.height <= 72) {
        // skip rows nested inside another flex row at the same y (avoids double-counting inner flex containers)
        const parent = el.parentElement;
        if (parent) {
          const pr = rectOf(parent);
          if (Math.abs(pr.top - rect.top) < 4 && Math.abs(pr.height - rect.height) < 4) {
            // parent is essentially the same row — defer to parent
            return null;
          }
        }
        return { kind: 'main-chrome', color: '#10b981' };
      }
    }
    // table sticky header
    if (el.tagName === 'THEAD' || el.matches('table > thead > tr')) {
      return { kind: 'table-thead', color: '#f59e0b' };
    }
    // table first body row (helps verify column x-anchor)
    if (el.matches('table > tbody > tr:first-child')) {
      return { kind: 'table-first-row', color: '#ec4899' };
    }
    return null;
  }

  // ---- collect ----
  const all = Array.from(document.querySelectorAll('*'));
  const seen = new Set();
  const raw = [];
  for (const el of all) {
    const cat = classify(el);
    if (!cat) continue;
    const r = el.getBoundingClientRect();
    const bbox = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
    const key = `${cat.kind}|${bbox.x},${bbox.y},${bbox.w},${bbox.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raw.push({
      el,
      tag: el.tagName.toLowerCase(),
      className: (el.className?.toString?.() || '').slice(0, 200),
      bbox,
      kind: cat.kind,
      color: cat.color,
      text: snippetText(el),
      firstTextX: firstTextLeftIn(el),
      source: findFiberSource(el),
    });
  }

  // dedupe nested same-kind items: if A contains B AND same kind AND bbox nearly equal, keep only the OUTER (A)
  function containsRect(a, b) {
    return (
      b.bbox.x >= a.bbox.x - 1 &&
      b.bbox.y >= a.bbox.y - 1 &&
      b.bbox.x + b.bbox.w <= a.bbox.x + a.bbox.w + 1 &&
      b.bbox.y + b.bbox.h <= a.bbox.y + a.bbox.h + 1
    );
  }
  const filtered = raw.filter((b, i) =>
    !raw.some((a, j) =>
      j !== i &&
      a.kind === b.kind &&
      // a is outer of b
      containsRect(a, b) &&
      // and they overlap vertically substantially (b sits inside a's row, possibly with some padding)
      Math.abs(a.bbox.y - b.bbox.y) <= 10 &&
      // a is wider (outer chrome row contains inner content row)
      a.bbox.w > b.bbox.w + 8
    ),
  );
  const items = filtered.map(({ el, ...rest }) => rest);
  items.forEach((it, i) => (it.n = i + 1));

  // ---- remove old overlay, mount new ----
  document.getElementById('__taste_saas_audit_overlay')?.remove();
  const root = document.createElement('div');
  root.id = '__taste_saas_audit_overlay';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  for (const it of items) {
    const rect = document.createElement('div');
    Object.assign(rect.style, {
      position: 'fixed',
      left: it.bbox.x + 'px',
      top: it.bbox.y + 'px',
      width: it.bbox.w + 'px',
      height: it.bbox.h + 'px',
      border: `1.5px solid ${it.color}`,
      backgroundColor: it.color + '0d',  // softer fill so overlaps are readable
      boxSizing: 'border-box',
    });
    // badge placement: keep it readable, avoid overlapping the rect itself,
    // and bail to "above" placement when the rect is too close to the viewport edge.
    const isSlot = it.kind === 'sidebar-slot';
    const tooFarLeft = it.bbox.x < 24;
    const badge = document.createElement('div');
    badge.textContent = String(it.n);
    let badgePos;
    if (isSlot && !tooFarLeft) {
      // small slot away from edge → badge to the LEFT
      badgePos = { top: '-2px', right: '100%', marginRight: '4px' };
    } else if (isSlot && tooFarLeft) {
      // small slot near edge → badge directly ABOVE
      badgePos = { bottom: '100%', left: '0', marginBottom: '2px' };
    } else {
      // big row → badge top-right OUTSIDE
      badgePos = { top: '-14px', right: '-2px' };
    }
    Object.assign(badge.style, {
      position: 'absolute',
      ...badgePos,
      minWidth: '18px',
      height: '14px',
      padding: '0 4px',
      borderRadius: '7px',
      backgroundColor: it.color,
      color: '#fff',
      font: '600 10px/14px ui-monospace, monospace',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    });
    rect.appendChild(badge);
    root.appendChild(rect);
  }

  // ───────────────────────────────────────────────────────────────
  // Grid complexity — bucket every alignment-relevant coordinate into
  // lines, draw them, count uniques. The lower the count, the cleaner
  // the layout. A well-designed Stripe-style dashboard typically has
  //   uniqueX ≈ 4–8  (page-pl, page-pr, column 1, column 2, …, page-right)
  //   uniqueY ≈ 6–12 (top-row-h, row-h × N, footer)
  // If you see >15 unique X lines, your layout is leaking ad-hoc paddings.
  // ───────────────────────────────────────────────────────────────
  const TOL = 2;        // px tolerance — coordinates within this collapse into one line
  function bucketize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const buckets = [];
    for (const v of sorted) {
      const last = buckets[buckets.length - 1];
      if (last && Math.abs(last.center - v) <= TOL) {
        last.members.push(v);
        last.center = last.members.reduce((s, n) => s + n, 0) / last.members.length;
      } else {
        buckets.push({ center: v, members: [v] });
      }
    }
    return buckets.map((b) => ({ x: Math.round(b.center), count: b.members.length }));
  }

  // collect raw coords from items
  const xRaw = [];
  const yRaw = [];
  for (const it of items) {
    xRaw.push(it.bbox.x);
    xRaw.push(it.bbox.x + it.bbox.w);
    if (it.firstTextX != null) xRaw.push(it.firstTextX);
    yRaw.push(it.bbox.y);
    yRaw.push(it.bbox.y + it.bbox.h);
  }
  // also: each table cell's first text x (so you can see column-anchor alignment)
  const tableCells = Array.from(
    document.querySelectorAll('thead th, tbody tr:first-child td'),
  );
  for (const cell of tableCells) {
    const tx = firstTextLeftIn(cell);
    if (tx != null) xRaw.push(tx);
  }
  const xBuckets = bucketize(xRaw);
  const yBuckets = bucketize(yRaw);

  // draw the grid — only lines shared by 2+ elements (count=1 is noise).
  // Stronger lines = more shared, so the skeleton jumps out.
  function drawLine({ horizontal, pos, weight, maxWeight }) {
    if (weight < 2) return;
    // map weight 2..max → alpha 0.12..0.7 (log-ish so high counts pull ahead)
    const t = Math.min(1, Math.log(weight) / Math.log(maxWeight || 2));
    const alpha = (0.12 + 0.58 * t).toFixed(2);
    const line = document.createElement('div');
    Object.assign(line.style, {
      position: 'fixed',
      ...(horizontal
        ? { left: '0', right: '0', top: pos + 'px', height: '1px', borderTop: `1px dashed rgba(99,102,241,${alpha})` }
        : { top: '0', bottom: '0', left: pos + 'px', width: '1px', borderLeft: `1px dashed rgba(59,130,246,${alpha})` }),
      pointerEvents: 'none',
    });
    root.appendChild(line);
  }
  const maxX = Math.max(...xBuckets.map((b) => b.count));
  const maxY = Math.max(...yBuckets.map((b) => b.count));
  for (const b of xBuckets) drawLine({ horizontal: false, pos: b.x, weight: b.count, maxWeight: maxX });
  for (const b of yBuckets) drawLine({ horizontal: true, pos: b.x, weight: b.count, maxWeight: maxY });

  const gridComplexity = {
    uniqueX: xBuckets.length,
    uniqueY: yBuckets.length,
    // top-anchor x lines: the most-shared vertical lines. these are your skeleton.
    topXLines: xBuckets.sort((a, b) => b.count - a.count).slice(0, 6),
    topYLines: yBuckets.sort((a, b) => b.count - a.count).slice(0, 8),
    hint:
      xBuckets.length > 15 || yBuckets.length > 20
        ? `layout has ${xBuckets.length} unique X lines and ${yBuckets.length} unique Y lines — that's high. clean layouts usually run ~5-8 X and ~8-12 Y. lines that contain only 1–2 elements are usually ad-hoc paddings that should be routed through a token (--page-pl, --row-h, etc).`
        : null,
  };

  // ---- legend (compact, bottom-right, semi-transparent, single horizontal row) ----
  const legend = document.createElement('div');
  Object.assign(legend.style, {
    position: 'fixed',
    bottom: '4px',
    right: '4px',
    padding: '4px 6px',
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '4px',
    font: '9px/1 ui-monospace, monospace',
    color: '#374151',
    display: 'flex',
    gap: '8px',
    opacity: '0.7',
  });
  const legendItems = [
    ['#3b82f6', 'slot'],
    ['#6366f1', 'srow'],
    ['#10b981', 'main'],
    ['#f59e0b', 'thead'],
    ['#ec4899', 'row1'],
  ];
  legend.innerHTML = legendItems
    .map(
      ([c, name]) =>
        `<span style="display:inline-flex;align-items:center;gap:3px"><span style="display:inline-block;width:6px;height:6px;background:${c};border-radius:1px"></span>${name}</span>`,
    )
    .join('');
  root.appendChild(legend);
  document.body.appendChild(root);

  // ---- drift reports ----
  function spreadOf(xs) { return Math.max(...xs) - Math.min(...xs); }

  // sidebar slot x-drift (icon column alignment)
  const slots = items.filter((it) => it.kind === 'sidebar-slot');
  let sidebarSlotDrift = null;
  if (slots.length >= 2) {
    const xs = slots.map((s) => s.bbox.x);
    sidebarSlotDrift = {
      count: slots.length,
      xs,
      spread: spreadOf(xs),
      ok: spreadOf(xs) <= 1,
      hint:
        spreadOf(xs) > 1
          ? "sidebar slots are NOT aligned on x. inspect items[] entries where kind='sidebar-slot' — slots whose bbox.x differs from the majority are the offenders. Their item.text identifies the row (e.g. 'P Pulse' is the brand row; 'JM Jordan Moss TEST' is the footer). grep the codebase for that text to find the JSX. usual cause: brand/footer wrap their slot in a <button> with extra px-* that nav rows don't have, OR they skip the inner padding wrapper entirely."
          : null,
    };
  }

  // main-chrome left-edge drift (chrome rows should share the same pl-*)
  const mainRows = items.filter((it) => it.kind === 'main-chrome');
  let mainChromeLeftDrift = null;
  if (mainRows.length >= 2) {
    const xs = mainRows.map((m) => m.bbox.x);
    mainChromeLeftDrift = {
      count: mainRows.length,
      xs,
      spread: spreadOf(xs),
      ok: spreadOf(xs) <= 1,
      hint:
        spreadOf(xs) > 1
          ? "main-pane chrome rows are NOT left-aligned. items[] entries where kind='main-chrome' should all share the same bbox.x. The drift means different chrome rows use different left padding — pick one --page-pl token and apply uniformly."
          : null,
    };
  }

  // main-area first-text-x drift — the alignment line a human's eye actually sees
  // (page title, filter chips, table column headers, first cell — all expected on one vertical line)
  const textAnchors = items
    .filter(
      (it) =>
        (it.kind === 'main-chrome' || it.kind === 'table-thead' || it.kind === 'table-first-row') &&
        it.firstTextX != null,
    )
    .map((it) => ({ n: it.n, kind: it.kind, x: it.firstTextX, text: it.text.slice(0, 30) }));
  let mainTextAnchorDrift = null;
  if (textAnchors.length >= 2) {
    const xs = textAnchors.map((a) => a.x);
    mainTextAnchorDrift = {
      count: textAnchors.length,
      anchors: textAnchors,
      spread: spreadOf(xs),
      ok: spreadOf(xs) <= 1,
      hint:
        spreadOf(xs) > 1
          ? "main area's first-column text anchors are NOT aligned. anchors[] shows the actual text-left-x for each chrome row + thead + first cell. The visible vertical line is where text starts, not where row borders start. Most common cause: title row uses pl-4 (16px) while table cells use inner px-3 (12px) — pick one --page-pl token and route every chrome row through it, then make table cell inner padding match (or the row padding compensates so 'row pl' + 'cell px' equals the same total as 'chrome pl')."
          : null,
    };
  }

  // cross-seam top alignment (first sidebar nav row top === first main-chrome top)
  const firstSidebarRow = items.find((it) => it.kind === 'sidebar-row' && it.bbox.y > 30);
  const firstMainRow = items.find((it) => it.kind === 'main-chrome');
  let crossSeamDrift = null;
  if (firstSidebarRow && firstMainRow) {
    const dy = Math.abs(firstSidebarRow.bbox.y - firstMainRow.bbox.y);
    crossSeamDrift = {
      sidebarFirstRowY: firstSidebarRow.bbox.y,
      mainFirstRowY: firstMainRow.bbox.y,
      dy,
      ok: dy <= 1,
      hint:
        dy > 1
          ? "first nav row (sidebar) top y ≠ first chrome row (main) top y. the cross-seam contract is: both panes have an outer chrome row of height --top-row-h, then an inner wrapper with paddingTop --row-gap-y, then the first content row. grep for any bare pt-/mt-/py- on the inner wrappers of <aside> and <main> — they must be identical."
          : null,
    };
  }

  // index is returned (for the calling tool) AND stashed on window for console use
  const result = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    items,
    counts: {
      'sidebar-slot': items.filter((it) => it.kind === 'sidebar-slot').length,
      'sidebar-row': items.filter((it) => it.kind === 'sidebar-row').length,
      'main-chrome': items.filter((it) => it.kind === 'main-chrome').length,
      'table-thead': items.filter((it) => it.kind === 'table-thead').length,
      'table-first-row': items.filter((it) => it.kind === 'table-first-row').length,
    },
    sidebarSlotDrift,
    mainChromeLeftDrift,
    mainTextAnchorDrift,
    crossSeamDrift,
    gridComplexity,
  };
  window.__taste_saas_audit = result;
  return result;
}
runOverlay.clear = function () {
  document.getElementById('__taste_saas_audit_overlay')?.remove();
};

// ───────────────────────────────────────────────────────────────
// Shell: a stable namespace on window so callers don't depend on
// the bare function name. After the snippet has been evaluated,
// the rest of the world only needs to know about window.__taste.
//
//   window.__taste.run()        → run overlay + return JSON index
//   window.__taste.clear()      → remove overlay
//   window.__taste.get()        → last-captured index without re-running
//   window.__taste.find(n)      → item by badge number
//   window.__taste.findText(s)  → items whose text contains s (case-insensitive)
//   window.__taste.drift()      → summary {sidebarSlot, mainChromeLeft, mainTextAnchor, crossSeam}
//
// The shell makes the snippet safe to inject multiple times: re-eval
// rebinds these helpers without duplicating overlay DOM.
// ───────────────────────────────────────────────────────────────
window.__taste = {
  version: 2,
  run() { return runOverlay(); },
  clear() { runOverlay.clear(); },
  get() { return window.__taste_saas_audit || null; },
  find(n) {
    const r = window.__taste_saas_audit;
    return r ? r.items.find((it) => it.n === Number(n)) || null : null;
  },
  findText(s) {
    const r = window.__taste_saas_audit;
    if (!r) return [];
    const q = String(s).toLowerCase();
    return r.items.filter((it) => (it.text || '').toLowerCase().includes(q));
  },
  drift() {
    const r = window.__taste_saas_audit;
    if (!r) return null;
    return {
      sidebarSlot: r.sidebarSlotDrift,
      mainChromeLeft: r.mainChromeLeftDrift,
      mainTextAnchor: r.mainTextAnchorDrift,
      crossSeam: r.crossSeamDrift,
    };
  },
  complexity() {
    const r = window.__taste_saas_audit;
    return r ? r.gridComplexity : null;
  },
};
