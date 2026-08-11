// ════════════════════════════════════════════════════════════════════════
//  test_pages_with_data.mjs — every page, rendered against DATA.
//
//  WHY THIS EXISTS
//  The mobile and desktop gates load each page with no API behind it. They
//  prove the shell does not overflow — and nothing else, because with every
//  fetch failing, the render paths that turn a payload into rows, cards,
//  charts and pills never execute. Those paths are most of the product, and
//  they were covered by no test at all: the audit note for this repo calls
//  that shape "a test that passes because it never ran the code".
//
//  This serves a realistic payload for every endpoint each page calls, then
//  asserts three things per page:
//    1. no uncaught error and no console error while rendering real data,
//    2. the page actually rendered CONTENT (not a spinner or an empty
//       state) — otherwise a page that silently swallowed the payload would
//       pass rule 1 by doing nothing,
//    3. no placeholder survives where a value was supposed to land.
//
//  Prereq: pages rendered via `npx tsx scripts/render-pages.mts`.
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = '.mobile-pages';
const PUB = 'public';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const WS = 'ws_1';
const PORT = 4181;

// ── Fixture ───────────────────────────────────────────────────────────
// One believable Iraqi SMB: IQD, minorFactor 1, a messages objective, 30
// days of daily rows, three campaigns, live issues and recommendations.
const dates = [];
for (let i = 29; i >= 0; i--) dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

const daily = dates.map((d, i) => ({
  date: d,
  spend: 90000 + i * 2000,
  impressions: 18000 + i * 400,
  clicks: 380 + i * 11,
  ctr: 2.0 + (i % 6) * 0.15,
  cpc: 240,
  cpm: 5100,
  frequency: 1.3 + (i % 4) * 0.1,
  reach: 14000 + i * 300,
  messages: 9 + (i % 6),
  purchases: 0,
  leads: 0,
  campaignId: 'c1',
}));

const campaigns = [
  { id: 'c1', externalId: '2301', name: 'حملة الرسائل — بغداد', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'CONVERSATIONS', destinationType: 'MESSENGER', dailyBudget: 25000, lifetimeBudget: null, spend: 2400000, impressions: 520000, clicks: 11800, ctr: 2.27, cpm: 4615, frequency: 1.6, messages: 260, results: 260, resultUnit: 'MESSAGES', costPerResult: 9230, health: 78, deliveryTier: 'DELIVERING_TODAY', deliveringInWindow: true, isCurrentlySpending: true, isDormantActive: false, createdAt: dates[0], startTime: dates[0], lastSpendDate: dates[dates.length - 1] },
  { id: 'c2', externalId: '2302', name: 'حملة الوعي — البصرة', status: 'PAUSED', objective: 'OUTCOME_AWARENESS', optimizationGoal: 'REACH', destinationType: null, dailyBudget: 15000, lifetimeBudget: null, spend: 900000, impressions: 410000, clicks: 3100, ctr: 0.76, cpm: 2195, frequency: 2.9, messages: 0, results: 0, resultUnit: 'REACH', costPerResult: null, health: 41, deliveryTier: 'PAUSED', deliveringInWindow: false, isCurrentlySpending: false, isDormantActive: false, createdAt: dates[0], startTime: dates[0], lastSpendDate: dates[10] },
  { id: 'c3', externalId: '2303', name: 'حملة الزيارات — أربيل', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS', destinationType: 'WEBSITE', dailyBudget: 20000, lifetimeBudget: null, spend: 1500000, impressions: 300000, clicks: 9000, ctr: 3.0, cpm: 5000, frequency: 1.2, messages: 0, results: 9000, resultUnit: 'LINK_CLICKS', costPerResult: 166, health: 65, deliveryTier: 'DELIVERING_WINDOW', deliveringInWindow: true, isCurrentlySpending: false, isDormantActive: false, createdAt: dates[0], startTime: dates[0], lastSpendDate: dates[dates.length - 1] },
  // A perfectly ordinary Meta objective that the analytics layer classifies
  // (see objectiveKpis.ts) — included so the page has to NAME it in Arabic.
  { id: 'c4', externalId: '2304', name: 'حملة المحادثات — الموصل', status: 'ACTIVE', objective: 'OUTCOME_MESSAGES', optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP', dailyBudget: 18000, lifetimeBudget: null, spend: 700000, impressions: 150000, clicks: 4200, ctr: 2.8, cpm: 4666, frequency: 1.4, messages: 120, results: 120, resultUnit: 'MESSAGES', costPerResult: 5833, health: 71, deliveryTier: 'DELIVERING_TODAY', deliveringInWindow: true, isCurrentlySpending: true, isDormantActive: false, spendWindowMinor: 700000, resultsWindow: 120, resultLabelAr: 'محادثة', ctrWindow: 2.8, windowDays: 30, createdAt: dates[0], startTime: dates[0], lastSpendDate: dates[dates.length - 1] },
];

const workspace = {
  id: WS, name: 'متجر النور', currency: 'IQD', minorFactor: 1, locale: 'AR',
  lastSyncedAt: new Date().toISOString(), accountToday: dates[dates.length - 1],
  plan: 'PRO', subscriptionStatus: 'ACTIVE',
  adAccounts: [{ id: 'a1', name: 'متجر النور', externalAccountId: 'act_123', currency: 'IQD', status: 'ACTIVE', lastSyncedAt: new Date().toISOString(), metaAccountStatus: 1 }],
  members: [{ id: 'm1', role: 'OWNER', user: { id: 'u1', name: 'علي', email: 'ali@example.com' }, createdAt: dates[0] }],
  campaignCounts: {
    total: 4, activeStatus: 3, paused: 1, archived: 0,
    spendingToday: 2, deliveringInWindow: 3, dormantActive: 0,
    withMetrics: 3, deliveryWindowDays: 30,
    byTier: { DELIVERING_TODAY: 2, DELIVERING_WINDOW: 1, ACCOUNT_HALTED: 0, DORMANT_ACTIVE: 0, NOT_DELIVERING: 0, PAUSED: 1, ARCHIVED: 0, DELETED: 0 },
  },
};

const issues = [
  { id: 'i1', code: 'FREQUENCY_HIGH', severity: 'HIGH', campaignId: 'c2', campaignName: campaigns[1].name, title: 'تكرار مرتفع', message: 'الجمهور يرى الإعلان كثيراً', detectedAt: dates[25], date: dates[25] },
  { id: 'i2', code: 'CTR_DROP', severity: 'MEDIUM', campaignId: 'c1', campaignName: campaigns[0].name, title: 'انخفاض معدل النقر', message: 'انخفض معدل النقر هذا الأسبوع', detectedAt: dates[27], date: dates[27] },
];

const recommendations = [
  { id: 'r1', itemId: 'r1', kind: 'ACTION', actionCode: 'REDUCE_FREQUENCY', campaignId: 'c2', title: 'خفّض التكرار في حملة البصرة', body: 'التكرار 2.9 — وسّع الجمهور أو بدّل الإبداع.', why: 'التكرار فوق 2.5', severity: 'HIGH', confidence: 0.8, buttonText: 'تطبيق', expectedImpact: 'انخفاض CPM' },
  { id: 'r2', itemId: 'r2', kind: 'ACTION', actionCode: 'SHIFT_BUDGET', campaignId: 'c1', title: 'انقل ميزانية إلى حملة الرسائل', body: 'تكلفة المحادثة أفضل من المتوسط.', why: 'أفضل تكلفة نتيجة', severity: 'MEDIUM', confidence: 0.7, buttonText: 'تطبيق', expectedImpact: 'محادثات أكثر' },
];

const dashboard = {
  workspace,
  kpis: [
    { key: 'spend', label: 'الإنفاق', value: 4800000, display: '4,800,000', deltaPct: 0.09, direction: 'up', goodWhenUp: false },
    { key: 'ctr', label: 'CTR', value: 2.27, display: '2.27%', deltaPct: -0.04, direction: 'down', goodWhenUp: true },
    { key: 'messages', label: 'المحادثات', value: 260, display: '260', deltaPct: 0.12, direction: 'up', goodWhenUp: true },
    { key: 'cpm', label: 'CPM', value: 4615, display: '4,615', deltaPct: -0.02, direction: 'down', goodWhenUp: false },
    { key: 'clicks', label: 'النقرات', value: 23900, display: '23,900', deltaPct: 0.05, direction: 'up', goodWhenUp: true },
  ],
  trendSeries: {
    dates,
    messages: daily.map((d) => d.messages),
    results: daily.map((d) => d.messages),
    spend: daily.map((d) => d.spend),
    ctr: daily.map((d) => d.ctr),
    frequency: daily.map((d) => d.frequency),
    cpm: daily.map((d) => d.cpm),
    costPerResult: daily.map((d) => Math.round(d.spend / Math.max(1, d.messages))),
  },
  resultBreakdown: { byUnit: [{ unit: 'MESSAGES', dailyColumn: 'messages', count: 260, labelAr: 'محادثة', labelEn: 'conversations', approximate: false }] },
  issues,
  diagnoses: [{ id: 'd1', campaignId: 'c2', campaignName: campaigns[1].name, stage: 'DELIVERY', title: 'العرض متعثر', body: 'التكرار مرتفع والوصول يتراجع.', confidence: 0.72, evidence: ['التكرار 2.9', 'الوصول -18%'] }],
  recommendations,
  insights: daily,
  campaigns,
  health: { score: 68, label: 'متوسط', checkedAt: new Date().toISOString() },
  // Shape copied from the Attribution interface in
  // src/engines/analytics/attributeChange.ts — a fixture that does not match
  // the server contract exercises nothing.
  attribution: {
    totalChange: 0.12,
    drivers: {
      impressions: { prior: 410000, current: 520000, change: 0.268, contribution: 0.19 },
      ctr:         { prior: 2.5, current: 2.27, change: -0.092, contribution: -0.06 },
      cvr:         { prior: 0.021, current: 0.022, change: 0.047, contribution: 0.03 },
    },
    primaryDriver: 'impressions',
    narrative: 'ارتفعت النتائج 12% — الظهور هو المحرّك الرئيسي.',
  },
  accountHold: null,
};

const ROUTES = [
  [/^\/api\/auth\/me$/, () => ({ id: 'u1', email: 'ali@example.com', name: 'علي', locale: 'AR', isActive: true, isPlatformAdmin: false, memberships: [{ workspaceId: WS, role: 'OWNER', workspace: { id: WS, name: workspace.name } }] })],
  [/^\/api\/dashboard\/pulse\//, () => ({ items: [{ id: 'p1', title: 'الإنفاق ثابت', body: 'لا تغيّر يُذكر اليوم.', severity: 'LOW' }], checkedAt: new Date().toISOString() })],
  [/^\/api\/dashboard\//, () => dashboard],
  [/\/campaigns$/, () => campaigns],
  [/\/insights/, () => daily],
  [/\/issue-dates/, () => issues.map((i) => ({ date: i.date, code: i.code, severity: i.severity }))],
  [/\/recommendations$/, () => recommendations],
  [/\/members$/, () => workspace.members],
  [/\/ad-accounts$/, () => workspace.adAccounts],
  [/\/data-health$/, () => ({ ok: true, checkedAt: new Date().toISOString(), findings: [], rowsChecked: 30 })],
  [/\/token-health$/, () => ({ ok: true })],
  [/^\/api\/health\/ai$/, () => ({ ok: true, provider: 'anthropic', checkedAt: new Date().toISOString() })],
  [/^\/api\/support\/tickets\/[^/]+$/, () => ({ id: 't1', subject: 'استفسار عن الفوترة', status: 'OPEN', priority: 'NORMAL', category: 'PAYMENT', createdAt: dates[20], messages: [{ id: 'sm1', senderType: 'USER', content: 'متى يُجدَّد الاشتراك؟', createdAt: dates[20], sender: { name: 'علي' } }, { id: 'sm2', senderType: 'ADMIN', content: 'يُجدَّد تلقائياً في الأول من كل شهر.', createdAt: dates[19], sender: { name: 'الدعم' } }] })],
  [/^\/api\/support\/tickets/, () => [
    { id: 't1', subject: 'استفسار عن الفوترة', status: 'OPEN', priority: 'NORMAL', category: 'PAYMENT', createdAt: dates[20], _count: { messages: 2 } },
    { id: 't2', subject: 'مشكلة في ربط Meta', status: 'CLOSED', priority: 'HIGH', category: 'BUG', createdAt: dates[24], _count: { messages: 5 } },
  ]],
  [/^\/api\/workspaces\/[^/]+$/, () => workspace],
];

let apiHits = 0;
const srv = createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p.startsWith('/api/')) {
    apiHits++;
    const hit = ROUTES.find(([re]) => re.test(p));
    const body = hit ? hit[1]() : {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  let file = join(ROOT, p === '/' ? '/dashboard.html' : p);
  if (!existsSync(file)) file = join(PUB, p);
  if (!existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(PORT, r));

// Pages that need a workspace + data. Auth pages render nothing data-driven.
const PAGES = ['dashboard', 'campaigns', 'recommendations', 'ad-analysis', 'ai', 'workspace', 'settings', 'support'];

// Same vocabulary as test_no_english_in_ar_pages.mjs: brand names, units and
// key legends a merchant reads as symbols rather than as English words.
const I18N_ALLOWED = new Set([
  'Adlytic', 'Meta', 'META', 'WhatsApp', 'Instagram', 'Facebook', 'Stripe',
  'AI', 'API', 'CTR', 'CPC', 'CPM', 'CPA', 'ROAS', 'KPI', 'CSV', 'PDF', 'URL',
  'UTM', 'OK', 'ID', 'IQD', 'USD', 'EUR', 'SAR', 'AED', 'Pro', 'CMO', 'SDK',
  'Ctrl', 'Esc', 'Enter', 'Shift', 'AM', 'PM', 'JSON', 'SaaS',
  // Meta's own product and role names. These appear in parentheses beside the
  // Arabic, because they are the exact strings the merchant has to find in
  // Meta's English interface — translating them would make the instruction
  // useless.
  'Ads', 'Manager', 'Business', 'Admin', 'Advertiser',
  // Iraqi payment brands and the plan's brand name.
  'Zain', 'Cash', 'Asia', 'Hawala', 'Premium',
  // The Latin gloss beside «العربية» in the locale picker, matching how the
  // English option is labelled in its own language.
  'Arabic',
]);

// Latin words that came from the FIXTURE — user-supplied names, emails, Meta
// identifiers. The product must render them verbatim; they are data, not copy.
// Collected from the fixture itself so the rule stays exact as it grows.
// Enumerated ON PURPOSE rather than harvested from the fixture. The first
// version ran JSON.stringify over the payload and allowlisted every lowercase
// token it found — which swept in the FIELD NAMES (messages, status, spend),
// and a raw «MESSAGES» chip on screen was then excused by the fixture's own
// `messages:` key. A gate that quietly widens its own allowlist is worse than
// no gate: it reports clean while the defect is visible.
const FIXTURE_WORDS = new Set([
  'ali', 'example', 'com',      // the fixture user's email
  'act',                        // the Meta ad-account id prefix (act_123)
]);

// Text that means "a value was supposed to be here and is not".
const PLACEHOLDERS = [
  ['undefined', /\bundefined\b/],
  ['NaN', /\bNaN\b/],
  ['[object Object]', /\[object Object\]/],
  ['null', /(^|[\s>(])null([\s<),.]|$)/],
];

let bad = 0;
const fail = (m) => { console.error('  ✗ ' + m); bad++; };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });

for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Resource 404s for optional assets are the harness's business, not the
    // page's. Everything else is the page telling us it broke.
    if (/favicon|manifest|sw\.js|Failed to load resource|net::ERR/i.test(t)) return;
    errors.push('console: ' + t);
  });
  await page.addInitScript((ws) => {
    try {
      localStorage.setItem('adlytic_token', 'test-token');
      localStorage.setItem('adlytic_workspace_id', ws);
    } catch (e) {}
  }, WS);

  const before = apiHits;
  await page.goto(`http://localhost:${PORT}/${name}.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const used = apiHits - before;

  console.log(`\n── /${name} (${used} API calls served) ──`);

  if (used === 0) fail(`${name}: served ZERO API calls — this page's data paths did not run, so nothing here was tested`);

  for (const e of errors) fail(`${name}: ${e.slice(0, 200)}`);

  // Did it actually render? A page that swallowed the payload and showed a
  // spinner would otherwise pass silently.
  const shape = await page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      return el.getBoundingClientRect().height > 0;
    };
    const body = document.body;
    let text = 0;
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      if (!vis(n.parentElement)) continue;
      text += t.length;
    }
    return {
      chars: text,
      spinners: [...document.querySelectorAll('.spinner, .skeleton, .loading')].filter(vis).length,
      html: body.innerHTML.length,
    };
  });
  if (shape.chars < 400) {
    fail(`${name}: only ${shape.chars} visible characters with a full payload served — the page rendered nothing`);
  } else {
    console.log(`  ✓ rendered ${shape.chars} visible characters`);
  }

  // Placeholders that leaked into visible text.
  const visText = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!el) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (el.closest('script, style')) continue;
      const t = n.textContent.trim();
      if (t) out.push(t);
    }
    return out;
  });
  for (const [label, re] of PLACEHOLDERS) {
    const hits = visText.filter((t) => re.test(t));
    if (hits.length) {
      fail(`${name}: "${label}" is visible on screen — ${hits.length} node(s), e.g. "${hits[0].slice(0, 70)}"`);
    }
  }

  // ── Runtime English ──────────────────────────────────────────────────
  // test_no_english_in_ar_pages.mjs reads the SERVER-rendered HTML, so any
  // Arabic string the browser writes after the payload lands is invisible to
  // it. That blind spot shipped an unconditional «Past 30 days ·» directly
  // under the dashboard title. This sees the DOM after data, so it closes it.
  // Checked per WORD, not per node. Skipping any node that contains Arabic —
  // which is what the static gate does — would have missed the very string
  // this rule was written for: «Past 30 days · متجر النور ·» is one text node
  // carrying both, and the Arabic half would have excused the English half.
  for (const t of visText) {
    if (t === 'English') continue;                   // the locale picker's own label
    for (const w of t.match(/[A-Za-z][A-Za-z'’]{2,}/g) || []) {
      if (I18N_ALLOWED.has(w) || FIXTURE_WORDS.has(w.toLowerCase())) continue;
      fail(`${name}: English rendered into an Arabic page at runtime — "${w}" in "${t.slice(0, 70)}"`);
    }
  }
  if (!errors.length) console.log('  ✓ no page errors while rendering real data');

  await page.close();
}

await browser.close();
srv.close();
console.log(`\n════ ${bad === 0 ? 'DATA-FED PAGE GATE PASSED' : bad + ' FAILURES'} ════\n`);
process.exit(bad ? 1 : 0);
