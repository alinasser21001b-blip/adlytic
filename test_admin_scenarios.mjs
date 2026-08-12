// ════════════════════════════════════════════════════════════════════════
//  test_admin_scenarios.mjs — audit the Admin console against REAL
//  operational scenarios, not screenshots.
//
//  WHY THIS EXISTS
//  A console can pass every structural test (ids exist, scripts parse, tabs
//  switch) and still fail its actual job: letting an operator tell one
//  incident apart from another. That failure is invisible to every gate we
//  had, because it is a failure of MEANING, not of markup.
//
//  Each scenario below is a distinct real-world state. For each, we drive
//  the console with that payload and assert what the operator can SEE —
//  headline status, attention items, and whether two different causes
//  produce two different readings.
//
//  Reads only. Renders the shipped page; changes nothing.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const html = execSync(
  `npx tsx -e "import { adminConsolePage } from './src/web/pages/adminConsolePage'; process.stdout.write(adminConsolePage());"`,
  { cwd: '/home/user/adlytic', maxBuffer: 64 * 1024 * 1024 },
).toString();

const ORIGIN = 'http://adlytic.test';
const now = () => new Date().toISOString();

function ws(over = {}) {
  return {
    workspaceId: 'w', workspaceName: 'مساحة', ownerEmail: 'o@x.iq',
    adAccountId: 'a', adAccountName: 'حساب', externalAccountId: 'act_1', currency: 'IQD',
    hasToken: true, tokenSource: 'USER_OAUTH', tokenExpiresAt: null, metaAccountStatus: 1,
    lastSyncedAt: now(), lastSyncStatus: 'COMPLETED', lastSyncError: null,
    freshestDataDate: '2026-08-12', dataAgeDays: 0,
    connection: 'HEALTHY', data: 'HEALTHY', overall: 'HEALTHY', headline: 'سليم',
    ...over,
  };
}
function sys(over = {}) {
  return [
    { key: 'database', status: 'HEALTHY', summary: 'يستجيب' },
    { key: 'redis', status: 'HEALTHY', summary: 'متصل' },
    { key: 'queue', status: 'HEALTHY', summary: 'يقبل المهام' },
    { key: 'workers', status: 'HEALTHY', summary: 'مزامنة ناجحة خلال 48 ساعة' },
    { key: 'meta', status: 'HEALTHY', summary: '1 حساب متصل' },
    { key: 'intelligence', status: 'NOT_TESTED', summary: 'لا يوجد فحص حي بعد' },
    ...(over.extra || []),
  ].map((s) => ({ ...s, ...(over[s.key] || {}) }));
}

// ── The seven scenarios the operator must be able to tell apart ──────────
const SCENARIOS = {
  'S1 token expired': {
    overall: 'BLOCKED',
    subsystems: sys({ meta: { status: 'ERROR', summary: '1 من 1 حساب محجوب' } }),
    attention: [{ id: 'c', severity: 'ERROR', title: 'مساحة: انتهت صلاحية رمز Meta', because: 'لا يمكن سحب أي بيانات.', action: 'أعد ربط الحساب' }],
    workspaces: [ws({ connection: 'BLOCKED', overall: 'BLOCKED', headline: 'انتهت صلاحية رمز Meta', tokenExpiresAt: '2026-07-01T00:00:00Z' })],
  },
  'S2 connected but stale': {
    overall: 'WARNING',
    subsystems: sys(),
    attention: [{ id: 's', severity: 'WARNING', title: 'مساحة: بيانات عمرها 6 يوماً', because: 'الاتصال سليم لكن لا بيانات جديدة تصل.' }],
    workspaces: [ws({ data: 'WARNING', overall: 'WARNING', headline: 'بيانات قديمة — 6 يوماً بلا تحديث', dataAgeDays: 6, freshestDataDate: '2026-08-06' })],
  },
  'S3 probe failed': {
    overall: 'HEALTHY', subsystems: sys(), attention: [], workspaces: [ws()],
    __probeFail: { error: 'تعذّر فكّ تشفير رمز Meta المحفوظ', code: 'TOKEN_DECRYPT_FAILED', detail: 'key mismatch', status: 424 },
  },
  'S4 probe mixed verdicts': {
    overall: 'HEALTHY', subsystems: sys(), attention: [], workspaces: [ws()],
    __probeOk: {
      matrix: '| capability | verdict |\n| a | AVAILABLE |\n| b | NOT_TESTED |',
      report: '# REPORT\nmixed',
      // Two AVAILABLE rows that mean DIFFERENT things: one returned the
      // field, one did not. A tally that shows "AVAILABLE 2" has lied.
      results: [
        { verdict: 'AVAILABLE', evidence: { present: true, sample: 'x' } },
        { verdict: 'AVAILABLE', evidence: { present: false } },
        { verdict: 'NOT_TESTED' },
        { verdict: 'PERMISSION_REQUIRED' },
      ],
      context: { calls: '12', budget: '40', account: 'act_1' },
    },
  },
  'S5 healthy but intelligence untested': {
    overall: 'HEALTHY', subsystems: sys(), attention: [], workspaces: [ws()],
  },
  'S6 two different causes': {
    overall: 'ERROR',
    subsystems: sys({ meta: { status: 'WARNING', summary: '1 من 2 حساب محجوب' } }),
    attention: [
      { id: 'a', severity: 'ERROR', title: 'ألفا: بلا رمز Meta محفوظ', because: 'لا سحب بيانات.' },
      { id: 'b', severity: 'WARNING', title: 'بيتا: آخر مزامنة فشلت', because: 'البيانات أقدم مما يظن العميل.' },
    ],
    workspaces: [
      ws({ workspaceId: 'wa', workspaceName: 'ألفا', connection: 'BLOCKED', overall: 'BLOCKED', headline: 'بلا رمز Meta محفوظ — أعد الربط', hasToken: false }),
      ws({ workspaceId: 'wb', workspaceName: 'بيتا', overall: 'ERROR', headline: 'آخر مزامنة فشلت', lastSyncStatus: 'FAILED', lastSyncError: 'HTTP 500 from graph' }),
    ],
  },
  'S7 nothing actionable': {
    overall: 'HEALTHY', subsystems: sys(), attention: [], workspaces: [ws()],
  },
};

const BASE_STUBS = {
  '/api/auth/me': { id: 'u', email: 'a@t.local', name: 'A', isPlatformAdmin: true, isActive: true, memberships: [] },
  '/api/admin/overview': { usersTotal: 1, usersActive: 1, usersPending: 0, premiumActive: 0, workspacesTotal: 1, syncs7d: 3, aiConvos7d: 0, paymentEvents7d: 0 },
  '/api/admin/customers': { customers: [{ id: 'u1', email: 'c@x.iq', name: 'c', isActive: true, hasPremium: false, createdAt: now(), workspaces: [{ id: 'w', name: 'مساحة', tier: 'FREE', subscriptionStatus: 'INACTIVE', paymentMethod: null, subscriptionExpiresAt: null, adAccountCount: 1, adAccounts: [] }] }], total: 1 },
  '/api/admin/subscriptions': { subscriptions: [] },
  '/api/admin/payment-events': { events: [] },
  '/api/admin/settings': { settings: [] },
  '/api/admin/support/counts': { open: 0, awaiting: 0, urgent: 0, resolved: 0 },
  '/api/admin/platform-stats': { computedAt: Date.now(), fromCache: false, reach: { totalWorkspaces: 1, totalAdAccounts: 1, activeAdAccounts: 1, activeCampaigns: 2 }, money: { byCurrency: [] }, brain: { snapshotsLastNDays: 0, narrationsLastNDays: 0, narrationCoveragePct: null, lookbackDays: 7 } },
};

let failures = 0;
const out = [];
const ok = (m) => out.push(['ok', m]);
const bad = (m) => { out.push(['FAIL', m]); failures++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function open(scenario) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('adlytic_token', 't'));
  await page.route(ORIGIN + '/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    if (p === '/api/admin/ops') {
      const { __probeFail, __probeOk, ...snap } = scenario;
      // Derive known/unknown exactly as the server does, so a fixture can
      // never assert a shape the real endpoint would not produce. The first
      // version of this harness hand-wrote `overall`, which let it test a
      // payload the server never sends.
      const undetermined = (s) => s === 'UNKNOWN' || s === 'NOT_TESTED';
      const subs = snap.subsystems || [];
      const body = {
        computedAt: now(),
        ...snap,
        known: subs.filter((s) => !undetermined(s.status)).map((s) => s.key),
        unknown: subs.filter((s) => undetermined(s.status)).map((s) => s.key),
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (p === '/api/admin/capability-probe') {
      if (scenario.__probeFail) {
        const f = scenario.__probeFail;
        return route.fulfill({ status: f.status, contentType: 'application/json', body: JSON.stringify({ error: f.error, code: f.code, detail: f.detail }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scenario.__probeOk || {}) });
    }
    if (p.startsWith('/api/')) {
      const hit = Object.keys(BASE_STUBS).find((k) => p === k || p.startsWith(k + '/'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit ? BASE_STUBS[hit] : {}) });
    }
    if (p.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: ':root{--bg:#fff}' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(ORIGIN + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { page, errs };
}

/** What the operator actually reads at the top of the console. */
const readTop = (page) => page.evaluate(() => ({
  overall: (document.getElementById('ops-overall') || {}).textContent || '',
  attention: [...document.querySelectorAll('#ops-attention .att-item .att-title')].map((e) => e.textContent),
  cleared: !!document.querySelector('#ops-attention .att-clear'),
  subs: [...document.querySelectorAll('#ops-subsystems .sys-card')].map((c) => ({
    name: c.querySelector('.sys-name').textContent,
    st: (c.querySelector('.st') || {}).textContent || '',
  })),
}));

// ── S1 vs S2: two different Meta failures must READ differently ──────────
{
  const a = await open(SCENARIOS['S1 token expired']);
  const t1 = await readTop(a.page);
  const r1 = await a.page.evaluate(() => [...document.querySelectorAll('#ws-tbody tr')].map((r) => r.textContent));
  await a.page.close();

  const b = await open(SCENARIOS['S2 connected but stale']);
  const t2 = await readTop(b.page);
  const r2 = await b.page.evaluate(() => [...document.querySelectorAll('#ws-tbody tr')].map((r) => r.textContent));
  await b.page.close();

  if (t1.overall === t2.overall) bad(`S1/S2: both read "${t1.overall}" at the top — expired token and stale data are indistinguishable`);
  else ok(`S1/S2 distinguishable at a glance: "${t1.overall.trim()}" vs "${t2.overall.trim()}"`);

  if (!/صلاحية/.test(r1.join(' '))) bad('S1: workspace row does not name the expiry as the cause');
  else ok('S1: workspace row names token expiry as the cause');
  if (!/قديمة|يوم/.test(r2.join(' '))) bad('S2: workspace row does not name staleness as the cause');
  else ok('S2: workspace row names data staleness as the cause');
  // The critical separation: connection healthy while data is not.
  const s2Sep = await (async () => {
    const p = await open(SCENARIOS['S2 connected but stale']);
    const cells = await p.page.evaluate(() => [...document.querySelectorAll('#ws-tbody tr td')].map((t) => t.getAttribute('data-th') + '=' + t.textContent.replace(/\\s+/g, ' ').trim()));
    await p.page.close();
    return cells;
  })();
  const conn = s2Sep.find((c) => c.startsWith('الاتصال='));
  const data = s2Sep.find((c) => c.startsWith('البيانات='));
  if (conn && data && conn.includes('سليم') && !data.includes('سليم')) ok('S2: connection reads healthy WHILE data does not — the two axes stay separate');
  else bad(`S2: axes collapsed — connection="${conn}" data="${data}"`);
}

// ── S3: a probe RUN failure must not read as a capability verdict ────────
{
  const { page } = await open(SCENARIOS['S3 probe failed']);
  await page.click('.nav-item[data-tab="probe"]');
  await page.waitForTimeout(300);
  await page.selectOption('#probe-ws', { index: 1 }).catch(() => {});
  await page.click('#probe-run');
  await page.waitForTimeout(600);
  const txt = await page.evaluate(() => (document.getElementById('probe-matrix') || {}).textContent || '');
  await page.close();
  if (!/TOKEN_DECRYPT_FAILED/.test(txt)) bad('S3: failure code not shown');
  else if (!/ما العمل/.test(txt)) bad('S3: failure shows a code with no remediation');
  else if (!/ليس حكماً على أي قدرة/.test(txt)) bad('S3: run failure is not distinguished from a capability verdict');
  else ok('S3: probe failure states code + remediation + "not a capability verdict"');
}

// ── S4: mixed verdicts must be countable without reading the raw matrix ──
{
  const { page } = await open(SCENARIOS['S4 probe mixed verdicts']);
  await page.click('.nav-item[data-tab="probe"]');
  await page.waitForTimeout(300);
  await page.selectOption('#probe-ws', { index: 1 }).catch(() => {});
  await page.click('#probe-run');
  await page.waitForTimeout(600);
  const tally = await page.evaluate(() => [...document.querySelectorAll('#probe-tally span')].map((s) => s.textContent.trim()));
  await page.close();
  const joined = tally.join(' | ');
  if (!/AVAILABLE/.test(joined) || !/NOT_TESTED/.test(joined)) bad(`S4: verdict tally does not separate outcomes — "${joined}"`);
  else ok(`S4: mixed verdicts summarised before the raw matrix`);

  // THE CONFLATION TEST: two AVAILABLE rows meaning different things must
  // NOT collapse into one count. AVAILABLE ≠ POPULATED is the probe's
  // founding distinction; losing it in the summary loses it entirely.
  if (/AVAILABLE\s*2\b/.test(joined.replace(/\s+/g, ' '))) {
    bad(`S4: tally shows "AVAILABLE 2" — a returned field and an empty one counted as the same capability`);
  } else if (!/بلا حقل/.test(joined)) {
    bad(`S4: tally does not distinguish AVAILABLE-with-field from AVAILABLE-without — "${joined}"`);
  } else ok(`S4: AVAILABLE split by whether the field returned — ${joined.slice(0, 90)}`);
}

// ── S5 vs S7: "healthy with unknowns" vs "healthy, verified" ─────────────
{
  const { page } = await open(SCENARIOS['S5 healthy but intelligence untested']);
  const t = await readTop(page);
  await page.close();
  const intel = t.subs.find((s) => /الذكاء/.test(s.name));
  if (!intel || !/لم يُختبَر/.test(intel.st)) bad('S5: intelligence does not read as NOT_TESTED');
  else ok('S5: intelligence reads NOT_TESTED, not a fabricated score');

  // THE HONESTY TEST: with a NOT_TESTED subsystem present, the headline must
  // not claim plain health. Either it says so, or it is lying by omission.
  const claimsHealthy = /^\s*●?\s*سليم\s*$/.test(t.overall.trim());
  if (claimsHealthy) bad(`S5: headline reads "${t.overall.trim()}" while a subsystem is NOT_TESTED — the console overclaims certainty`);
  else ok(`S5: headline does not claim plain health while unknowns exist — "${t.overall.trim()}"`);

  // …and it must NAME what it could not observe, not merely hedge the word.
  const cert = await (async () => {
    const p = await open(SCENARIOS['S5 healthy but intelligence untested']);
    const c = await p.page.evaluate(() => (document.getElementById('ops-certainty') || {}).textContent || '');
    await p.page.close();
    return c;
  })();
  if (!/غير مرصود/.test(cert) || !/الذكاء/.test(cert)) bad(`S5: the console does not name its unknowns — "${cert}"`);
  else ok('S5: unknowns are named explicitly, not just counted');
}

// ── S6: two causes → two distinct rows, each naming its own cause ────────
{
  const { page } = await open(SCENARIOS['S6 two different causes']);
  await page.click('.nav-item[data-tab="workspaces"]');
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ws-tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  await page.close();
  if (rows.length !== 2) bad(`S6: expected 2 workspace rows, saw ${rows.length}`);
  else if (!/رمز/.test(rows[0]) || !/مزامنة/.test(rows[1])) bad(`S6: rows do not name distinct causes — ${JSON.stringify(rows)}`);
  else ok('S6: each workspace names its OWN cause (missing token vs failed sync)');
}

// ── S7: a clear board must say so, not render blank ──────────────────────
{
  const { page } = await open(SCENARIOS['S7 nothing actionable']);
  const t = await readTop(page);
  await page.close();
  if (t.attention.length) bad(`S7: attention queue shows items when nothing is actionable — ${JSON.stringify(t.attention)}`);
  else if (!t.cleared) bad('S7: empty attention queue renders blank instead of stating the result');
  else ok('S7: empty queue renders an explicit "nothing needs you now"');
}

await browser.close();
for (const [s, m] of out) console.log((s === 'ok' ? '  ✓ ' : '  ✗ ') + m);
console.log(`\n════ ${failures === 0 ? out.length + ' passed, 0 failed' : failures + ' FAILURES'} ════\n`);
process.exit(failures ? 1 : 0);
