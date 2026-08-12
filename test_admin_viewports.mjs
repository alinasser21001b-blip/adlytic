import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const html = execSync(`npx tsx -e "import { adminOsPage } from './src/web/pages/adminOsPage'; process.stdout.write(adminOsPage());"`, { cwd: '/home/user/adlytic', maxBuffer: 64e6 }).toString();
const O = 'http://a.test';
const S = { '/api/auth/me': { isPlatformAdmin: true, email: 'a@t' },
  '/api/admin/ops': { computedAt: new Date().toISOString(), overall: 'WARNING', known: ['database'], unknown: ['intelligence'],
    subsystems: [{ key: 'database', status: 'HEALTHY', summary: 'يستجيب' }, { key: 'redis', status: 'ERROR', summary: 'غير متصل', detail: 'ENOTFOUND redis.railway.internal:6379' }, { key: 'queue', status: 'HEALTHY', summary: 'ok' }, { key: 'workers', status: 'UNKNOWN', summary: 'غير معروف' }, { key: 'meta', status: 'HEALTHY', summary: 'ok' }, { key: 'intelligence', status: 'NOT_TESTED', summary: 'لا فحص' }],
    attention: [{ id: 'r', severity: 'ERROR', title: 'Redis غير متصل', because: 'العدّادات تقرأ صفراً.', action: 'افحص REDIS_URL' }],
    workspaces: [{ workspaceId: 'w', workspaceName: 'متجر النور للأدوات المنزلية', ownerEmail: 'owner@example.iq', adAccountId: 'a', adAccountName: 'ح', externalAccountId: 'act_1234567890', currency: 'IQD', hasToken: true, tokenSource: 'USER_OAUTH', tokenExpiresAt: null, metaAccountStatus: 1, lastSyncedAt: new Date().toISOString(), lastSyncStatus: 'COMPLETED', lastSyncError: null, freshestDataDate: '2026-08-12', dataAgeDays: 0, connection: 'HEALTHY', data: 'HEALTHY', overall: 'HEALTHY', headline: 'سليم' }] },
  '/api/admin/overview': { usersTotal: 1, usersActive: 1, usersPending: 0, premiumActive: 0, workspacesTotal: 1, syncs7d: 1, aiConvos7d: 0, paymentEvents7d: 0 },
  '/api/admin/customers': { customers: [] }, '/api/admin/subscriptions': { subscriptions: [] },
  '/api/admin/payment-events': { events: [] }, '/api/admin/settings': { settings: [] },
  '/api/admin/support/counts': { open: 0, awaiting: 0, urgent: 0, resolved: 0 },
  '/api/admin/platform-stats': { computedAt: Date.now(), fromCache: false, reach: {}, money: { byCurrency: [] }, brain: { lookbackDays: 7, narrationCoveragePct: null } } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fail = 0;
for (const w of [390, 430, 768, 1024, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.addInitScript(() => localStorage.setItem('adlytic_token', 't'));
  await p.route(O + '/**', (r) => { const u = new URL(r.request().url()).pathname;
    if (u.startsWith('/api/')) { const k = Object.keys(S).find((x) => u === x || u.startsWith(x + '/')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(k ? S[k] : {}) }); }
    if (u.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: ':root{--bg:#fff}' });
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }); });
  await p.goto(O + '/admin', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  const m = await p.evaluate((vw) => {
    const de = document.documentElement;
    const over = [...document.querySelectorAll('#ops-sys .card,.att,#ws-body tr,.bnd')].filter((e) => e.getBoundingClientRect().width > vw + 1).length;
    const nav = document.querySelector('.rail');
    return { hScroll: de.scrollWidth - de.clientWidth, over, navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
      navReachable: [...document.querySelectorAll('.nav-item[data-view]')].filter((e) => e.getBoundingClientRect().width > 0).length };
  }, w);
  await p.click('.nav-item[data-view="workspaces"]').catch(() => {});
  await p.waitForTimeout(200);
  const tbl = await p.evaluate(() => { const t = document.querySelector('#ws-body tr td'); return t ? getComputedStyle(t).display : 'none'; });
  const bad = m.hScroll > 1 || m.over > 0 || !m.navVisible || m.navReachable === 0;
  if (bad) fail++;
  console.log(`  ${bad ? '✗' : '✓'} ${w}px — hScroll=${m.hScroll} overflow=${m.over} navVisible=${m.navVisible} tabs=${m.navReachable} tableCell=${tbl}`);
  await p.close();
}
await b.close();
console.log(`\n════ ${fail ? fail + ' FAILURES' : 'ALL WIDTHS PASS'} ════`);
process.exit(fail ? 1 : 0);
