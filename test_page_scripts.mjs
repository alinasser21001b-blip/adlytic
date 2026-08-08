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
process.exit(bad ? 1 : 0);
