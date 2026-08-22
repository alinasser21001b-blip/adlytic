// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/audit.mjs
//
//  Drives the rendered Control Plane and reports what an operator would see.
//
//  This is not a screenshot generator. Each surface is inspected for the
//  failures a source-code review cannot catch: an empty state that renders as
//  a blank card, a table that pushes the page sideways, an Arabic label that
//  overflows its cell, a status chip that lost its dashed treatment, a card
//  that is 80% whitespace.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4599';
const OUT = process.env.OUT || '/tmp/admin-audit';
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  ['/admin', 'control-center'],
  ['/admin/graph', 'graph'],
  ['/admin/meta', 'meta'],
  ['/admin/intelligence', 'intelligence'],
  ['/admin/operations', 'operations'],
  ['/admin/customers', 'customers'],
  ['/admin/support', 'support'],
  // Once a legacy page is wrapped in the shell it stops being legacy: it is a
  // Control Plane surface and is held to the same composition standard. A gate
  // that audits only the pages we authored would grade its own homework.
  ['/admin/observability', 'observability'],
  ['/admin/classic', 'classic'],
  ['/admin/inbox', 'inbox'],
  ['/admin/os', 'admin-os'],
  ['/admin/meta-readiness', 'meta-readiness'],
];

const VIEWPORTS = [
  { name: 'wide', width: 1680, height: 1000 },
  { name: 'laptop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
];

const findings = [];
function finding(severity, surface, scenario, viewport, what) {
  findings.push({ severity, surface, scenario, viewport, what });
}

/** Measurements a source review cannot make. */
async function inspect(page, surface, scenario, viewport) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const overflowing = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // An element pushing past the viewport edge in RTL or LTR.
      if (r.right > vw + 2 || r.left < -2) {
        // Walk ancestors once: a fixed ancestor means the element is a drawer
        // or palette child, which lives offscreen by design; a scrolling
        // ancestor means the content is meant to scroll inside its own box.
        let skip = false;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.position === 'fixed') { skip = true; break; }
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') { skip = true; break; }
        }
        if (skip) continue;
        overflowing.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
      }
    }
    // Cells whose text is clipped or bursting.
    const clipped = [];
    for (const el of document.querySelectorAll('td, th, .nav-item, .ctx-v, .tk-s, .pt-k, .sub-k')) {
      if (el.scrollWidth > el.clientWidth + 4) {
        clipped.push(`${el.tagName.toLowerCase()}: ${el.textContent.trim().slice(0, 40)}`);
      }
    }
    // Cards that are mostly empty — the "sparse admin" complaint, measured.
    const sparse = [];
    for (const el of document.querySelectorAll('.card')) {
      const r = el.getBoundingClientRect();
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (r.height > 220 && text.length < 60) {
        sparse.push(`${(el.className || '').toString()} h=${Math.round(r.height)} text=${text.length}`);
      }
    }
    // Effective label size after the viewBox scales the SVG down. A graph whose
    // labels land under ~6 CSS pixels is decoration: it looks like information
    // and cannot be read, which is worse than showing a table.
    let graphLabelPx = null;
    const gsvg = document.querySelector('.gv-canvas');
    if (gsvg && gsvg.getAttribute('viewBox')) {
      const vb = gsvg.getAttribute('viewBox').split(' ').map(Number);
      const box = gsvg.getBoundingClientRect();
      const t = gsvg.querySelector('.gv-node text');
      // preserveAspectRatio defaults to 'meet', so the content scales to fit
      // the CONSTRAINING axis. Measuring width alone reported 23px for a graph
      // that was actually rendering at 4px, because height was the constraint.
      if (t && vb[2] > 0 && vb[3] > 0 && box.width > 0 && box.height > 0) {
        const scale = Math.min(box.width / vb[2], box.height / vb[3]);
        graphLabelPx = Number(t.getAttribute('font-size') || 10) * scale;
      }
    }
    // ── Composition measurements ─────────────────────────────────────
    //
    // The previous audit measured STRUCTURE — overflow, skeletons, chips — and
    // went green on a page that was dumping serialized JSON into the operator's
    // face with 60% of the viewport empty. These measure whether the page says
    // anything comprehensible, which is the thing that actually failed.

    // 1. Raw JSON in visible text. Anything outside a <details> disclosure.
    const jsonLeaks = [];
    for (const el of document.querySelectorAll('.page-inner *')) {
      if (el.children.length) continue;                       // leaf text only
      if (el.closest('details')) continue;                    // disclosed = allowed
      const t = (el.textContent || '').trim();
      if (t.length > 24 && /\{\s*"[\w-]+"\s*:/.test(t)) {
        jsonLeaks.push(t.slice(0, 60));
      }
    }

    // 1b. Language artifacts. `undefined`, `NaN` and `[object Object]` are the
    //     same defect as raw JSON wearing plainer clothes: an internal value
    //     that escaped without being read. The JSON check misses them because
    //     they carry no braces, and a screenshot is the only reason we caught
    //     «آخر undefined أيام» and «محسوبة منذ NaN ساعة» — which is exactly the
    //     kind of thing that should not need an eye.
    const artifacts = [];
    for (const el of document.querySelectorAll('.page-inner *')) {
      if (el.children.length) continue;
      if (el.closest('details')) continue;   // disclosed raw payload = allowed
      const t = (el.textContent || '').trim();
      if (!t) continue;
      // Word-bounded so a legitimate word containing them is not flagged, and
      // an element that IS the literal string counts too.
      if (/(^|[\s(:،·])(undefined|NaN|\[object Object\]|null)([\s).,،·]|$)/.test(t)) {
        artifacts.push(t.slice(0, 70));
      }
      // A full ISO-8601 timestamp is a machine value too. The formatted
      // stamps this product renders ("2026-08-01 10:00 قبل 22 يوم") do not
      // match; only an unformatted one with its T and Z does.
      if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/.test(t)) {
        artifacts.push('raw ISO timestamp: ' + t.slice(0, 60));
      }
    }

    // 1c. Arabic must never be set in a monospace face.
    //     A monospace font pins every glyph to one advance width. Latin
    //     survives that; Arabic does not — the cursive joins stretch and words
    //     visibly come apart, which is what the graph's node labels were doing
    //     to «خدمة الواجهة» and «قاعدة البيانات». The rule the product already
    //     follows is identifiers mono, prose in the body face; this checks it
    //     against what actually rendered.
    const monoArabic = [];
    for (const el of document.querySelectorAll('.page-inner *, svg text')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t || !/[\u0600-\u06FF]/.test(t)) continue;
      const fam = getComputedStyle(el).fontFamily.toLowerCase();
      if (/mono|courier|consolas/.test(fam)) monoArabic.push(t.slice(0, 40));
    }

    // 2. Content occupancy: how much of the rendered page height carries
    //    content, versus how much is background. Detects the "two small cards
    //    stranded at the top of a 1600px page" pathology.
    const inner = document.querySelector('.page-inner');
    let occupancy = null, lastContentY = 0;
    if (inner) {
      // Measure the LAST rendered thing, whatever its class. A hand-kept
      // selector list is how the first version of this metric reported the
      // graph page at 20%: the graph's own container was not on the list, so
      // it measured the card above it and called the page empty.
      for (const el of inner.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        lastContentY = Math.max(lastContentY, r.bottom + window.scrollY);
      }
      const pageH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      occupancy = Math.round((lastContentY / pageH) * 100);
    }

    // 3. Primary labels that got clipped — a truncated heading is a defect a
    //    structural check never sees.
    const clippedPrimary = [];
    for (const el of document.querySelectorAll('.phead-t, .sec-t, .h2, .stat-k, .stat-v')) {
      if (el.scrollWidth > el.clientWidth + 4) clippedPrimary.push((el.textContent || '').trim().slice(0, 40));
    }

    // 4. Legacy shell leakage: a Control Plane page must not render a second
    //    product's chrome.
    const legacyShell = document.querySelectorAll('.os, .console-shell, .admin-classic').length;

    // 5. Meters that render nothing. An element exists, is sized, does not
    //    overflow and is not JSON — and still carries no information because
    //    its fill is zero pixels wide. Structural checks are blind to this.
    const deadMeters = [];
    for (const fill of document.querySelectorAll('.barfill, .meter-fill, .progress-fill')) {
      // A meter inside an inactive tab is not displayed, so it has no width and
      // no reader. Only a VISIBLE meter that renders nothing is a defect.
      if (!fill.getClientRects().length) continue;
      if (fill.closest('.view:not(.on)')) continue;
      const w = fill.getBoundingClientRect().width;
      const declared = (fill.getAttribute('style') || '').match(/width:\s*([\d.]+)%/);
      if (w < 1 && declared && Number(declared[1]) > 0) {
        deadMeters.push(`${fill.className} declared ${declared[1]}% rendered ${w.toFixed(1)}px`);
      }
    }

    // 6. Card edges vs their own content. A table rendering outside the card
    //    that contains it is a composition defect no overflow check sees,
    //    because nothing leaves the viewport.
    const misaligned = [];
    for (const card of document.querySelectorAll('.page-inner .card')) {
      const c = card.getBoundingClientRect();
      if (c.width === 0) continue;
      for (const child of card.children) {
        const r = child.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < c.left - 1.5 || r.right > c.right + 1.5) {
          misaligned.push(`${child.tagName.toLowerCase()} sits ${Math.round(Math.max(c.left - r.left, r.right - c.right))}px outside its card`);
        }
      }
    }

    const skeletons = document.querySelectorAll('.skel').length;
    const emptyCells = [...document.querySelectorAll('.empty')].map((e) => e.textContent.trim()).slice(0, 6);
    const chips = [...document.querySelectorAll('.st-chip')].map((c) => ({
      cls: c.className, title: c.getAttribute('title'), text: c.textContent.trim(),
      dashed: getComputedStyle(c).borderStyle,
    }));
    return {
      bodyScrollW: document.body.scrollWidth, vw,
      overflowing: [...new Set(overflowing)].slice(0, 8),
      clipped: [...new Set(clipped)].slice(0, 8),
      sparse, skeletons, emptyCells, chips, graphLabelPx,
      jsonLeaks,
      artifacts, monoArabic, occupancy, clippedPrimary, legacyShell, deadMeters, misaligned,
      activeNav: [...document.querySelectorAll('.nav-item.active')].map((a) => a.getAttribute('href')),
      dir: doc.getAttribute('dir'),
      railCount: document.querySelectorAll('.rail').length,
      h1: (document.querySelector('h1') || {}).textContent || '',
      visibleText: document.body.innerText.replace(/\s+/g, ' ').trim().length,
    };
  });

  if (m.bodyScrollW > m.vw + 2) {
    finding('HIGH', surface, scenario, viewport, `page scrolls horizontally (${m.bodyScrollW} > ${m.vw})`);
  }
  for (const o of m.overflowing) finding('HIGH', surface, scenario, viewport, `element overflows viewport: ${o}`);
  for (const c of m.clipped) finding('MEDIUM', surface, scenario, viewport, `text clipped: ${c}`);
  for (const s of m.sparse) finding('MEDIUM', surface, scenario, viewport, `sparse card: ${s}`);
  if (m.skeletons > 0) finding('MEDIUM', surface, scenario, viewport, `${m.skeletons} skeleton(s) never resolved`);
  for (const a of [...new Set(m.misaligned)]) {
    finding('HIGH', surface, scenario, viewport, `card composition: ${a}`);
  }
  for (const d of m.deadMeters) {
    finding('HIGH', surface, scenario, viewport, `meter renders nothing: ${d}`);
  }
  for (const j of m.jsonLeaks) {
    finding('HIGH', surface, scenario, viewport, `raw JSON in primary UI: ${j}`);
  }
  for (const a of [...new Set(m.artifacts)]) {
    finding('HIGH', surface, scenario, viewport, `internal value rendered to the operator: ${a}`);
  }
  for (const a of [...new Set(m.monoArabic)]) {
    finding('MEDIUM', surface, scenario, viewport, `Arabic set in a monospace face: ${a}`);
  }
  // Only pathological emptiness, and only where there is data to render.
  //
  // A failure or empty-platform scenario legitimately has little to show, and
  // demanding those fill a screen would mean padding — which is the same
  // disease as the whitespace it is meant to catch. So the metric applies to
  // scenarios that DO carry data; the sparse-card and skeleton checks cover
  // the rest.
  const DATA_SCENARIOS = ['healthy', 'partial_data', 'stale_workspace', 'meta_disconnected'];
  if (m.occupancy !== null && m.occupancy < 45 && DATA_SCENARIOS.includes(scenario)) {
    finding('MEDIUM', surface, scenario, viewport,
      `content occupies only ${m.occupancy}% of page height — pathological emptiness`);
  }
  for (const c of m.clippedPrimary) {
    finding('HIGH', surface, scenario, viewport, `primary label truncated: ${c}`);
  }
  if (m.legacyShell > 0) {
    finding('HIGH', surface, scenario, viewport, `legacy shell markup leaked into a Control Plane page`);
  }
  if (m.activeNav.length !== 1) {
    finding('MEDIUM', surface, scenario, viewport,
      `${m.activeNav.length} active nav items — the operator cannot tell where they are`);
  }
  if (m.graphLabelPx !== null && m.graphLabelPx < 6) {
    finding('HIGH', surface, scenario, viewport,
      `graph labels render at ${m.graphLabelPx.toFixed(1)}px — unreadable, the graph is decoration`);
  }
  if (m.railCount !== 1) finding('HIGH', surface, scenario, viewport, `expected 1 sidebar, found ${m.railCount}`);
  if (m.dir !== 'rtl') finding('HIGH', surface, scenario, viewport, `dir is ${m.dir}, expected rtl`);
  if (m.visibleText < 260) finding('HIGH', surface, scenario, viewport, `almost no visible text (${m.visibleText} chars)`);

  // Absence must stay dashed wherever a chip renders it.
  for (const c of m.chips) {
    const absent = ['UNKNOWN', 'NOT_TESTED', 'INSUFFICIENT_DATA', 'NOT_REACHED', 'NOT_GOVERNED', 'NOT_VETOED'];
    if (absent.includes(c.title) && !c.cls.includes('st-absent')) {
      finding('HIGH', surface, scenario, viewport, `absence chip ${c.title} lost its absence class`);
    }
    if (absent.includes(c.title) && c.dashed !== 'dashed') {
      finding('HIGH', surface, scenario, viewport, `absence chip ${c.title} is not dashed (${c.dashed})`);
    }
  }
  return m;
}

// The pinned @playwright/test wants a browser build this image does not
// carry. Use the one that is installed rather than downloading — the audit is
// about the pages, not about Playwright's version.
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const report = [];
const scenarios = (process.env.SCENARIOS || 'healthy,meta_disconnected,database_unhealthy,redis_not_configured,worker_unavailable,no_workspaces,partial_data,unknown_intelligence,api_errors,graph_adapter_failure,graph_empty').split(',');

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ar' });
  for (const [path, name] of SURFACES) {
    for (const scenario of scenarios) {
      const page = await ctx.newPage();
      // Two different things, kept apart. An uncaught exception is always a
      // defect. A console error from a fetch that the FIXTURE deliberately
      // failed is the browser narrating the scenario — the defect there would
      // be the page not handling it, which the skeleton check catches.
      const errors = [];
      const failedRequests = [];
      page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        if (/Failed to load resource/.test(msg.text())) return;
        errors.push(msg.text());
      });
      page.on('requestfailed', (r) => failedRequests.push(r.url()));
      page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
      try {
        await page.goto(`${BASE}${path}?scenario=${scenario}`, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(450);
        const m = await inspect(page, name, scenario, vp.name);
        for (const e of errors) {
          if (/favicon|fonts\//.test(e)) continue;
          finding('HIGH', name, scenario, vp.name, `JS error: ${e.slice(0, 140)}`);
        }
        // In a healthy scenario nothing should fail — a 404 there is a real
        // wiring bug, not the fixture doing its job.
        if (scenario === 'healthy') {
          for (const f of failedRequests) {
            if (/fonts\//.test(f)) continue;
            finding('HIGH', name, scenario, vp.name, `request failed on the happy path: ${f.replace('http://127.0.0.1:4599', '')}`);
          }
        }
        report.push({ surface: name, scenario, viewport: vp.name, ...m,
          jsErrors: errors.length, failedRequests: [...new Set(failedRequests)] });
        if (vp.name === 'wide' && ['healthy', 'no_workspaces', 'api_errors', 'graph_adapter_failure'].includes(scenario)) {
          await page.screenshot({ path: `${OUT}/${name}-${scenario}.png`, fullPage: true });
        }
      } catch (e) {
        finding('HIGH', name, scenario, vp.name, `page failed to load: ${e.message.slice(0, 120)}`);
      }
      await page.close();
    }
  }
  await ctx.close();
}

// One LTR pass — the layout must not depend on RTL to hold together.
const ltr = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' });
for (const [path, name] of SURFACES) {
  const page = await ltr.newPage();
  await page.goto(`${BASE}${path}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate(() => { document.documentElement.setAttribute('dir', 'ltr'); });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth, vw: document.documentElement.clientWidth,
    railLeft: (document.querySelector('.rail') || {}).getBoundingClientRect
      ? document.querySelector('.rail').getBoundingClientRect().left : null,
  }));
  if (m.bodyScrollW > m.vw + 2) finding('MEDIUM', name, 'ltr', 'desktop', `LTR page scrolls horizontally`);
  report.push({ surface: name, scenario: 'ltr', viewport: 'desktop', ...m });
  await page.close();
}
await ltr.close();
await browser.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify({ findings, report }, null, 2));
const bySev = findings.reduce((a, f) => (a[f.severity] = (a[f.severity] || 0) + 1, a), {});
console.log('FINDINGS', JSON.stringify(bySev));
const seen = new Set();
for (const f of findings) {
  const k = `${f.severity}|${f.surface}|${f.what}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  [${f.severity}] ${f.surface} (${f.scenario}/${f.viewport}): ${f.what}`);
}
console.log(`\nscreenshots + report → ${OUT}`);
