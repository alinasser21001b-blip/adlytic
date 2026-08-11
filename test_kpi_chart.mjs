// ════════════════════════════════════════════════════════════════════════
//  test_kpi_chart.mjs — the KPI cards drive the main chart, honestly.
//
//  A mock API serves a REAL-SHAPED /api/dashboard payload, so the page's own
//  load path runs end to end: no internal function is poked, and every
//  assertion reads the rendered DOM or the live Chart.js instance.
//
//  What it defends, and why each rule exists:
//
//  · SELECTION IS REAL. Pressing a card's sparkline must change the series
//    the canvas is painting — not just the heading above it. The assertions
//    read Chart.getChart(canvas) and check the point count, the format and
//    the colour, because a title that changes over an unchanged line is the
//    most convincing possible lie.
//
//  · THE UNIT MUST FOLLOW THE METRIC. The caption was written once with the
//    account currency, so selecting CTR produced a percentage axis captioned
//    "IQD". A unit that lies is worse than no unit.
//
//  · A WINDOW MUST BE A WINDOW. spend7 charts 7 points with 7 labels; if the
//    values were sliced and the labels were not, every point would be
//    mislabelled by 23 days.
//
//  · AN EMPTY METRIC EXPLAINS ITSELF. It names the missing reading, hides
//    the canvas rather than leaving a stale line under a new title, and the
//    card is marked BEFORE the click.
//
//  · A TOTAL IS NOT A TREND. The lifetime card has no day series, therefore
//    no sparkline, therefore no control. Clicking it must do nothing.
//
//  · THE EXPLAIN BUTTON IS NOT A CHART CONTROL. Two controls share the card.
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
const WS = 'ws_test';

// 30 days ending today. spend/ctr/cpm always present; messages present too,
// so every chartable card has a series in the default fixture.
const today = new Date();
const dates = [];
for (let i = 29; i >= 0; i--) {
  dates.push(new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10));
}
const daily = dates.map((d, i) => ({
  date: d,
  spend: 100000 + i * 1500,          // minor units
  impressions: 20000 + i * 300,
  clicks: 400 + i * 9,
  ctr: 2 + (i % 7) * 0.1,
  frequency: 1.4,
  cpm: 5000,
  messages: 10 + (i % 5),
  purchases: 0,
  leads: 0,
}));

function dashPayload(opts = {}) {
  const msgs = opts.noMessages ? daily.map(() => 0) : daily.map((d) => d.messages);
  return {
    workspace: { id: WS, name: 'عميل الاختبار', currency: 'IQD', minorFactor: 1, locale: 'AR', lastSyncedAt: new Date().toISOString(), accountToday: dates[dates.length - 1] },
    kpis: [
      { key: 'spend', label: 'الإنفاق', value: 4500000, display: '4,500,000', goodWhenUp: false },
      { key: 'ctr', label: 'CTR', value: 2.3, display: '2.30%', goodWhenUp: true },
      { key: 'messages', label: 'المحادثات', value: 360, display: '360', goodWhenUp: true },
      { key: 'cpm', label: 'CPM', value: 5000, display: '5,000', goodWhenUp: false },
    ],
    trendSeries: {
      dates,
      messages: msgs,
      results: msgs,
      spend: daily.map((d) => d.spend),
      ctr: daily.map((d) => d.ctr),
      frequency: daily.map((d) => d.frequency),
      cpm: daily.map((d) => d.cpm),
      costPerResult: daily.map(() => null),
    },
    resultBreakdown: { byUnit: [{ unit: 'MESSAGES', dailyColumn: 'messages', count: 360 }] },
    issues: [], diagnoses: [], insights: [], recommendations: [], attribution: null,
  };
}

let mode = { noMessages: false };

const srv = createServer((req, res) => {
  const p = req.url.split('?')[0];
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/api/auth/me') return json({ id: 'u1', email: 'a@b.co', name: 'مستخدم', locale: 'AR', isActive: true, memberships: [{ workspaceId: WS, workspace: { id: WS, name: 'عميل الاختبار' } }] });
  if (p === '/api/dashboard/' + WS) return json(dashPayload(mode));
  if (p === '/api/workspaces/' + WS) return json({ id: WS, name: 'عميل الاختبار', currency: 'IQD', minorFactor: 1, adAccounts: [{ id: 'act_1', lastSyncedAt: new Date().toISOString() }] });
  if (p.startsWith('/api/workspaces/' + WS + '/insights')) return json(daily);
  if (p.startsWith('/api/workspaces/' + WS + '/campaigns')) return json([]);
  if (p.startsWith('/api/workspaces/' + WS + '/issue-dates')) return json([]);
  if (p.startsWith('/api/workspaces/' + WS + '/token-health')) return json({ ok: true });
  if (p.startsWith('/api/')) return json({});

  let file = join(ROOT, p === '/' ? '/dashboard.html' : p);
  if (!existsSync(file)) file = join(PUB, p);
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(4179, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra && !ok ? '  → ' + extra : ''));
  if (!ok) bad++;
};

async function open(viewport, store) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('adlytic_token', 't');
      localStorage.setItem('adlytic_workspace_id', 'ws_test');
      if (s) localStorage.setItem('adlytic_main_chart_metric', s);
      else localStorage.removeItem('adlytic_main_chart_metric');
    } catch (e) {}
  }, store || '');
  await page.goto('http://localhost:4179/dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.kpi-cmd-card.is-charting', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { page, errors };
}

const title = (p) => p.locator('#chart-panel-title').textContent();
const selected = (p) => p.evaluate(() => {
  const el = document.querySelector('.kpi-cmd-card.is-charting');
  return el ? el.getAttribute('data-kpi') : null;
});
// Read the live Chart.js dataset the canvas is actually painting.
const chartState = (p) => p.evaluate(() => {
  const cv = document.getElementById('chart-spend-main');
  const c = window.Chart && window.Chart.getChart ? window.Chart.getChart(cv) : null;
  if (!c) return null;
  const ds = c.data.datasets[0];
  return {
    label: ds.label,
    fmt: ds._fmt,
    points: ds.data.filter((v) => v != null).length,
    first: ds.data.find((v) => v != null),
    color: ds.borderColor,
    canvasHidden: cv.style.display === 'none',
  };
});

console.log('── default load (no stored preference) ──');
{
  const { page, errors } = await open({ width: 1440, height: 900 });
  check('spend is selected by default', await selected(page) === 'spend');
  check('panel title is the spend title', (await title(page)).includes('الإنفاق اليومي'));
  const c0 = await chartState(page);
  check('chart painting spend, 30 points, currency', !!c0 && c0.points === 30 && c0.fmt === 'currency', JSON.stringify(c0));

  console.log('── clicking the CTR sparkline ──');
  await page.click('[data-chart-metric="ctr"]');
  await page.waitForTimeout(350);
  check('CTR card becomes the selected one', await selected(page) === 'ctr');
  check('title switched to the CTR title', (await title(page)).includes('معدل النقر اليومي'), await title(page));
  const c1 = await chartState(page);
  check('chart now painting CTR with pct format', !!c1 && c1.fmt === 'pct', JSON.stringify(c1));
  // Regression: the unit caption was written once with the account currency,
  // so a percentage axis was labelled "IQD".
  const metaCtr = await page.locator('#chart-panel-meta').textContent();
  check('unit caption is NOT the currency on a percentage axis', !/IQD|USD/.test(metaCtr), metaCtr);
  check('unit caption names the percentage unit', /٪/.test(metaCtr), metaCtr);
  check('CTR line uses its own series colour', !!c1 && c1.color !== (c0 && c0.color), c1 && c1.color);
  check('aria-pressed moved to CTR', await page.evaluate(() =>
    document.querySelector('[data-chart-metric="ctr"]').getAttribute('aria-pressed') === 'true'
    && document.querySelector('[data-chart-metric="spend"]').getAttribute('aria-pressed') === 'false'));

  console.log('── the 7-day window is a real window ──');
  await page.click('[data-chart-metric="spend7"]');
  await page.waitForTimeout(350);
  const c2 = await chartState(page);
  check('spend7 charts exactly 7 points', !!c2 && c2.points === 7, JSON.stringify(c2));
  check('spend7 title says 7 days', (await title(page)).includes('7 أيام'), await title(page));
  const labels7 = await page.evaluate(() => {
    const c = window.Chart.getChart(document.getElementById('chart-spend-main'));
    return c ? c.data.labels.length : -1;
  });
  check('labels windowed with the values (7)', labels7 === 7, String(labels7));

  console.log('── messages and CPM ──');
  await page.click('[data-chart-metric="messages"]');
  await page.waitForTimeout(300);
  const c3 = await chartState(page);
  check('messages charts a count series (num format)', !!c3 && c3.fmt === 'num' && c3.points === 30, JSON.stringify(c3));
  check('unit caption names conversations, not money',
    /محادثة/.test(await page.locator('#chart-panel-meta').textContent()),
    await page.locator('#chart-panel-meta').textContent());
  await page.click('[data-chart-metric="cpm"]');
  await page.waitForTimeout(300);
  const c4 = await chartState(page);
  check('CPM charts currency', !!c4 && c4.fmt === 'currency', JSON.stringify(c4));
  check('unit caption returns to the currency on a money axis',
    /IQD/.test(await page.locator('#chart-panel-meta').textContent()),
    await page.locator('#chart-panel-meta').textContent());

  console.log('── lifetime is not a control ──');
  check('lifetime card has no chart button', await page.evaluate(() =>
    document.querySelector('#hero-life [data-chart-metric]') === null));
  await page.click('#hero-life');
  await page.waitForTimeout(250);
  check('clicking lifetime changes nothing', await selected(page) === 'cpm');

  console.log('── the explain button is not a chart control ──');
  await page.click('[data-chart-metric="spend"]');
  await page.waitForTimeout(250);
  await page.click('#kpi-ctr-card .info-btn');
  await page.waitForTimeout(250);
  check('info button opened the metric modal', await page.evaluate(() =>
    document.getElementById('metric-info-modal').style.display === 'flex'));
  check('info button did NOT switch the chart', await selected(page) === 'spend');
  await page.keyboard.press('Escape');

  console.log('── keyboard reachable ──');
  const kb = await page.evaluate(() => {
    const b = document.querySelector('[data-chart-metric="cpm"]');
    b.focus();
    return document.activeElement === b && b.tagName === 'BUTTON';
  });
  check('sparkline control is a real focusable button', kb);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Enter on the focused control switches the chart', await selected(page) === 'cpm');

  check('choice persisted', await page.evaluate(() => localStorage.getItem('adlytic_main_chart_metric') === 'cpm'));
  const fatal = errors.filter((e) => !/favicon|Failed to fetch|NetworkError/i.test(e));
  check('no page errors (' + fatal.length + ')', fatal.length === 0, fatal[0]);
  await page.close();
}

console.log('── an empty metric explains itself, it does not look broken ──');
{
  mode = { noMessages: true };
  const { page } = await open({ width: 1440, height: 900 });
  await page.click('[data-chart-metric="messages"]');
  await page.waitForTimeout(350);
  const empty = await page.evaluate(() => {
    const e = document.getElementById('chart-spend-main-empty');
    const cv = document.getElementById('chart-spend-main');
    return { shown: e && getComputedStyle(e).display !== 'none', text: e ? e.textContent : '', canvasHidden: cv.style.display === 'none' };
  });
  check('empty state is shown', empty.shown, JSON.stringify(empty));
  check('it names the missing reading', /محادثات/.test(empty.text), empty.text);
  check('the canvas is hidden, not left with a stale line', empty.canvasHidden);
  check('the empty card is marked before the click', await page.evaluate(() =>
    document.getElementById('kpi-messages-card').classList.contains('is-chart-empty')));
  check('spend card is not marked empty', await page.evaluate(() =>
    !document.getElementById('hero-30').classList.contains('is-chart-empty')));
  await page.close();
}

console.log('── a stored metric with no data falls back on first paint ──');
{
  mode = { noMessages: true };
  const { page } = await open({ width: 1440, height: 900 }, 'messages');
  check('fell back to spend rather than opening blank', await selected(page) === 'spend');
  const c = await chartState(page);
  check('and it is really painting spend', !!c && c.points === 30, JSON.stringify(c));
  await page.close();
}

console.log('── phone ──');
{
  mode = { noMessages: false };
  const { page } = await open({ width: 390, height: 844 });
  const box = await page.locator('[data-chart-metric="ctr"]').boundingBox();
  check('touch target >= 44px tall (' + (box ? Math.round(box.height) : 0) + ')', !!box && box.height >= 44);
  await page.locator('[data-chart-metric="ctr"]').click();
  await page.waitForTimeout(500);
  check('tap switches the chart on a phone', await selected(page) === 'ctr');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow introduced (' + overflow + 'px)', overflow <= 0);
  await page.close();
}

await browser.close();
srv.close();
console.log(bad ? '\nKPI-CHART CHECK FAILED (' + bad + ')' : '\nKPI-CHART CHECK PASSED');
process.exit(bad ? 1 : 0);
