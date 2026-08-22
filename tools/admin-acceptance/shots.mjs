// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/shots.mjs
//
//  The manual gate. Renders every Admin surface at three widths in both
//  writing directions and writes the images out for a human to look at.
//
//  Deliberately dumb: it asserts nothing. Everything this project can assert
//  is asserted elsewhere (audit.mjs, navigation.mjs, bindings.mjs,
//  meta-truth.mjs). What is left — does this look like one product, is the
//  Arabic set correctly, does the eye land where the work is — is a judgement
//  call, and pretending otherwise is how a gate goes green on a page nobody
//  ever looked at.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4599';
const OUT = process.env.OUT || '/tmp/admin-shots';
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  ['/admin', 'control-center'],
  ['/admin/meta', 'meta'],
  ['/admin/intelligence', 'intelligence'],
  ['/admin/operations', 'operations'],
  ['/admin/customers', 'customers'],
  ['/admin/support', 'support'],
  ['/admin/graph', 'system-graph'],
  // The three former legacy destinations, which are Control Plane surfaces now.
  ['/admin/observability', 'was-observability'],
  ['/admin/classic', 'was-classic'],
  ['/admin/inbox', 'was-inbox'],
];

const VIEWPORTS = [
  ['wide', 1680, 1000],
  ['1440', 1440, 900],
  ['1280', 1280, 800],
];

const DIRS = [
  ['rtl', 'ar'],
  ['ltr', 'en-US'],
];

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const shots = [];

for (const [dir, locale] of DIRS) {
  for (const [vpName, w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale });
    for (const [path, name] of SURFACES) {
      const page = await ctx.newPage();
      await page.goto(`${BASE}${path}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
      if (dir === 'ltr') await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
      await page.waitForTimeout(600);
      const file = `${OUT}/${dir}-${vpName}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const m = await page.evaluate(() => ({
        scrollW: document.body.scrollWidth,
        vw: document.documentElement.clientWidth,
        h: document.body.scrollHeight,
      }));
      shots.push({ dir, viewport: vpName, surface: name, file, ...m,
        horizontalScroll: m.scrollW > m.vw + 2 });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

writeFileSync(`${OUT}/index.json`, JSON.stringify(shots, null, 2));
const scrolls = shots.filter((s) => s.horizontalScroll);
console.log('\nADMIN_SCREENSHOT_GATE\n');
console.log(`SURFACES=${SURFACES.length}  VIEWPORTS=${VIEWPORTS.length}  DIRECTIONS=${DIRS.length}`);
console.log(`SHOTS_CAPTURED=${shots.length}`);
console.log(`HORIZONTAL_SCROLL=${scrolls.length}`);
for (const s of scrolls) console.log(`  ✗ ${s.dir}/${s.viewport}/${s.surface}: ${s.scrollW}px in ${s.vw}px`);
console.log(`OUT=${OUT}`);
