/**
 * Period metric semantics — reach and frequency may only be Meta's own
 * period values, or UNKNOWN.
 *
 * Reach is not additive. Meta de-duplicates people inside a requested
 * time_range and never publishes the cross-day overlap, so from daily rows the
 * period value is unknowable: max(daily) is a lower bound, sum(daily) an upper
 * one. Frequency inherits that, being impressions ÷ reach.
 *
 * The old code answered anyway. Frequency was the flat mean of the daily
 * frequencies — and it feeds ABSOLUTE thresholds (FREQUENCY_WATCH 3.0,
 * FREQUENCY_SATURATED 4.0), where no current-vs-prior comparison exists to
 * cancel an estimator's bias. A person reached on five days counts once in
 * period reach but washes out of a daily mean, so the mean sat below the truth
 * and audience fatigue was under-detected by construction.
 *
 * These assertions exist so no future change can quietly reintroduce a
 * daily-derived stand-in.
 *
 * Run: npx tsx test_period_metric_semantics.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType } from '@prisma/client';

import { buildEntityFunnel, buildEntityIntelligence } from './src/services/entityIntelligence';
import { normalizePeriodRow, META_PERIOD_FACT } from './src/services/periodInsights';
import { resolveAnalysisWindows, isoDay } from './src/lib/analysisWindow';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const DAY_MS = 86_400_000;
const W = resolveAnalysisWindows();

/**
 * Daily rows carrying a DELIBERATELY misleading reach and frequency: a high
 * per-day reach and a low per-day frequency. If either ever leaks into the
 * period value, these numbers make it obvious.
 */
function dailyRows() {
  const rows: any[] = [];
  const push = (d: Date, messages: number) => rows.push({
    date: d,
    spend: BigInt(100_000), impressions: BigInt(50_000),
    reach: BigInt(40_000),          // max(daily) would be 40_000
    linkClicks: BigInt(900), landingPageViews: BigInt(700),
    messages: BigInt(messages), leads: BigInt(0), purchases: BigInt(0), clicks: BigInt(1_100),
    ctr: 2.2, cpm: 2_000, cpc: 111,
    frequency: 1.25,                // mean(daily) would be 1.25
    revenueMinor: BigInt(0), roas: null,
  });
  for (let i = 0; i < 7; i++) push(new Date(W.currentUntil.getTime() - i * DAY_MS), 30);
  for (let i = 0; i < 7; i++) push(new Date(W.priorUntil.getTime() - i * DAY_MS), 90);
  return rows;
}

const CAMPAIGN = {
  id: 'camp_p1', name: 'Period Fixture', externalCampaignId: '99001',
  status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT', messagingCtaAds: 3,
  adAccountId: 'acct_p1',
  adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }],
};

/** @param periodFacts keyed `since..until`; absent key = Meta had no answer. */
function makePrisma(periodFacts: Record<string, { reach: number | null; frequency: number | null }> = {}) {
  const rows = dailyRows();
  return {
    campaign: { async findUnique() { return CAMPAIGN; } },
    dailyStat: { async findMany() { return rows; } },
    periodInsight: {
      async findUnique({ where }: any) {
        const k = where.entityType_entityId_since_until;
        const hit = periodFacts[`${isoDay(k.since)}..${isoDay(k.until)}`];
        if (!hit) return null;
        return {
          reach: hit.reach === null ? null : BigInt(hit.reach),
          frequency: hit.frequency,
          impressions: BigInt(350_000),
          provenance: META_PERIOD_FACT,
          fetchedAt: new Date(),
        };
      },
    },
  } as any;
}

const CUR = `${isoDay(W.currentSince)}..${isoDay(W.currentUntil)}`;
const PRI = `${isoDay(W.priorSince)}..${isoDay(W.priorUntil)}`;

const run = (prisma: any) =>
  buildEntityFunnel(prisma, EntityType.CAMPAIGN, 'camp_p1', 'messaging', {});

async function main() {
  console.log('\n── 1. Daily values cannot masquerade as period values ──');

  await checkAsync('daily reach cannot masquerade as period reach', async () => {
    const f = await run(makePrisma());     // no period fact stored
    assert.equal(f!.windows.reachCur, null,
      'with no Meta period fact the period reach must be UNKNOWN, not max(daily)=40000');
    assert.notEqual(f!.windows.reachCur, 40_000, 'max(daily reach) must never surface as period reach');
    assert.notEqual(f!.windows.reachCur, 280_000, 'sum(daily reach) must never surface as period reach');
    assert.equal(f!.windows.periodFactSource, 'UNAVAILABLE');
  });

  await checkAsync('daily frequency cannot masquerade as period frequency', async () => {
    const f = await run(makePrisma());
    assert.equal(f!.windows.freqCur, null,
      'with no Meta period fact the period frequency must be UNKNOWN, not mean(daily)=1.25');
    assert.notEqual(f!.windows.freqCur, 1.25, 'the flat mean of daily frequencies must never surface');
    // Nor the other tempting derivation: impressions ÷ max(daily reach).
    assert.notEqual(f!.windows.freqCur, +(350_000 / 40_000).toFixed(4),
      'impressions ÷ max(daily reach) is a fabricated period metric');
  });

  console.log('\n── 2. Meta period truth wins when available ──');

  await checkAsync('stored META_PERIOD_FACT is used verbatim for both windows', async () => {
    const f = await run(makePrisma({
      [CUR]: { reach: 120_000, frequency: 4.6 },
      [PRI]: { reach: 118_000, frequency: 2.1 },
    }));
    assert.equal(f!.windows.reachCur, 120_000, "Meta's period reach must be used as reported");
    assert.equal(f!.windows.reachPri, 118_000);
    assert.equal(f!.windows.freqCur, 4.6, "Meta's period frequency must be used as reported");
    assert.equal(f!.windows.freqPri, 2.1);
    assert.equal(f!.windows.periodFactSource, 'META_PERIOD_FACT');
    // Non-vacuous: these differ from every daily-derived candidate.
    assert.notEqual(f!.windows.freqCur, 1.25);
    assert.notEqual(f!.windows.reachCur, 40_000);
  });

  await checkAsync('a span that does not match EXACTLY is a miss, not a near-enough hit', async () => {
    // A fact stored one day off. Accepting it would describe different people
    // over different days — a fabricated period metric through the back door.
    const offBy = `${isoDay(new Date(W.currentSince.getTime() - DAY_MS))}..${isoDay(W.currentUntil)}`;
    const f = await run(makePrisma({ [offBy]: { reach: 120_000, frequency: 4.6 } }));
    assert.equal(f!.windows.reachCur, null, 'a neighbouring span must not satisfy the lookup');
    assert.equal(f!.windows.freqCur, null);
  });

  console.log('\n── 3. Failure becomes UNKNOWN, never a stand-in ──');

  await checkAsync('a storage failure degrades to UNKNOWN rather than throwing or guessing', async () => {
    const prisma = makePrisma();
    prisma.periodInsight.findUnique = async () => { throw new Error('relation "period_insights" does not exist'); };
    const f = await run(prisma);
    assert.ok(f, 'analysis must still complete — the metric is absent, not the campaign');
    assert.equal(f!.windows.reachCur, null);
    assert.equal(f!.windows.freqCur, null);
    assert.equal(f!.windows.periodFactSource, 'UNAVAILABLE');
  });

  check('an untrustworthy Meta value is discarded, not coerced', () => {
    for (const bad of [null, undefined, '', 'N/A', -1, NaN]) {
      const n = normalizePeriodRow({ reach: bad as never, frequency: bad as never, impressions: bad as never });
      assert.equal(n.reach, null, `${String(bad)} must not become a reach`);
      assert.equal(n.frequency, null, `${String(bad)} must not become a frequency`);
    }
    // And a real value survives, so the guard is not simply rejecting everything.
    const good = normalizePeriodRow({ reach: '120000', frequency: '4.6', impressions: '350000' });
    assert.equal(good.reach, 120_000);
    assert.equal(good.frequency, 4.6);
    assert.equal(good.provenance, META_PERIOD_FACT);
  });

  console.log('\n── 4. Fatigue cannot fire from a fabricated frequency ──');

  await checkAsync('UNKNOWN frequency withholds fatigue instead of guessing', async () => {
    const f = await run(makePrisma());        // frequency UNKNOWN
    const intel = buildEntityIntelligence(
      f!.funnel, f!.family, f!.windows,
      f!.classificationConfidence, f!.dataConfidence, f!.resultApproximate,
    );
    // The daily rows carry frequency 1.25 and reach 40_000. If either leaked
    // in, fatigue would have real inputs. It must have none.
    assert.ok(!intel.fatigue || intel.fatigue.severity === 'NONE'
      || intel.fatigue.confidence === 'INSUFFICIENT_DATA',
      'fatigue must not reach a verdict from an UNKNOWN period frequency');
  });

  await checkAsync('a real Meta frequency above saturation IS able to fire', async () => {
    // The non-vacuous counterpart: withholding must be caused by UNKNOWN, not
    // by fatigue being broken outright.
    const f = await run(makePrisma({
      [CUR]: { reach: 60_000, frequency: 5.8 },   // above FREQUENCY_SATURATED (4.0)
      [PRI]: { reach: 118_000, frequency: 2.0 },
    }));
    assert.equal(f!.windows.freqCur, 5.8, 'the fixture must actually supply a saturated frequency');
    const intel = buildEntityIntelligence(
      f!.funnel, f!.family, f!.windows,
      f!.classificationConfidence, f!.dataConfidence, f!.resultApproximate,
    );
    assert.ok(intel.fatigue, 'a real period frequency must produce a fatigue signal object');
    assert.notEqual(intel.fatigue!.severity, 'NONE',
      'frequency 5.8 with a 2.0 baseline must register — otherwise the previous test proves nothing');
  });

  console.log('\n── 5. Source-level: no daily-derived period metric survives ──');

  check('entityIntelligence derives neither reach nor frequency from daily rows', () => {
    const src = readFileSync(join(__dirname, 'src/services/entityIntelligence.ts'), 'utf8');
    assert.ok(!/const favg\b/.test(src),
      'favg averaged daily frequencies flat — it must not come back');
    assert.ok(!/freq:\s*\[\]/.test(src), 'the daily-frequency accumulator must be gone');
    // reachCur/freqCur must be read from the period fact, never computed here.
    assert.ok(/reachCur: periodCur\?\.reach/.test(src),
      'period reach must come from the stored META_PERIOD_FACT');
    assert.ok(/freqCur: periodCur\?\.frequency/.test(src),
      'period frequency must come from the stored META_PERIOD_FACT');
  });

  check('the analysis window has exactly one definition', () => {
    // Writer and reader must agree to the day, or every lookup misses and the
    // feature silently disables itself while looking like Meta went quiet.
    const leaf = readFileSync(join(__dirname, 'src/lib/analysisWindow.ts'), 'utf8');
    assert.deepEqual(leaf.match(/^\s*import\s/gm) || [], [],
      'analysisWindow.ts must stay import-free');
    for (const rel of ['src/services/entityIntelligence.ts', 'src/workers/syncPeriodInsights.ts']) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      assert.ok(/resolveAnalysisWindows\(/.test(src), `${rel} must use the shared resolver`);
      assert.ok(!/lagDays = 2, windowDays = 7/.test(src), `${rel} must not restate the window maths`);
    }
  });

  check('the Observatory reaches period facts through the database, never Meta', () => {
    const src = readFileSync(join(__dirname, 'src/services/brainObservatory.ts'), 'utf8');
    assert.ok(!/metaClient|getPeriodInsights/.test(src),
      'the read-only inspector must not acquire a Meta client through the period-fact work');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

main();
