// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/meta-truth.mjs
//
//  Does /admin/meta actually SAY what the fixture says?
//
//  The audit checks composition — no raw JSON, nothing outside its card, no
//  pathological whitespace. Composition was never the whole failure. The page
//  that shipped was well-composed and still meaningless, because it dumped
//  whatever keys the payload happened to carry. A gate that only measures
//  structure passes that page.
//
//  So this asks the other question: take the numbers the fixture puts in, and
//  find them in the rendered text, in operator language. The expectations are
//  READ FROM THE FIXTURE, never restated here — a fixture edit changes what
//  this demands, which is the whole point.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';
import { SCENARIOS, USAGE } from './fixtures.ts';

const BASE = 'http://127.0.0.1:4599';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Numbers as an operator reads them, not as JSON prints them. */
const forms = (n) => {
  const r = Math.round(n);
  return [String(r), r.toLocaleString('en-US'), r.toLocaleString('ar-EG')];
};

const defects = [];
const notes = [];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' });

for (const [name, scenario] of Object.entries(SCENARIOS)) {
  const usage = scenario.api.metaUsage;
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/meta?scenario=${name}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(700);
  // innerText skips hidden subtrees, and the quota detail lives in a tab that
  // is not the default one. Reading only the landing tab would have made the
  // whole quota section invisible to this check — a measurement gap of exactly
  // the kind that produced the original false green. Walk every tab.
  const tabs = await page.$$eval('.view-tab[data-view]', (els) => els.map((e) => e.dataset.view));
  let text = '';
  for (const t of tabs.length ? tabs : [null]) {
    if (t) await page.evaluate((v) => window.adminShowView(v), t);
    await page.waitForTimeout(120);
    text += '\n' + await page.evaluate(() => document.body.innerText);
  }
  text = text.replace(/[٬,،]/g, '');
  const html = await page.content();

  // ── 1. The quota must be readable as a quota, not as field names.
  // With the counter store down every number reads zero, and zero means "no
  // measurement", not "no errors". The page is REQUIRED to withhold the gate
  // verdicts there, so demanding them would be demanding a fabrication.
  if (usage && usage.counts && usage.redisAvailable !== false) {
    const c = usage.counts;
    const shows = (v) => forms(v).some((f) => text.includes(f));
    if (!shows(c.last15Days)) {
      defects.push(`${name}: 15-day call count ${c.last15Days} is nowhere on the page`);
    }
    // The gate Meta actually applies is the last-500 error rate. A page that
    // shows calls but hides the rate cannot answer "can we request the tier".
    const rate = c.errorRateLast500;
    if (!text.includes(String(rate)) && !text.includes(String(Math.round(rate)))) {
      defects.push(`${name}: last-500 error rate ${rate}% is not stated`);
    }
    // Raw field names are the tell that a payload was printed, not read.
    for (const k of ['errorRateLast500', 'progressToThresholdPct', 'recentWindowSize',
                     'meetsCallThreshold', 'meetsErrorGate', 'errorBreakdown15d']) {
      if (text.includes(k)) defects.push(`${name}: raw field name "${k}" is visible to the operator`);
    }
    // A verdict, not two numbers left for the operator to compare by hand.
    // Both gate conditions must be stated as met / not met, and the wording
    // must AGREE with the fixture — a page that prints "مستوفاة" regardless of
    // the data is the same defect as printing the raw field.
    const met = (text.match(/(?<!غير )مستوفاة/g) || []).length;
    const unmet = (text.match(/غير مستوفاة/g) || []).length;
    if (met + unmet < 2) {
      defects.push(`${name}: only ${met + unmet}/2 gate conditions carry a met/not-met verdict`);
    }
    const expectMet = (c.meetsErrorGate ? 1 : 0) + (c.meetsCallThreshold ? 1 : 0);
    if (met !== expectMet) {
      defects.push(`${name}: ${met} condition(s) shown as met, the data says ${expectMet}`);
    }
  }

  // ── 2. Redis down is an ABSENCE, and absence is never green and never red.
  if (usage && usage.redisAvailable === false) {
    if (!/غير مُهيّأ|غير متاح|لا يمكن تحديد|—/.test(text)) {
      defects.push(`${name}: usage counters are unavailable and the page does not say so`);
    }
    if (/\bok\b/i.test(text) && !/غير/.test(text)) {
      defects.push(`${name}: an unavailable counter reads as healthy`);
    }
  }

  // ── 3. A blocked account must be visible AS blocked on the Meta surface —
  //       this is the state the operator opened the page to find.
  const blockedRows = (scenario.api.ops?.workspaces ?? [])
    .filter((w) => w.connection === 'BLOCKED' || w.connection === 'ERROR');
  if (blockedRows.length) {
    for (const w of blockedRows) {
      if (!text.includes(w.workspaceName)) {
        defects.push(`${name}: workspace "${w.workspaceName}" is blocked and is not named on /admin/meta`);
      }
    }
    if (!/محجوب|مقطوع|غير متصل|فشل/.test(text)) {
      defects.push(`${name}: ${blockedRows.length} account(s) blocked, no blocked state rendered`);
    }
  }

  // ── 4. Nested objects must never reach the operator as serialized text.
  if (/\{&quot;|\{"[a-zA-Z]+":/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
    defects.push(`${name}: serialized object literal present outside <script>`);
  }

  notes.push(`${name}: ${text.length} chars rendered`);
  await page.close();
}

await ctx.close();
await browser.close();

console.log('\nADMIN_META_COMPREHENSION\n');
console.log(`SCENARIOS_CHECKED=${Object.keys(SCENARIOS).length}`);
console.log(`USAGE_SHAPES_EXERCISED=${Object.keys(USAGE).length}`);
console.log(`META_COMPREHENSION_DEFECTS=${defects.length}`);
for (const d of defects) console.log('  ✗ ' + d);
if (defects.length) process.exit(1);
