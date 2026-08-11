// ════════════════════════════════════════════════════════════════════════
//  test_status_strip_exhaustive.ts
//
//  THE DEFECT THIS EXISTS FOR
//  Both status strips answer one question — «حملاتك الـN — أين تقف فعلًا؟»
//  — and both were built from four named counters: spendingToday,
//  deliveringInWindow, dormantActive, paused+archived. DeliveryTier has
//  EIGHT members. ACCOUNT_HALTED and NOT_DELIVERING were counted by nothing.
//
//  So on an account Meta had suspended for unpaid bills — the exact case the
//  ACCOUNT_HALTED tier was added for — every campaign classified
//  ACCOUNT_HALTED, all four counters read 0, and the strip rendered a title
//  claiming N campaigns above an empty bar. The summary went silent at the
//  one moment it had something urgent to say.
//
//  THE INVARIANT
//  The segmentation must be exhaustive: every DeliveryTier lands in exactly
//  one segment, so the segments always sum to the total. This test walks
//  every tier, and it walks the SOURCE of both renderers to prove neither
//  went back to hand-picked counters.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

import { emptyTierTally } from './src/lib/campaignCatalog';
import { classifyCampaignDelivery, type DeliveryTier } from './src/lib/campaignLifecycle';

let passed = 0;
let failed = 0;
const ok = (name: string) => { console.log('  ✓ ' + name); passed++; };
const bad = (name: string) => { console.error('  ✗ ' + name); failed++; };
const check = (cond: boolean, name: string) => (cond ? ok(name) : bad(name));

const ALL_TIERS = Object.keys(emptyTierTally()) as DeliveryTier[];

// ── 1. The tally has one slot per tier, and nothing else ────────────────
console.log('\n── the tally covers every tier ──');
check(ALL_TIERS.length === 8, `emptyTierTally has ${ALL_TIERS.length} slots (expected 8)`);
for (const t of ['DELIVERING_TODAY', 'DELIVERING_WINDOW', 'ACCOUNT_HALTED', 'DORMANT_ACTIVE', 'NOT_DELIVERING', 'PAUSED', 'ARCHIVED', 'DELETED']) {
  if (!ALL_TIERS.includes(t as DeliveryTier)) bad(`tally is missing the ${t} slot`);
}
if (!failed) ok('every DeliveryTier member has a counter');

// ── 2. Every tier is accounted for by the segment builder ───────────────
// The builder lives in browser JS inside a template literal, so it is read
// from source and evaluated here rather than imported.
console.log('\n── the segment builder spends the whole tally ──');
const layout = readFileSync('src/web/layout.ts', 'utf8');
const fnStart = layout.indexOf('function campaignStatusSegments(byTier)');
if (fnStart < 0) {
  bad('campaignStatusSegments not found in layout.ts — the shared builder is gone');
} else {
  const fnEnd = layout.indexOf('\nwindow.campaignStatusSegments', fnStart);
  const body = layout.slice(fnStart, fnEnd);
  // eslint-disable-next-line no-new-func
  const build = new Function(body + '; return campaignStatusSegments;')() as
    (t: Record<string, number>) => { segs: { n: number; label: string }[]; accounted: number };

  for (const tier of ALL_TIERS) {
    const tally = emptyTierTally();
    tally[tier] = 7;
    const { accounted, segs } = build(tally as unknown as Record<string, number>);
    if (accounted !== 7) {
      bad(`tier ${tier}: builder accounted for ${accounted} of 7 campaigns — they would vanish from the strip`);
    } else {
      const seg = segs.find((s) => s.n === 7);
      ok(`${tier} → «${seg ? seg.label : '?'}»`);
    }
  }

  // A mixed tally must still add up exactly.
  const mixed = emptyTierTally();
  ALL_TIERS.forEach((t, i) => { mixed[t] = i + 1; });
  const total = ALL_TIERS.reduce((a, t) => a + mixed[t], 0);
  const built = build(mixed as unknown as Record<string, number>);
  check(built.accounted === total, `a mixed tally of ${total} accounts for ${built.accounted}`);
}

// ── 3. The halted account, end to end ───────────────────────────────────
// This is the reported production scenario, walked through the real
// classifier and the real builder.
console.log('\n── the reported case: account suspended for unpaid bills ──');
if (fnStart >= 0) {
  const fnEnd = layout.indexOf('\nwindow.campaignStatusSegments', fnStart);
  // eslint-disable-next-line no-new-func
  const build = new Function(layout.slice(fnStart, fnEnd) + '; return campaignStatusSegments;')() as
    (t: Record<string, number>) => { segs: { n: number; label: string }[]; accounted: number };

  const rows = [
    { status: 'ACTIVE', spendTodayMinor: 45000, spendWindowMinor: 2400000, daysSinceLastSpend: 0 },
    { status: 'ACTIVE', spendTodayMinor: 0, spendWindowMinor: 900000, daysSinceLastSpend: 1 },
    { status: 'ACTIVE', spendTodayMinor: 0, spendWindowMinor: 1500000, daysSinceLastSpend: 0 },
    { status: 'PAUSED', spendTodayMinor: 0, spendWindowMinor: 0, daysSinceLastSpend: null },
  ];
  const tally = emptyTierTally();
  for (const r of rows) {
    tally[classifyCampaignDelivery({ ...r, metaEffectiveStatus: null, accountHalted: true })] += 1;
  }
  const built = build(tally as unknown as Record<string, number>);
  check(built.accounted === rows.length,
    `all ${rows.length} campaigns are accounted for while the account is halted (got ${built.accounted})`);
  const halted = built.segs.find((s) => s.label.indexOf('الحساب') >= 0);
  check(!!halted && halted.n === 3, `the halted segment names 3 campaigns (got ${halted ? halted.n : 'no segment'})`);
}

// ── 4. Neither renderer went back to hand-picked counters ───────────────
console.log('\n── both strips use the shared builder ──');
for (const [file, fn] of [
  ['src/web/pages/dashboardPage.ts', 'renderCampaignStatusStrip'],
  ['src/web/pages/campaignsPage.ts', 'renderCampStatusStrip'],
] as const) {
  const src = readFileSync(file, 'utf8');
  const at = src.indexOf('function ' + fn + '(');
  if (at < 0) { bad(`${fn} not found in ${file}`); continue; }
  const body = src.slice(at, at + 2000);
  if (!/campaignStatusSegments\(/.test(body)) {
    bad(`${fn} does not call campaignStatusSegments — it is picking counters by hand again, which is how ACCOUNT_HALTED was dropped`);
  } else {
    ok(`${fn} builds its segments from the shared, exhaustive mapping`);
  }
}

console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
process.exit(failed ? 1 : 0);
