// Click-through harness for the admin console: real Chromium, stubbed APIs.
// Renders each admin page, walks every tab, records pageerrors + dead views.
import { chromium } from 'playwright';
import { register } from 'node:module';
import { existsSync } from 'node:fs';

const { execSync } = await import('node:child_process');

// Render the pages via tsx (they're TS modules).
const html = JSON.parse(execSync(
  `npx tsx -e "
    import { adminConsolePage } from './src/web/pages/adminConsolePage';
    import { adminOsPage } from './src/web/pages/adminOsPage';
    import { adminLoginPage } from './src/web/pages/adminLoginPage';
    import { adminInboxPage } from './src/web/pages/adminInboxPage';
    import { adminDashboardPage } from './src/web/pages/adminDashboardPage';
    import { metaReadinessPage } from './src/web/pages/metaReadinessPage';
    import { addClientPage } from './src/web/pages/addClientPage';
    import { ADMIN_IA } from './src/web/pages/adminSurfaceNav';
    const out = {
      ia: ADMIN_IA,
      console: adminConsolePage(),
      os: adminOsPage(),
      adminLogin: adminLoginPage(),
      inbox: adminInboxPage(),
      observability: adminDashboardPage(),
      readiness: metaReadinessPage(),
      addClient: addClientPage(),
    };
    process.stdout.write(JSON.stringify(out));
  "`,
  // Run from wherever the repository actually is. This was pinned to an
  // absolute authoring path, so the suite could only pass on one machine:
  // elsewhere the cwd does not exist and execSync fails before /bin/sh can
  // start, which surfaces as "spawnSync /bin/sh ENOENT" and reads like a
  // broken shell rather than a bad directory.
  { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
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

/**
 * Let Playwright resolve its own browser, and use a preinstalled one only
 * where that path genuinely exists. CI installs Chromium via
 * `npx playwright install --with-deps chromium` and does not create
 * /opt/pw-browsers/chromium, so an unconditional executablePath fails there.
 */
const launchOptions = existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' }
  : {};

const browser = await chromium.launch(launchOptions);
let failures = 0;
const report = [];
const ok = (m) => report.push(['ok', m]);
const bad = (m) => { report.push(['FAIL', m]); failures++; };

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

  // .app was this page's own chrome; the Control Plane shell renders .shell
  // and reveals it once /api/auth/me confirms a platform admin.
  const appVisible = await page.evaluate(() =>
    document.body.classList.contains('admin-ready')
    && !!document.querySelector('.rail')
    && getComputedStyle(document.querySelector('.shell')).visibility !== 'hidden');
  report.push([appVisible ? 'ok' : 'FAIL', 'console: shell revealed once identity is confirmed']);
  if (!appVisible) failures++;

  for (const tab of ['workspaces', 'customers', 'create', 'subscriptions', 'ledger', 'probe', 'settings', 'overview']) {
    await page.click(`.view-tab[data-view="${tab}"]`);
    await page.waitForTimeout(250);
    // #v-<id> and an .on class, not #view-<id> and an inline display: the
    // shell owns view switching now, and these follow its convention.
    const visible = await page.evaluate((t) => {
      const el = document.getElementById('v-' + t);
      return !!el && getComputedStyle(el).display !== 'none';
    }, tab);
    const others = await page.evaluate((t) => [...document.querySelectorAll('.view')]
      .filter((el) => el.id !== 'v-' + t && getComputedStyle(el).display !== 'none')
      .map((el) => el.id), tab);
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
  await page.click('.view-tab[data-view="workspaces"]');
  await page.waitForTimeout(200);
  await page.selectOption('#ws-filter', 'problems');
  await page.waitForTimeout(150);
  const filtered = await page.evaluate(() => document.querySelectorAll('#ws-tbody tr').length);
  const filterOk = filtered === 1; // the NOT_TESTED row is not a "problem"
  report.push([filterOk ? 'ok' : 'FAIL', `console: workspace 'problems' filter → ${filtered} row(s), expected 1`]);
  if (!filterOk) failures++;
  await page.selectOption('#ws-filter', 'all');
  await page.click('.view-tab[data-view="overview"]');
  await page.waitForTimeout(200);

  // customers table rendered rows from the stub?
  const rows = await page.evaluate(() => document.querySelectorAll('#customers-tbody tr').length);
  report.push([rows > 0 ? 'ok' : 'FAIL', `console: customers table rendered ${rows} row(s)`]);
  if (!rows) failures++;

  // probe dropdown got the workspace from the flattened shape?
  await page.click('.view-tab[data-view="probe"]');
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
  // surface must carry the shared nav so no page can regress into one.
  //
  // What "the shared nav" MEANS is ADMIN_IA, and this list used to name the
  // routes by hand — including three that the Control Plane deliberately
  // dropped from the sidebar. /admin/inbox, /admin/observability and
  // /admin/meta-readiness are historical surfaces reached as drill-downs from
  // the domain that replaced each of them, and meta-readiness has reached
  // parity and is meant to have NO inbound link at all. A hardcoded list
  // cannot express that; the IA already does, so read it.
  const SURFACE_HREFS = [...html.ia.flatMap((s) => s.items.map((i) => i.href)), '/dashboard'];
  // A page need not link to ITSELF — the Admin OS *is* /admin, and demanding
  // a self-link would be the guard misreading its own rule. Every other
  // destination must still be reachable, so no page can become an island.
  const SELF = { adminOS: '/admin' };
  const missing = SURFACE_HREFS.filter((h) => h !== SELF[name] && !doc.includes(`href="${h}"`));
  if (missing.length) { report.push(['FAIL', `${name}: surface nav missing links: ${missing.join(', ')}`]); failures++; }
  else report.push(['ok', `${name}: full surface nav present (${SURFACE_HREFS.length} destinations)`]);
  await page.close();
}

// ── Identity isolation: the five switching scenarios, in a real browser ──
{
  const AS_ADMIN = { id: 'u', email: 'a@t.local', name: 'A', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: 'w1' }] };
  const AS_CUSTOMER = { id: 'u', email: 'c@t.local', name: 'C', isActive: true, isPlatformAdmin: false, memberships: [{ workspaceId: 'w9' }] };

  async function openAs(doc, me, opts = {}) {
    const page = await browser.newPage();
    const errs = [];
    const navs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((seed) => {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, opts.seed || {});
    await page.route(ORIGIN + '/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      navs.push(p);
      if (p === '/api/auth/me') {
        if (opts.meFails) return route.abort('failed');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) });
      }
      if (p.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (p.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: ':root{--bg:#fff}' });
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: doc });
    });
    await page.goto(ORIGIN + (opts.path || '/admin'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    return { page, errs, navs };
  }

  // Scenario B — admin lands on the admin OS, shell revealed, no customer chrome.
  {
    const { page, errs } = await openAs(html.os, AS_ADMIN, { seed: { adlytic_token: 't', adlytic_workspace_id: 'w9' } });
    const r = await page.evaluate(() => ({
      // #os and #gate were the Admin OS's own chrome and its reveal gate; the
      // Control Plane shell owns both now. "Revealed" means the shell was
      // actually made visible, which is the thing invariant 7 is about — the
      // markup is always present, so its presence proves nothing.
      shell: document.body.classList.contains('admin-ready'),
      gateHidden: !!document.getElementById('admin-gate')
        && document.getElementById('admin-gate').classList.contains('hidden'),
      ws: localStorage.getItem('adlytic_workspace_id'),
      mode: localStorage.getItem('adlytic_session_mode'),
      url: location.pathname,
    }));
    await page.close();
    if (!r.shell || !r.gateHidden) bad(`admin: shell not revealed (shell=${r.shell} gateHidden=${r.gateHidden})`);
    else ok('admin: admin shell revealed after identity confirmed');
    if (r.ws) bad(`admin: inherited a customer workspace id (${r.ws}) — invariant 2 violated`);
    else ok('admin: stale customer workspace id cleared on adoption');
    if (r.mode !== 'admin') bad(`admin: session mode is ${r.mode}`);
    else ok('admin: session mode hint set to admin');
    if (errs.length) bad(`admin: JS errors ${JSON.stringify(errs.slice(0, 1))}`);
    else ok('admin: zero JS errors');
  }

  // Scenario C — a customer must never see admin chrome. The page redirects,
  // so evaluate() may race the navigation: that race IS the correct
  // behaviour, and the test reads it as evidence rather than as an error.
  {
    const { page, navs } = await openAs(html.os, AS_CUSTOMER, { seed: { adlytic_token: 't' } });
    let r = null;
    try {
      r = await page.evaluate(() => ({
        // Presence is not visibility. The shell markup is in every admin
        // document; what a customer must never get is the REVEAL, which only
        // a confirmed platform admin triggers.
        shell: document.body.classList.contains('admin-ready'),
        // innerText is a DOM reading, not a camera: it returns text inside a
        // visibility:hidden subtree, which is painted nowhere. Collect only
        // what a person could actually see.
        body: (function () {
          var out = '';
          var w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
          var n;
          while ((n = w.nextNode())) {
            if (n.children.length) continue;
            var st = getComputedStyle(n);
            if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
            if (!n.getClientRects().length) continue;
            out += ' ' + (n.textContent || '');
            if (out.length > 400) break;
          }
          return out.slice(0, 400);
        })(),
      }));
    } catch (e) {
      r = { redirected: true };
    }
    const url = page.url();
    await page.close();
    const leftAdmin = r.redirected || /\/dashboard/.test(url) || navs.includes('/dashboard');
    if (r.shell) bad('customer: the admin shell became visible — invariant 7 violated');
    else ok('customer: admin shell never revealed');
    if (!leftAdmin) bad(`customer: stayed on the admin surface (url=${url})`);
    else ok('customer: redirected off the admin surface');
    if (r.body && /مساحات العمل|حدود المعرفة/.test(r.body)) bad('customer: admin navigation text was rendered visibly');
    else ok('customer: no admin data or navigation rendered');
  }

  // Scenario D — /api/auth/me fails; an admin must NOT become a customer.
  {
    const { page, navs } = await openAs(html.os, AS_ADMIN, { seed: { adlytic_token: 't' }, meFails: true });
    // What this scenario protects is invariant 5: a failed identity check must
    // never demote an admin to a customer. It used to check that by watching a
    // client-side reveal gate — but that gate never protected anything, since
    // the HTML had already been delivered by then. Authorisation is the
    // route's: GET /admin/os resolves the session server-side and redirects a
    // non-admin, so the page below only ever reaches an admin. What the page
    // still owes the operator is an honest report and a way to retry.
    const r = await page.evaluate(() => ({
      gate: (document.getElementById('admin-gate') || {}).innerText || '',
      revealed: document.body.classList.contains('admin-ready'),
    }));
    await page.close();
    if (r.revealed) bad('network failure: shell revealed without a confirmed identity');
    else ok('network failure: the shell stays behind the gate');
    if (!/أعد المحاولة/.test(r.gate)) bad(`network failure: no retry offered — saw "${r.gate.slice(0, 60)}"`);
    else ok('network failure: the failure is reported with a retry');
    if (navs.includes('/dashboard')) bad('network failure: navigated to /dashboard — invariant 5 violated');
    else ok('network failure: never navigates to the customer dashboard');
  }

  // Scenario E — a stale CUSTOMER token must not bounce /admin/login away.
  {
    const { page } = await openAs(html.adminLogin, AS_CUSTOMER, { seed: { adlytic_token: 'stale' }, path: '/admin/login' });
    const r = await page.evaluate(() => ({
      formVisible: !!document.getElementById('f') && document.getElementById('gate').classList.contains('hidden'),
      msg: document.getElementById('m').innerText,
      token: localStorage.getItem('adlytic_token'),
      url: location.pathname,
    }));
    await page.close();
    if (!r.formVisible) bad('/admin/login: form not shown to a stale customer session');
    else ok('/admin/login: shows the form instead of bouncing a stale customer session');
    if (r.token) bad('/admin/login: the stale customer token was left intact');
    else ok('/admin/login: stale customer session suspended (token cleared)');
    if (!/جلسة عميل/.test(r.msg)) bad('/admin/login: did not explain why the session was suspended');
    else ok('/admin/login: explains the suspension');
  }
}

await browser.close();
for (const [s, m] of report) console.log((s === 'ok' ? '  ✓ ' : '  ✗ ') + m);
console.log(`\n════ ${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'} ════`);
process.exit(failures ? 1 : 0);
