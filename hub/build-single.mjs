/* Inlines css + js into one self-contained file.
 *
 *   node build-single.mjs              -> dist/qareeb.html      (no external refs at all;
 *                                         for strict-CSP hosts such as published artifacts)
 *   node build-single.mjs --with-fonts -> dist/qareeb.web.html  (keeps the webfont <link>;
 *                                         for normal hosting, where the real Arabic face loads)
 *
 * The script list is DERIVED FROM index.html rather than typed here. It used
 * to be four hard-coded readFileSync calls, and when js/record.js and
 * js/consent.js were added to the page they were simply not inlined — the
 * single-file build kept a `<script src="js/record.js">` tag pointing at a
 * file that does not exist beside it, so the health record silently failed
 * to load in exactly the build meant to be self-contained, while the served
 * directory worked perfectly. A build that can omit a file the page needs is
 * not a build step, it is a second copy of the truth waiting to drift.
 *
 * Now: whatever index.html loads, this inlines. Adding a module to the page
 * is the only action required, and an unreadable file is a hard failure.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const withFonts = process.argv.includes('--with-fonts');
const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('src/styles/identity.css', 'utf8');
const css2 = readFileSync('css/qareeb.css', 'utf8');
const icon = readFileSync('favicon.svg', 'utf8');

let out = html
  .replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">',
           `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">`)
  .replace('<link rel="apple-touch-icon" href="favicon.svg">', '')
  .replace('<link rel="stylesheet" href="src/styles/identity.css">\n<link rel="stylesheet" href="css/qareeb.css">', `<style>\n${css}\n${css2}\n</style>`);

/* Order matters and is index.html's order: domain modules attach their
   globals before app.js reads them, and ui-record.js is last because it
   uses app.js's helpers. Preserving the page's own sequence is what keeps
   the two builds behaving identically. */
/* `defer` (and any other attribute) must be tolerated here. index.html defers
   all sixteen so the browser downloads them in parallel instead of making
   sixteen sequential round trips; a regex that only matched the bare form
   silently found zero scripts and the build refused to run — loudly, which is
   the only reason this was a one-line fix rather than a shipped empty page. */
const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (!tags.length) throw new Error('index.html has no local <script src> tags — refusing to build a page with no code');
for (const [tag, src] of tags) {
  const code = readFileSync(src, 'utf8');   /* throws loudly if the page references a missing file */
  out = out.replace(tag, `<script>\n${code}\n</script>`);
}

/* Nothing may reference a file that will not be beside it. */
const leftover = out.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/);
if (leftover) throw new Error('a script tag survived inlining: ' + leftover[0]);

if (!withFonts) out = out.replace(/<link rel="preconnect"[\s\S]*?rel="stylesheet">\n/, '');

mkdirSync('dist', { recursive: true });
const target = withFonts ? 'dist/qareeb.web.html' : 'dist/qareeb.html';
writeFileSync(target, out);
console.log(target, (out.length / 1024).toFixed(0) + ' KB',
  `(${tags.length} modules inlined${withFonts ? ', webfont linked' : ', fully self-contained'})`);
