// Click-through harness for the admin console: real Chromium, stubbed APIs.
// Renders each admin page, walks every tab, records pageerrors + dead views.
import { chromium } from 'playwright';
import { register } from 'node:module';

const { execSync } = await import('node:child_process');

// Render the pages via tsx (they're TS modules).
const html = JSON.parse(execSync(
  `npx tsx -e "
    import { adminConsolePage } from './src/web/pages/adminConsolePage';
    import { adminInboxPage } from './src/web/pages/adminInboxPage';
    import { adminDashboardPage } from './src/web/pages/adminDashboardPage';
    import { metaReadinessPage } from './src/web/pages/metaReadinessPage';
    import { addClientPage } from './src/web/pages/addClientPage';
    const out = {
      console: adminConsolePage(),
      inbox: adminInboxPage(),
      observability: adminDashboardPage(),
      readiness: metaReadinessPage(),
      addClient: addClientPage(),
    };
    process.stdout.write(JSON.stringify(out));
  "`,
  { cwd: '/home/user/adlytic', maxBuffer: 64 * 1024 * 1024 },
).toString());

const STUBS = {
  '/api/auth/me': { id: 'u0', email: 'admin@test.local', name: 'Admin', isPlatformAdmin: true, isActive: true, memberships: [] },
  '/api/admin/overview': { usersTotal: 3, usersActive: 2, usersPending: 1, premiumActive: 1, workspacesTotal: 3, syncs7d: 0, aiConvos7d: 4, paymentEvents7d: 0 },
  '/api/admin/customers': { customers: [{ id: 'u1', email: 'c@x.iq', name: 'زبون', isActive: true, hasPremium: true, createdAt: '2026-06-01T00:00:00Z', workspaces: [{ id: 'w1', name: 'متجر النور', tier: 'PREMIUM', subscriptionStatus: 'ACTIVE', paymentMethod: 'WHATSAPP_MANUAL', subscriptionExpiresAt: '2026-09-01T00:00:00Z', adAccountCount: 1, adAccounts: [{ id: 'a1', name: 'حساب', currency: 'IQD' }] }] }], total: 1 },
  '/api/admin/subscriptions': { subscriptions: [{ id: 'w1', name: 'متجر النور', tier: 'PREMIUM', subscriptionStatus: 'ACTIVE', paymentMethod: 'WHATSAPP_MANUAL', subscriptionExpiresAt: '2026-09-01T00:00:00Z', owner: { name: 'زبون', email: 'c@x.iq' } }] },
  '/api/admin/payment-events': { events: [{ createdAt: '2026-08-01T00:00:00Z', workspace: { name: 'متجر النور' }, eventType: 'ACTIVATED', source: 'MANUAL', amountMinor: 2500, currency: 'USD', note: 'زين كاش' }] },
  '/api/admin/settings': { settings: [{ key: 'features.demo', value: 'true', valueType: 'boolean', group: 'features', label: 'تجريبي', updatedAt: '2026-08-01T00:00:00Z' }] },
  '/api/admin/support/counts': { open: 1, awaiting: 0, urgent: 0, resolved: 5 },
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failures = 0;
const report = [];

// Pages are served from a FAKE ORIGIN the router owns end-to-end: relative
// fetch('/api/…') must resolve against a real http origin — under a data:
// URL every API call dies at URL parsing and the access gate never lifts.
const ORIGIN = 'http://adlytic.test';

async function newPage(doc) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    localStorage.setItem('adlytic_token', 'test-token');
  });
  await page.route(ORIGIN + '/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const hit = Object.keys(STUBS).find((k) => url.pathname === k || url.pathname.startsWith(k + '/'));
      const body = hit ? STUBS[hit] : {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.pathname.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: ':root{--bg:#fff;}' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: doc });
  });
  await page.goto(ORIGIN + '/admin', { waitUntil: 'domcontentloaded' });
  return { page, errors };
}

// ── 1. The console: walk every tab ──
{
  const { page, errors } = await newPage(html.console);
  await page.waitForTimeout(600);

  const appVisible = await page.evaluate(() => document.querySelector('.app') && getComputedStyle(document.querySelector('.app')).display !== 'none');
  report.push([appVisible ? 'ok' : 'FAIL', 'console: app shell revealed after ensureAdmin']);
  if (!appVisible) failures++;

  for (const tab of ['customers', 'create', 'subscriptions', 'ledger', 'probe', 'settings', 'overview']) {
    await page.click(`.nav-item[data-tab="${tab}"]`);
    await page.waitForTimeout(250);
    const visible = await page.evaluate((t) => {
      const el = document.getElementById('view-' + t);
      return !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    }, tab);
    const others = await page.evaluate((t) => [...document.querySelectorAll('.view')].filter((el) => el.id !== 'view-' + t && el.style.display !== 'none').map((el) => el.id), tab);
    const okRow = visible && others.length === 0;
    report.push([okRow ? 'ok' : 'FAIL', `console: tab ${tab} → visible=${visible}${others.length ? ' leaking: ' + others.join(',') : ''}`]);
    if (!okRow) failures++;
  }

  // customers table rendered rows from the stub?
  const rows = await page.evaluate(() => document.querySelectorAll('#customers-tbody tr').length);
  report.push([rows > 0 ? 'ok' : 'FAIL', `console: customers table rendered ${rows} row(s)`]);
  if (!rows) failures++;

  // probe dropdown got the workspace from the flattened shape?
  await page.click('.nav-item[data-tab="probe"]');
  await page.waitForTimeout(400);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#probe-ws option')].map((o) => o.textContent));
  const hasWs = opts.some((t) => t && t.includes('متجر النور'));
  report.push([hasWs ? 'ok' : 'FAIL', `console: probe dropdown options = ${JSON.stringify(opts)}`]);
  if (!hasWs) failures++;

  for (const e of errors) { report.push(['FAIL', 'console JS error: ' + e]); failures++; }
  await page.close();
}

// ── 2. The other four admin pages: load clean, no JS errors ──
for (const [name, doc] of [['inbox', html.inbox], ['observability', html.observability], ['readiness', html.readiness], ['addClient', html.addClient]]) {
  const { page, errors } = await newPage(doc);
  await page.waitForTimeout(700);
  const errs = errors.filter((e) => !e.includes('favicon'));
  if (errs.length) { for (const e of errs) { report.push(['FAIL', `${name}: ${e}`]); failures++; } }
  else report.push(['ok', `${name}: loaded with zero JS errors`]);
  await page.close();
}

await browser.close();
for (const [s, m] of report) console.log((s === 'ok' ? '  ✓ ' : '  ✗ ') + m);
console.log(`\n════ ${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'} ════`);
process.exit(failures ? 1 : 0);
