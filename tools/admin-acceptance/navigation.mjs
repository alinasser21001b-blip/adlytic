// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/navigation.mjs
//
//  ADMIN_NAVIGATION_TRANSITION_MATRIX — every move, driven end to end.
//
//  Auditing pages one at a time is how a console ends up with seven good
//  screens and a broken product: each renders correctly, and moving between
//  them loses the shell, the context, or the operator's place. So this walks
//  the transitions instead, and asks the same questions at every arrival.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4599';
const OUT = process.env.OUT || '/tmp/admin-nav';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** from → to. A `via` selector means "click this", not "type a URL". */
const TRANSITIONS = [
  ['/admin', '/admin/meta', 'sidebar'],
  ['/admin/meta', '/admin/meta#connections', 'tab'],
  ['/admin/meta#connections', '/admin/meta#quota', 'tab'],
  ['/admin/meta#quota', '/admin/meta#capabilities', 'tab'],
  ['/admin/meta#capabilities', '/admin/meta#entities', 'tab'],
  ['/admin/meta#entities', '/admin/meta#sync', 'tab'],
  ['/admin/meta#sync', '/admin/meta#coverage', 'tab'],
  ['/admin/meta#coverage', '/admin/meta#failures', 'tab'],
  ['/admin/meta', '/admin/intelligence', 'sidebar'],
  ['/admin/intelligence', '/admin/operations', 'sidebar'],
  ['/admin/operations', '/admin/customers', 'sidebar'],
  ['/admin/customers', '/admin/support', 'sidebar'],
  ['/admin/support', '/admin/graph', 'sidebar'],
  ['/admin/graph', '/admin', 'sidebar'],
  ['/admin', '/admin/brain-observatory', 'sidebar'],
  ['/admin', '/admin/add-client', 'sidebar'],
  // The three former legacy fallbacks. They are reached by a button inside
  // the workspace that replaced them, not from the sidebar — and they must
  // arrive inside the same Control Plane.
  ['/admin/operations', '/admin/observability', 'inpage'],
  ['/admin/customers', '/admin/classic', 'inpage'],
  ['/admin/support', '/admin/inbox', 'inpage'],
];

/** Routes the Control Plane still links into. Each must be classified. */
const LEGACY_TARGETS = ['/admin/classic', '/admin/observability', '/admin/inbox', '/admin/os'];

const rows = [];
const defects = [];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ar' });

async function inspect(page) {
  return page.evaluate(() => ({
    url: location.pathname + location.hash,
    rails: document.querySelectorAll('.rail').length,
    shell: !!document.querySelector('.shell') && !!document.querySelector('.ctxbar'),
    activeNav: [...document.querySelectorAll('.nav-item.active')].map((a) => a.getAttribute('href')),
    activeTab: (document.querySelector('.view-tab.active') || {}).textContent || null,
    visibleView: (document.querySelector('.view.on') || {}).id || null,
    title: (document.querySelector('.phead-t') || document.querySelector('h1') || {}).textContent || '',
    ctxFilled: [...document.querySelectorAll('.ctx')].filter((c) => !c.classList.contains('is-unset')).length,
    legacyChrome: document.querySelectorAll('.os, .console-shell').length,
  }));
}

for (const [from, to, via] of TRANSITIONS) {
  const page = await ctx.newPage();
  const row = { from, to, via };
  try {
    await page.goto(`${BASE}${from}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(400);
    const before = await inspect(page);

    // Navigate the way an operator would: by clicking.
    const target = to.split('#')[0];
    const hash = to.includes('#') ? to.split('#')[1] : null;
    let clicked = false;
    if (via === 'tab' && hash) {
      const tabs = await page.$$('.view-tab[data-view]');
      for (const t of tabs) {
        if (await t.getAttribute('data-view') === hash) { await t.click(); clicked = true; break; }
      }
    } else if (via === 'inpage') {
      const link = await page.$(`a[href="${target}"]`);
      if (link) { await link.click(); clicked = true; }
    } else {
      const link = await page.$(`.rail .nav-item[href="${target}"]`);
      if (link) { await link.click(); clicked = true; }
    }
    if (!clicked) {
      defects.push(`${from} → ${to}: no clickable path (${via}) — the operator must type a URL`);
      row.reachable = false;
      rows.push(row); await page.close(); continue;
    }
    row.reachable = true;
    await page.waitForTimeout(hash ? 400 : 1400);
    const after = await inspect(page);

    row.shellKept = after.shell && after.rails === 1;
    row.contextKept = after.ctxFilled >= 1;
    row.activeNavCorrect = via === 'inpage'
      ? after.activeNav.length <= 1                 // a detail surface may own no domain
      : (after.activeNav.length === 1
         && (after.activeNav[0] === target || target === '/admin'));
    row.tabCorrect = hash ? (after.visibleView === 'v-' + hash) : true;
    row.noLegacyChrome = after.legacyChrome === 0;
    row.titlePresent = after.title.trim().length > 0;

    if (!row.shellKept) defects.push(`${from} → ${to}: shell lost (rails=${after.rails})`);
    if (!row.contextKept) defects.push(`${from} → ${to}: context bar emptied`);
    if (!row.activeNavCorrect) defects.push(`${from} → ${to}: active nav wrong (${after.activeNav.join(',') || 'none'})`);
    if (!row.tabCorrect) defects.push(`${from} → ${to}: landed on view ${after.visibleView}, expected v-${hash}`);
    if (!row.noLegacyChrome) defects.push(`${from} → ${to}: legacy chrome rendered`);
    if (!row.titlePresent) defects.push(`${from} → ${to}: no page title on arrival`);

    // Back must return where it came from.
    if (!hash) {
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const back = await inspect(page);
      row.backCorrect = back.url.split('#')[0] === from.split('#')[0];
      if (!row.backCorrect) defects.push(`${from} → ${to}: Back landed on ${back.url}, not ${from}`);
    } else {
      row.backCorrect = true;
    }
  } catch (e) {
    defects.push(`${from} → ${to}: threw — ${e.message.slice(0, 90)}`);
    row.error = e.message.slice(0, 90);
  }
  rows.push(row);
  await page.close();
}

// A link to a historical route is not the defect. LEAVING the Control Plane is.
// So the measurement is what the operator ARRIVES at: does the destination
// still render its own product, or does it render inside the one shell?
const leaks = [];
const legacyChrome = [];
for (const surface of ['/admin', '/admin/meta', '/admin/intelligence', '/admin/operations',
                       '/admin/customers', '/admin/support', '/admin/graph']) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${surface}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(500);
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  for (const l of LEGACY_TARGETS) {
    if (hrefs.includes(l)) leaks.push({ surface, legacy: l });
  }
  await page.close();
}
for (const l of [...LEGACY_TARGETS, '/admin/meta-readiness']) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${l}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(700);
    const m = await inspect(page);
    const own = await page.$$eval('.app, .sidebar, .main-wrapper, .topbar-title',
      (els) => els.length).catch(() => 0);
    if (!m.shell || m.rails !== 1) {
      legacyChrome.push(`${l}: renders its own product (rails=${m.rails}, shell=${m.shell})`);
      defects.push(`${l}: an operator arriving here leaves the Control Plane`);
    }
    if (own > 0) legacyChrome.push(`${l}: ${own} legacy chrome element(s) still rendered`);
  } catch (e) {
    legacyChrome.push(`${l}: failed to load — ${e.message.slice(0, 60)}`);
  }
  await page.close();
}

// And a legacy page reached directly must still say where its home is.
const page = await ctx.newPage();
await page.goto(`${BASE}/admin/meta-readiness?scenario=healthy`, { waitUntil: 'networkidle', timeout: 20000 })
  .catch(() => {});
const readinessBanner = await page.$$eval('a[href="/admin/meta#quota"]', (a) => a.length).catch(() => 0);
if (!readinessBanner) defects.push('/admin/meta-readiness does not point at its canonical home');
await page.close();

await ctx.close();
await browser.close();

writeFileSync(`${OUT}/matrix.json`, JSON.stringify({ rows, defects, leaks, legacyChrome }, null, 2));

console.log('\nADMIN_NAVIGATION_TRANSITION_MATRIX\n');
console.log('from → to'.padEnd(52) + 'shell ctx nav tab back');
for (const r of rows) {
  const y = (b) => (b === undefined ? ' -  ' : b ? ' ✓  ' : ' ✗  ');
  console.log(`${(r.from + ' → ' + r.to).padEnd(52)}${y(r.shellKept)}${y(r.contextKept)}${y(r.activeNavCorrect)}${y(r.tabCorrect)}${y(r.backCorrect)}`);
}
console.log(`\nTRANSITIONS_TESTED=${rows.length}`);
console.log(`LINKS_TO_HISTORICAL_ROUTES=${leaks.length}` +
  (leaks.length ? ' → ' + leaks.map((l) => `${l.surface}→${l.legacy}`).join(', ') : ''));
console.log(`LEGACY_CHROME_EXPOSED=${legacyChrome.length ? 'YES' : 'NO'}`);
for (const c of legacyChrome) console.log('  ✗ ' + c);
console.log(`VISIBLE_LEGACY_TRANSITIONS=${legacyChrome.length}`);
console.log(`BROKEN_TRANSITIONS=${defects.length}`);
for (const d of defects) console.log('  ✗ ' + d);
if (defects.length) process.exit(1);
