// Click-through harness for the admin console: real Chromium, stubbed APIs.
// Renders each admin page, walks every tab, records pageerrors + dead views.
import { chromium } from 'playwright';
import { register } from 'node:module';

const { execSync } = await import('node:child_process');

// Render the pages via tsx (they're TS modules).
const html = JSON.parse(execSync(
  `npx tsx -e "
    import { adminConsolePage } from './src/web/pages/adminConsolePage';
    import { adminOsPage } from './src/web/pages/adminOsPage';
    import { adminInboxPage } from './src/web/pages/adminInboxPage';
    import { adminDashboardPage } from './src/web/pages/adminDashboardPage';
    import { metaReadinessPage } from './src/web/pages/metaReadinessPage';
    import { addClientPage } from './src/web/pages/addClientPage';
    const out = {
      console: adminConsolePage(),
      os: adminOsPage(),
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
  '/api/admin/platform-stats': {
    computedAt: Date.now(), fromCache: false,
    reach: { totalWorkspaces: 3, totalAdAccounts: 2, activeAdAccounts: 1, activeCampaigns: 4 },
    money: { byCurrency: [{ currency: 'USD', activeCampaigns: 4, totalDailyBudgetMajor: 28, impliedMonthlyMajor: 840 }] },
    brain: { snapshotsLastNDays: 32, narrationsLastNDays: 12, narrationCoveragePct: 37.5, lookbackDays: 7 },
  },
  '/api/admin/cache/bust': { ok: true },
  '/api/admin/ops': {
    computedAt: new Date().toISOString(),
    overall: 'ERROR',
    subsystems: [
      { key: 'database', status: 'HEALTHY', summary: 'يستجيب' },
      { key: 'redis', status: 'ERROR', summary: 'غير متصل — العدّادات تقرأ صفراً', detail: 'ENOTFOUND redis.railway.internal' },
      { key: 'queue', status: 'NOT_TESTED', summary: 'الطابور معطّل بالإعداد' },
      { key: 'workers', status: 'UNKNOWN', summary: 'لا مزامنة خلال 48 ساعة', detail: 'role=combined' },
      { key: 'meta', status: 'HEALTHY', summary: '1 حساب متصل' },
      { key: 'intelligence', status: 'NOT_TESTED', summary: 'لا يوجد فحص حي بعد' },
    ],
    attention: [
      { id: 'redis', severity: 'ERROR', title: 'Redis غير متصل', because: 'عدّادات استخدام Meta تقرأ صفراً.', action: 'افحص REDIS_URL', href: '/admin/meta-readiness' },
    ],
    workspaces: [
      { workspaceId: 'w1', workspaceName: 'متجر النور', ownerEmail: 'c@x.iq', adAccountId: 'a1', adAccountName: 'حساب', externalAccountId: 'act_123', currency: 'IQD', hasToken: true, tokenSource: 'USER_OAUTH', tokenExpiresAt: null, metaAccountStatus: 1, lastSyncedAt: '2026-08-11T00:00:00Z', lastSyncStatus: 'COMPLETED', lastSyncError: null, freshestDataDate: '2026-08-11', dataAgeDays: 1, connection: 'HEALTHY', data: 'HEALTHY', overall: 'HEALTHY', headline: 'سليم' },
      { workspaceId: 'w2', workspaceName: 'مساحة بلا ربط', ownerEmail: 'z@x.iq', adAccountId: null, adAccountName: null, externalAccountId: null, currency: null, hasToken: false, tokenSource: null, tokenExpiresAt: null, metaAccountStatus: null, lastSyncedAt: null, lastSyncStatus: null, lastSyncError: null, freshestDataDate: null, dataAgeDays: null, connection: 'NOT_TESTED', data: 'NOT_TESTED', overall: 'NOT_TESTED', headline: 'بلا حساب إعلاني — لم يُربط بعد' },
    ],
  },
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

  for (const tab of ['workspaces', 'customers', 'create', 'subscriptions', 'ledger', 'probe', 'settings', 'overview']) {
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

  // the landing tab now carries the platform dashboard — verify it RENDERS
  // the stats, not merely that the markup exists
  const ps = await page.evaluate(() => ({
    ws: document.getElementById('ps-workspaces') && document.getElementById('ps-workspaces').textContent,
    cov: document.getElementById('ps-coverage') && document.getElementById('ps-coverage').textContent,
    covClass: document.getElementById('ps-coverage') && document.getElementById('ps-coverage').className,
    money: document.querySelectorAll('#ps-money-tbody tr').length,
  }));
  const psOk = ps.ws === '3' && ps.cov === '37.5%' && /err/.test(ps.covClass || '') && ps.money === 1;
  report.push([psOk ? 'ok' : 'FAIL', `console: platform dashboard renders on landing (ws=${ps.ws} cov=${ps.cov} moneyRows=${ps.money} class=${ps.covClass})`]);
  if (!psOk) failures++;

  // ops snapshot: subsystems, attention queue, workspace rows
  const ops = await page.evaluate(() => ({
    sys: document.querySelectorAll('#ops-subsystems .sys-card').length,
    att: document.querySelectorAll('#ops-attention .att-item').length,
    ws: document.querySelectorAll('#ws-tbody tr').length,
    overall: document.getElementById('ops-overall') && document.getElementById('ops-overall').textContent,
    // Status must never be colour-only: every chip carries a glyph element.
    glyphless: [...document.querySelectorAll('.st')].filter((el) => !el.querySelector('.st-glyph')).length,
  }));
  const opsOk = ops.sys === 6 && ops.att === 1 && ops.ws === 2 && /خطأ/.test(ops.overall || '') && ops.glyphless === 0;
  report.push([opsOk ? 'ok' : 'FAIL',
    `console: ops snapshot renders (subsystems=${ops.sys} attention=${ops.att} workspaces=${ops.ws} overall=${JSON.stringify(ops.overall)} colourOnlyChips=${ops.glyphless})`]);
  if (!opsOk) failures++;

  // Workspace filter narrows to problems only. The control lives inside the
  // workspaces view, so switch to it first — a hidden <select> is not
  // selectable, and that is correct behaviour, not a defect.
  await page.click('.nav-item[data-tab="workspaces"]');
  await page.waitForTimeout(200);
  await page.selectOption('#ws-filter', 'problems');
  await page.waitForTimeout(150);
  const filtered = await page.evaluate(() => document.querySelectorAll('#ws-tbody tr').length);
  const filterOk = filtered === 1; // the NOT_TESTED row is not a "problem"
  report.push([filterOk ? 'ok' : 'FAIL', `console: workspace 'problems' filter → ${filtered} row(s), expected 1`]);
  if (!filterOk) failures++;
  await page.selectOption('#ws-filter', 'all');
  await page.click('.nav-item[data-tab="overview"]');
  await page.waitForTimeout(200);

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
for (const [name, doc] of [['adminOS', html.os], ['inbox', html.inbox], ['observability', html.observability], ['readiness', html.readiness], ['addClient', html.addClient]]) {
  const { page, errors } = await newPage(doc);
  await page.waitForTimeout(700);
  const errs = errors.filter((e) => !e.includes('favicon'));
  if (errs.length) { for (const e of errs) { report.push(['FAIL', `${name}: ${e}`]); failures++; } }
  else report.push(['ok', `${name}: loaded with zero JS errors`]);

  // The inbox once had NO way back to the console — a dead end. Every admin
  // surface must carry the full shared nav so no page can regress into one.
  const SURFACE_HREFS = ['/admin', '/admin/inbox', '/admin/add-client', '/admin/observability', '/admin/meta-readiness', '/dashboard'];
  // A page need not link to ITSELF — the Admin OS *is* /admin, and demanding
  // a self-link would be the guard misreading its own rule. Every other
  // destination must still be reachable, so no page can become an island.
  const SELF = { adminOS: '/admin' };
  const missing = SURFACE_HREFS.filter((h) => h !== SELF[name] && !doc.includes(`href="${h}"`));
  if (missing.length) { report.push(['FAIL', `${name}: surface nav missing links: ${missing.join(', ')}`]); failures++; }
  else report.push(['ok', `${name}: full surface nav present (${SURFACE_HREFS.length} destinations)`]);
  await page.close();
}

await browser.close();
for (const [s, m] of report) console.log((s === 'ok' ? '  ✓ ' : '  ✗ ') + m);
console.log(`\n════ ${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'} ════`);
process.exit(failures ? 1 : 0);
