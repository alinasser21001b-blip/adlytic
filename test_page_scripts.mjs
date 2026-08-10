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


// ── Control-boundary contrast (WCAG 1.4.11) ───────────────────────────
// A separator may be faint. The line around a text field may not: it is
// the only thing telling someone where to type. --border shipped at
// 1.13:1 on --surface-2 and a customer reading the form said it looked
// empty. --border-control is the token that has to clear 3:1, on every
// ground a control can sit on.
const ctl = tokenHex('--border-control');
if (!ctl) { console.error('✗ --border-control not found in layout.ts'); contrastBad++; }
else {
  let worst = Infinity, worstOn = '';
  for (const [sName, sHex] of Object.entries(SURFACES)) {
    const r = contrast(ctl, sHex);
    if (r < worst) { worst = r; worstOn = sName; }
    if (r < 3) { console.error(`✗ --border-control (${ctl}) on ${sName} (${sHex}) = ${r.toFixed(2)}:1 — needs 3`); contrastBad++; }
  }
  if (worst >= 3) console.log(`control boundary clean: --border-control worst case ${worst.toFixed(2)}:1 on ${worstOn}`);
}

// Every interactive control must take its boundary from that token, not
// from --border. Listed by name so adding a control is a deliberate act.
const CONTROLS = [
  ['src/web/layout.ts', '.form-input'],
  ['src/web/layout.ts', '.btn-secondary'],
  ['src/web/layout.ts', '.tabs'],
  ['src/web/pages/addClientPage.ts', '.field'],
  ['src/web/pages/addClientPage.ts', '.mf-input, .mf-select'],
  ['src/web/pages/addClientPage.ts', '.btn-secondary'],
  ['src/web/pages/adminConsolePage.ts', '.field'],
  ['src/web/pages/adminConsolePage.ts', '.btn-secondary'],
  ['src/web/pages/adminInboxPage.ts', '.field'],
  ['src/web/pages/adminInboxPage.ts', '.compose-area'],
  ['src/web/pages/adminInboxPage.ts', '.btn-secondary'],
  ['src/web/pages/dashboard/dashboardStyles.ts', '.qa-chip'],
];
for (const [file, sel] of CONTROLS) {
  const src = readFileSync(file, 'utf8');
  // The rule body from the selector to its closing brace.
  const i = src.indexOf(sel + ' {');
  const body = i < 0 ? '' : src.slice(i, src.indexOf('}', i));
  if (!body) { console.error(`✗ ${sel} not found in ${file}`); contrastBad++; continue; }
  if (/border(-\w+)?:[^;]*var\(--border\)/.test(body)) {
    console.error(`✗ ${sel} (${file}) draws its boundary with var(--border) — a control needs var(--border-control)`);
    contrastBad++;
  }
}


// ── One source of colour ──────────────────────────────────────────────
// /add-client carried a private :root full of dark-theme hexes. When the
// product went light it stayed black — not because anyone changed it, but
// because nobody could: the page was not reading the design system at
// all. A page may link TOKENS_CSS; it may not redeclare the tokens.
const TOKEN_NAMES = /--(bg|surface|surface-2|border|border-2|border-control|text|text-2|text-3|accent|accent-2|success|warning|error|critical|info)\s*:\s*(#|rgb)/;
let rootBad = 0;
for (const f of readdirSync('src/web/pages', { recursive: true })) {
  if (typeof f !== 'string' || !f.endsWith('.ts')) continue;
  const src = readFileSync('src/web/pages/' + f, 'utf8');
  for (const m of src.matchAll(/:root\s*{([^}]*)}/g)) {
    if (TOKEN_NAMES.test(m[1])) {
      console.error(`✗ src/web/pages/${f} declares design tokens in its own :root — link TOKENS_CSS_PATH instead`);
      rootBad++;
    }
  }
}
if (!rootBad) console.log('token ownership clean: no page redeclares a design token');


// ── Duplicate element ids ─────────────────────────────────────────────
// The auth pages render the logo twice, and both copies carried the same
// gradient ids. url(#id) and getElementById both bind to the FIRST match
// in document order — which on a phone was the copy inside
// `.auth-brand { display: none }`, where a paint server resolves to
// nothing. The visible mark rendered as a bare plate for months.
//
// Same failure mode, wider blast radius: a duplicated id on a control
// means addEventListener wires the hidden copy and the visible button
// does nothing. Cheap to check, so check it everywhere.
//
// <script> and <style> are stripped first: they contain id="..." inside
// JS template strings for branches that are mutually exclusive at
// runtime, and counting those reports collisions that cannot happen.
let dupBad = 0;
for (const f of readdirSync('.mobile-pages').filter((n) => n.endsWith('.html'))) {
  const html = readFileSync('.mobile-pages/' + f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1);
  if (dup.length) {
    console.error(`✗ ${f}: duplicate id ${dup.map(([k, n]) => `${k} x${n}`).join(', ')}`);
    dupBad++;
  }
}
if (!dupBad) console.log('id uniqueness clean: no page renders a duplicate element id');


// ── One numeral system ────────────────────────────────────────────────
// Metrics are formatted with Latin digits everywhere: 390,000 / 84 / 38.
// Seven date formatters asked for a plain Arabic locale, which emits
// Arabic-Indic digits, so one screen showed "38/100" beside
// "آخر تحديث ٨ آب ١٢:٠٠". Both are correct Arabic; mixing them in one
// view is not. The convention is 'ar-u-nu-latn' — Arabic month names,
// Latin numerals — and this keeps it.
let numeralBad = 0;
for (const dir of ['src/web']) {
  for (const f of readdirSync(dir, { recursive: true })) {
    if (typeof f !== 'string' || !f.endsWith('.ts')) continue;
    const src = readFileSync(dir + '/' + f, 'utf8');
    for (const m of src.matchAll(/toLocale(?:Date|Time)?String\(\s*'(ar[^']*)'/g)) {
      if (m[1] === 'ar-u-nu-latn') continue;
      console.error(`✗ ${dir}/${f}: toLocale…('${m[1]}') emits Arabic-Indic digits — use 'ar-u-nu-latn'`);
      numeralBad++;
    }
  }
}
if (!numeralBad) console.log("numerals clean: every Arabic date formatter uses 'ar-u-nu-latn'");


// ── One palette ───────────────────────────────────────────────────────
// Daylight replaced the tokens but left 199 rgba() literals from the old
// dark ramps sitting in nine customer pages, so panels kept their gold
// borders months after the gold was gone. Charts were worse: they are canvas,
// which cannot read var(), so 55 colours were hardcoded hexes and the charts
// were still painted entirely for the previous theme.
//
// Two rules follow, and they pull in opposite directions on purpose:
//   · CSS may not hardcode a colour from the retired ramps — use a token.
//   · Canvas may not be handed a var() string — it is silently ignored and
//     the context keeps its previous colour, which for a fresh context is
//     black. Route it through cssVar(), which reads the token at runtime.
const RETIRED_RAMPS = [
  ['217,167,89', 'the old gold brand ramp'],
  ['52,168,113', 'the old success green'],
  ['199,122,31', 'the old warning orange'],
  ['226,96,79', 'the old error red'],
  ['224,114,100', 'the old error red (variant)'],
  ['123,174,194', 'the old info blue'],
];
let paletteBad = 0;
for (const dir of ['src/web']) {
  for (const f of readdirSync(dir, { recursive: true })) {
    if (typeof f !== 'string' || !f.endsWith('.ts')) continue;
    const src = readFileSync(dir + '/' + f, 'utf8');
    for (const [rgb, what] of RETIRED_RAMPS) {
      const re = new RegExp(`rgba\\(\\s*${rgb.replace(/,/g, ',\\s*')}`, 'g');
      const hits = [...src.matchAll(re)].length;
      if (hits) {
        console.error(`✗ ${dir}/${f}: ${hits}x rgba(${rgb}…) — ${what}; use a design token`);
        paletteBad++;
      }
    }
    // Canvas colour properties must never receive a var() string.
    for (const m of src.matchAll(/(fillStyle|strokeStyle|shadowColor)\s*=\s*['"]var\(--/g)) {
      const upTo = src.slice(0, m.index);
      const line = upTo.split('\n').length;
      // The rule is DESCRIBED in cssVar's own docstring, so a naive scan
      // flags the documentation explaining the rule — on a CONTINUATION line
      // of a block comment, which no "does this line start with //" check
      // catches. Ask whether the match sits inside a comment instead: is the
      // nearest preceding /* later than the nearest preceding */?
      const inBlockComment = upTo.lastIndexOf('/*') > upTo.lastIndexOf('*/');
      const lineText = src.split('\n')[line - 1] ?? '';
      if (inBlockComment || /^\s*\/\//.test(lineText)) continue;
      console.error(`✗ ${dir}/${f}:${line} assigns var() to ctx.${m[1]} — canvas ignores it and keeps the previous colour; use cssVar()`);
      paletteBad++;
    }
  }
}
if (!paletteBad) console.log('palette clean: no retired ramp in CSS, no var() handed to a canvas');

process.exit(bad || scaleBad || contrastBad || rootBad || dupBad || numeralBad || paletteBad ? 1 : 0);
