// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/graph-ux.mjs
//
//  Proves the graph ANSWERS OPERATOR QUESTIONS — by driving it, not by
//  reading its source. Each check below is one of the questions the
//  acceptance brief lists, asked the way an operator would ask it.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4599';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ar' });
const page = await ctx.newPage();

let pass = 0; const fails = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fails.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}
const visibleNodes = () => page.$$eval('.gv-node:not(.dim)', (els) => els.length);
const allNodes = () => page.$$eval('.gv-node', (els) => els.length);

await page.goto(`${BASE}/admin/graph?scenario=healthy`, { waitUntil: 'networkidle' });
await page.waitForSelector('.gv-node', { timeout: 15000 });

console.log('\n── The architecture graph answers structural questions ──');

await check('the whole graph renders and reports its size', async () => {
  const n = await allNodes();
  if (n < 100) throw new Error(`only ${n} nodes rendered`);
  const note = await page.textContent('.gv-note');
  if (!/عقدة/.test(note)) throw new Error(`note does not report node count: ${note}`);
});

await check('route labels stay distinguishable (no two identical labels)', async () => {
  const labels = await page.$$eval('.gv-node text', (els) => els.map((e) => e.textContent));
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length) throw new Error(`${dupes.length} duplicate labels, e.g. ${[...new Set(dupes)].slice(0, 4).join(' | ')}`);
});

await check('search narrows to what was asked for', async () => {
  await page.fill('.gv-search', 'DailyStat');
  await page.waitForTimeout(250);
  const before = await allNodes();
  const lit = await visibleNodes();
  if (lit >= before) throw new Error(`search highlighted ${lit} of ${before} — no narrowing`);
  if (lit === 0) throw new Error('search matched nothing for a node that exists');
  await page.fill('.gv-search', '');
  await page.waitForTimeout(200);
});

await check('a class filter removes that class from the picture', async () => {
  const before = await allNodes();
  await page.click('.gv-chip[data-class="API_ROUTE"]');
  await page.waitForTimeout(250);
  const after = await allNodes();
  if (after >= before) throw new Error(`hiding API_ROUTE left ${after} of ${before} nodes`);
  await page.click('.gv-chip[data-class="API_ROUTE"]');
  await page.waitForTimeout(200);
});

await check('"Where does Meta data enter?" leaves only the Meta ingress', async () => {
  const asks = await page.$$('.gv-ask button');
  await asks[0].click();
  await page.waitForTimeout(300);
  const classes = await page.$$eval('.gv-node', (els) => els.map((e) => e.getAttribute('data-id').split(':')[0]));
  const kinds = [...new Set(classes)];
  if (kinds.includes('page') || kinds.includes('route')) {
    throw new Error(`the Meta-ingress view still shows ${kinds.join(', ')}`);
  }
  if (!kinds.includes('meta')) throw new Error('the Meta-ingress view shows no Meta nodes');
});

await check('"What depends on Redis?" isolates Redis and its neighbours', async () => {
  await page.click('[data-act="reset"]');
  await page.waitForTimeout(200);
  const asks = await page.$$('.gv-ask button');
  await asks[3].click();                          // ما الذي يعتمد على Redis؟
  await page.waitForTimeout(350);
  const ids = await page.$$eval('.gv-node', (els) => els.map((e) => e.getAttribute('data-id')));
  if (!ids.includes('deploy:redis')) throw new Error('Redis is not in its own neighbourhood view');
  if (ids.length > 30) throw new Error(`isolation left ${ids.length} nodes — not an isolation`);
  if (ids.length < 2) throw new Error('Redis appears to depend on nothing, which is wrong');
});

await check('reset restores the full graph', async () => {
  await page.click('[data-act="reset"]');
  await page.waitForTimeout(300);
  const n = await allNodes();
  if (n < 100) throw new Error(`reset left ${n} nodes`);
});

console.log('\n── The node inspector answers ownership questions ──');

await check('clicking a node opens a drawer with sourced detail', async () => {
  await page.click('.gv-node[data-id="model:DailyStat"]');
  await page.waitForTimeout(350);
  const open = await page.$eval('.gvi', (e) => e.classList.contains('open'));
  if (!open) throw new Error('the inspector did not open');
  const text = await page.textContent('.gvi');
  for (const need of ['ما هذا؟', 'المالك الرسمي', 'من أين جاءت هذه المعلومة', 'ما لا نعرفه']) {
    if (!text.includes(need)) throw new Error(`inspector is missing "${need}"`);
  }
  if (!text.includes('prisma/schema.prisma')) throw new Error('inspector does not name the canonical owner');
});

await check('the inspector names the writer and the readers', async () => {
  const text = await page.textContent('.gvi');
  if (!text.includes('ماذا يكتب') && !text.includes('ما الذي يعتمد عليه')) {
    throw new Error('no dependency direction shown');
  }
  if (!text.includes('dailyStatsRepo.ts')) throw new Error('the canonical writer is not reachable from the node');
});

await check('the inspector shows unknowns rather than hiding them', async () => {
  const unk = await page.$('.gvi .unk');
  if (!unk) throw new Error('DailyStat has a recorded blind spot and the inspector did not render it');
  const t = await unk.textContent();
  if (!/adAccountId/.test(t)) throw new Error(`unexpected unknown text: ${t.slice(0, 60)}`);
});

await check('a node with no observation says so instead of looking healthy', async () => {
  // Asserted on the state block's CLASS, not on Arabic prose: the honest
  // copy for an unobserved node is "…and is NOT healthy", which contains the
  // word "healthy" and would fool a substring check into failing a correct UI.
  const state = await page.$('.gvi .gvi-state');
  if (!state) throw new Error('no state block at all — silence reads as fine');
  const cls = await state.getAttribute('class');
  if (!/absent/.test(cls)) throw new Error(`unobserved node rendered as ${cls}, not as absence`);
  const text = await state.textContent();
  if (!/غير معروف/.test(text)) throw new Error(`absence block does not say unknown: ${text}`);
});

await check('inspector links navigate within the graph, not away from it', async () => {
  const btn = await page.$('.gvi li button[data-act="goto"]');
  if (!btn) throw new Error('no in-graph navigation from the inspector');
  await btn.click();
  await page.waitForTimeout(300);
  if (!page.url().includes('/admin/graph')) throw new Error('following a dependency left the graph page');
  const still = await page.$eval('.gvi', (e) => e.classList.contains('open'));
  if (!still) throw new Error('following a dependency closed the inspector');
});

console.log('\n── The runtime graph answers health questions ──');

await check('runtime mode paints observed state', async () => {
  await page.click('[data-act="reset"]');
  await page.click('.gv-mode[data-mode="runtime"]');
  await page.waitForTimeout(700);
  const note = await page.textContent('.gv-note');
  if (!/حالة مرصودة/.test(note)) throw new Error(`runtime mode reports: ${note}`);
  const legend = await page.textContent('.gv-legend');
  if (!/الغياب مرسوم متقطّعاً/.test(legend)) throw new Error('the absence rule is not stated in the legend');
});

await check('"what is not healthy" is a control, not a hunt', async () => {
  const before = await allNodes();
  await page.click('.gv-chip[data-status="PROBLEM"]');
  await page.waitForTimeout(350);
  const after = await allNodes();
  if (after >= before) throw new Error(`the problem filter left ${after} of ${before}`);
});

await check('unobserved nodes render dashed, never green', async () => {
  await page.click('[data-act="reset"]');
  await page.click('.gv-mode[data-mode="runtime"]');
  await page.waitForTimeout(700);
  const bad = await page.$$eval('.gv-node rect', (els) => els.filter((e) => {
    const dashed = e.getAttribute('stroke-dasharray');
    const fill = e.getAttribute('fill');
    return dashed && fill !== 'transparent';
  }).length);
  if (bad) throw new Error(`${bad} dashed (absent) nodes carry a verdict colour`);
});

await check('an unhealthy runtime is visible as such', async () => {
  await page.goto(`${BASE}/admin/graph?scenario=redis_unavailable`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gv-node', { timeout: 15000 });
  await page.click('.gv-mode[data-mode="runtime"]');
  await page.waitForTimeout(700);
  await page.click('.gv-node[data-id="deploy:redis"]');
  await page.waitForTimeout(350);
  const t = await page.textContent('.gvi');
  if (!/فاشل/.test(t)) throw new Error(`Redis is down but the inspector says: ${t.slice(0, 140)}`);
});

console.log('\n── Failure never breaks the console ──');

await check('an adapter rejection degrades the panel and names the reason', async () => {
  await page.goto(`${BASE}/admin/graph?scenario=graph_adapter_failure`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const blank = await page.textContent('.gv-blank');
  if (!/تعذّر/.test(blank)) throw new Error(`no failure message: ${blank}`);
  if (!/1\.7\.0|FUTURE_MINOR/.test(blank)) throw new Error(`the reason is not shown: ${blank}`);
  const rail = await page.$$('.rail');
  if (rail.length !== 1) throw new Error('the shell did not survive a graph failure');
  const nav = await page.$$('.nav-item');
  if (nav.length < 5) throw new Error('navigation is gone after a graph failure');
});

await check('an empty graph says it is empty, not that it is loading', async () => {
  await page.goto(`${BASE}/admin/graph?scenario=graph_empty`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const t = await page.textContent('.gv-stage');
  if (!/فارغة/.test(t)) throw new Error(`empty graph shows: ${t.slice(0, 120)}`);
});

await check('a missing trace says so and does not fabricate a chain', async () => {
  await page.goto(`${BASE}/admin/graph?scenario=healthy`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gv-node', { timeout: 15000 });
  await page.selectOption('#camp', { index: 1 });
  await page.click('#btn-trace');
  await page.waitForTimeout(600);
  const note = await page.textContent('#trace-note');
  if (!/تعذّر|NO_SNAPSHOT|measurable/.test(note)) throw new Error(`trace failure not reported: ${note}`);
  const stages = await page.$$('#stages .stage');
  if (stages.length) throw new Error('a chain was rendered for a campaign with no snapshot');
});

console.log(`\n════ ${pass} passed, ${fails.length} failed ════\n`);
await browser.close();
if (fails.length) process.exit(1);
