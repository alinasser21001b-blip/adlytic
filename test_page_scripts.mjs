// ════════════════════════════════════════════════════════════════════════
//  test_page_scripts.mjs — every inline <script> must actually parse.
//
//  tsc CANNOT catch this class of bug. The browser JS lives inside
//  TypeScript template literals, so to the compiler it is an opaque string:
//  a stray '+', an unbalanced brace, or a backtick typechecks perfectly and
//  takes the whole 160KB bundle down at runtime, leaving a blank page.
//
//  This has now happened seven times in this project:
//    · a missing '}' in renderMorningStory (the original outage)
//    · a backtick inside a template literal, five separate times
//    · escHtml(a + || b) — a multi-line fallback picking up the leading '+'
//      of its continuation line, which broke the dashboard AND campaigns
//
//  The mobile viewport gate catches these too, but it takes ~15 minutes and
//  needs a browser. This runs in under a second, so there is no excuse for
//  not running it before every commit that touches a page file.
//
//  Prereq: pages rendered via `npx tsx scripts/render-pages.mts`.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0;
let scripts = 0;
for (const f of readdirSync('.mobile-pages').filter((n) => n.endsWith('.html'))) {
  const html = readFileSync('.mobile-pages/' + f, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    i++;
    scripts++;
    try {
      // Compiles (and therefore parses) without executing. A syntax error
      // throws here exactly as it would in the browser.
      new vm.Script(m[1], { filename: `${f}#${i}` });
    } catch (e) {
      bad++;
      const line = e.lineNumber ?? Number(String(e.stack).match(/#\d+:(\d+)/)?.[1] ?? 0);
      const src = line ? (m[1].split('\n')[line - 1] || '') : '';
      console.error(`✗ ${f} script#${i}: ${e.message}`);
      if (src) console.error(`    line ${line}: ${src.trim().slice(0, 110)}`);
    }
  }
}
console.log(`\n${scripts} inline scripts parsed, ${bad} failed`);

// ── Breakpoint scale ──────────────────────────────────────────────────
// 19 ad-hoc breakpoints had accumulated (700, 720, 760, 800 and 768 all in
// use, meaning four near-identical reflows nobody could reason about).
// They are consolidated onto one scale; this keeps them there. A new value
// is not forbidden — it just has to be a deliberate addition to the scale
// rather than a number typed into one file.
const SCALE = new Set([380, 560, 640, 768, 769, 900, 1024]);
const offScale = new Map();
for (const f of readdirSync('src/web', { recursive: true })) {
  if (typeof f !== 'string' || !f.endsWith('.ts')) continue;
  const src = readFileSync('src/web/' + f, 'utf8');
  for (const mq of src.match(/@media[^{]*/g) || []) {
    for (const m of mq.matchAll(/(?:max|min)-width:\s*(\d+)px/g)) {
      const px = Number(m[1]);
      if (!SCALE.has(px)) offScale.set(px, (offScale.get(px) || 0) + 1);
    }
  }
}
let scaleBad = 0;
if (offScale.size) {
  scaleBad = 1;
  console.error(`✗ off-scale breakpoints: ${[...offScale.entries()].map(([p, n]) => `${p}px x${n}`).join(', ')}`);
  console.error(`   the scale is ${[...SCALE].sort((a, b) => a - b).join(' / ')}`);
} else {
  console.log(`breakpoint scale clean: ${[...SCALE].sort((a, b) => a - b).join(' / ')}`);
}


// ── Token contrast ────────────────────────────────────────────────────
// Every text colour must clear WCAG AA against EVERY surface it can sit on,
// not just the page ground.
//
// This exists because the Daylight handoff measured all ratios against
// --bg (#F2F7F4) and shipped two colours that fail on --surface-2 (#E8F0EA),
// which is darker: --text-3 at 4.42:1 and --warning at 4.22:1. Both are used
// on raised surfaces throughout. A ratio is meaningless without naming the
// backdrop it was measured against.
const SURFACES = { '--bg': '#F2F7F4', '--surface': '#FFFFFF', '--surface-2': '#E8F0EA' };
const TEXT_ON_ANY = ['--text', '--text-2', '--text-3', '--success', '--warning', '--error', '--critical', '--info'];

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const layoutSrc = readFileSync('src/web/layout.ts', 'utf8');
const tokenHex = (name) => (layoutSrc.match(new RegExp(name + ':\\s*(#[0-9A-Fa-f]{6})')) || [])[1];

let contrastBad = 0;
for (const t of TEXT_ON_ANY) {
  const fg = tokenHex(t);
  if (!fg) { console.error(`✗ token ${t} not found in layout.ts`); contrastBad++; continue; }
  for (const [sName, sHex] of Object.entries(SURFACES)) {
    const r = contrast(fg, sHex);
    if (r < 4.5) {
      console.error(`✗ ${t} (${fg}) on ${sName} (${sHex}) = ${r.toFixed(2)}:1 — needs 4.5`);
      contrastBad++;
    }
  }
}
if (!contrastBad) console.log(`contrast clean: ${TEXT_ON_ANY.length} text tokens x ${Object.keys(SURFACES).length} surfaces, all >= 4.5:1`);

process.exit(bad || scaleBad || contrastBad ? 1 : 0);
