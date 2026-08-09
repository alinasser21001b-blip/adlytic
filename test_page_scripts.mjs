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

process.exit(bad || scaleBad ? 1 : 0);
