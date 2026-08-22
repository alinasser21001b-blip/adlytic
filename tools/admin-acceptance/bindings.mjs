// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/bindings.mjs
//
//  Every element a page's own script reaches for must exist in the page it
//  reaches for it in.
//
//  This exists because wrapping the legacy pages in the shell deleted chrome
//  their scripts still addressed — #access-gate, .app, the sidebar tabs, the
//  ticket filters — and the failures were SILENT: the throw landed inside the
//  page's own try/catch, the catch read it as "cannot verify access", and the
//  page rendered an empty frame that looked deliberate.
//
//  The check derives the id list from the shipped script text and resolves it
//  against the rendered DOM. Nothing is hand-maintained, so it cannot drift.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4599';
const SURFACES = [
  '/admin', '/admin/graph', '/admin/meta', '/admin/intelligence', '/admin/operations',
  '/admin/customers', '/admin/support', '/admin/observability', '/admin/classic',
  '/admin/inbox', '/admin/os', '/admin/meta-readiness', '/admin/brain-observatory',
  '/admin/add-client',
];

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' });

const dangling = [];
const selectorMisses = [];
for (const path of SURFACES) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const src = [...document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
    const ids = new Set();
    for (const m of src.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) ids.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*"([A-Za-z0-9_-]+)"\s*\)/g)) ids.add(m[1]);
    // A querySelector on a class the page then dereferences without a null
    // check is the same defect wearing a different selector.
    const classes = new Set();
    for (const m of src.matchAll(/querySelector\(\s*'(\.[A-Za-z0-9_-]+)'\s*\)\s*\.\s*[A-Za-z]/g)) classes.add(m[1]);
    // An id the script WRITES before it reads is not dangling — drawers,
    // modals and the phone flow paint their own markup and bind straight
    // after. Derive that from the shipped script rather than keeping a list:
    // if the id appears in an id="…" the script emits, it is script-owned.
    const emitted = new Set();
    for (const m of src.matchAll(/id=\\?["']([A-Za-z0-9_-]+)\\?["']/g)) emitted.add(m[1]);
    return {
      missingIds: [...ids].filter((id) => !document.getElementById(id) && !emitted.has(id)),
      missingClasses: [...classes].filter((c) => !document.querySelector(c)),
    };
  });
  for (const id of r.missingIds) dangling.push(`${path}: #${id}`);
  for (const c of r.missingClasses) selectorMisses.push(`${path}: ${c} dereferenced without a null check`);
  await page.close();
}
await ctx.close();
await browser.close();

console.log('\nADMIN_SCRIPT_BINDING_RESOLUTION\n');
console.log(`SURFACES_CHECKED=${SURFACES.length}`);
console.log(`DANGLING_ID_BINDINGS=${dangling.length}`);
for (const d of dangling) console.log('  ✗ ' + d);
console.log(`UNGUARDED_MISSING_SELECTORS=${selectorMisses.length}`);
for (const d of selectorMisses) console.log('  ✗ ' + d);
if (dangling.length || selectorMisses.length) process.exit(1);
