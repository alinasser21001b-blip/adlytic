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

  console.log('\n── 4b. The daily-reach estimator is gone, and its removal is bounded ──');

  check('differing cross-day overlap DOES distort the relative change — the estimator was unsafe', () => {
    // This is the disproof of "the bias cancels across windows", and the
    // reason max(daily reach) was removed rather than kept as a diagnostic.
    // Both windows: 7 days x 10,000 impressions, and 10,000 reached per day.
    // The ONLY difference is who those people are.
    const IMP = 70_000, DAILY_REACH = 10_000;
    const priorTrueReach = 70_000;   // a fresh audience daily — no overlap
    const currentTrueReach = 10_000; // the same people daily — total overlap
    const maxDaily = DAILY_REACH;    // identical in both windows

    const trueChange = ((currentTrueReach / IMP) - (priorTrueReach / IMP)) / (priorTrueReach / IMP);
    const estChange = ((maxDaily / IMP) - (maxDaily / IMP)) / (maxDaily / IMP);

    assert.ok(trueChange < -0.85, 'the constructed case is a severe real collapse in reach ÷ impressions');
    assert.equal(estChange, 0, 'max(daily reach) reports NO change for that same collapse');
    // A break of that size reported as nothing at all: the estimator does not
    // merely understate the change, it erases it.
    assert.ok(Math.abs(estChange) < Math.abs(trueChange) / 100,
      'the estimated change must be negligible against a real 85% collapse');
    // And the mirror: overlap flipped the other way hides a large RISE too.
    const mirrorTrue = ((70_000 / IMP) - (10_000 / IMP)) / (10_000 / IMP);
    assert.ok(mirrorTrue > 5, 'the mirror case is a large real rise');
    assert.equal(((maxDaily / IMP) - (maxDaily / IMP)) / (maxDaily / IMP), 0,
      'which the estimator also reports as zero — it is blind in both directions');
  });

  await checkAsync('reach-dependent ratios go UNAVAILABLE, independent ones keep being judged', async () => {
    // The smallest safe degradation. With period reach UNKNOWN:
    //   reach ÷ impressions      → UNAVAILABLE (genuinely needs reach)
    //   link clicks ÷ reach      → UNAVAILABLE (genuinely needs reach)
    //   conversations ÷ clicks   → JUDGED (never needed reach)
    const f = await run(makePrisma());
    assert.equal(f!.windows.reachCur, null, 'the fixture must actually have UNKNOWN reach');
    const stages = f!.funnel!.stages.current as any[];
    const byKey = (k: string) => stages.find((x) => x.stageKey === k);
    assert.equal(byKey('impressions').status, 'OK', 'the entry stage never depended on reach');
    assert.equal(byKey('reach').status, 'UNAVAILABLE');
    assert.equal(byKey('reach').reason, 'UNKNOWN', 'absent, not "too small a sample"');
    assert.equal(byKey('link_clicks').status, 'UNAVAILABLE', 'its ratio divides by reach');
    assert.equal(byKey('link_clicks').count, 6_300, 'but its own count is real and still travels');
    assert.equal(byKey('conversations').status, 'OK',
      'the conversion ratio never touched reach — disabling it would be collateral damage');
    // And the diagnosis still forms from that independent signal.
    assert.equal(f!.funnel!.problemClass, 'POST_CLICK');
    assert.equal(f!.funnel!.status, 'BREAK_FOUND');
  });

  await checkAsync('UNKNOWN reach cannot invent a reach break', async () => {
    // The failure mode the estimator had: manufacturing a reach-stage verdict.
    const f = await run(makePrisma());
    assert.notEqual(f!.funnel!.degradedStage, 'reach',
      'a stage whose input is unknown must never be named as the break');
    const reachRatio = (f!.funnel!.ratios as any[]).find((r) => r.stageKey === 'reach');
    assert.equal(reachRatio.judgeable, false, 'an unknown reach ratio is not judgeable');
    assert.equal(reachRatio.material, false, 'and therefore never material');
  });

  await checkAsync('with Meta period reach present, the reach stage IS judged again', async () => {
    // Non-vacuous counterpart: the stages above are unavailable because reach
    // is unknown, not because the reach stage is broken.
    const f = await run(makePrisma({
      [CUR]: { reach: 60_000, frequency: 5.8 },
      [PRI]: { reach: 118_000, frequency: 2.0 },
    }));
    const stages = f!.funnel!.stages.current as any[];
    const reach = stages.find((x) => x.stageKey === 'reach');
    assert.equal(reach.status, 'OK', "Meta's period reach makes the stage judgeable");
    assert.equal(reach.count, 60_000);
    assert.ok(stages.find((x) => x.stageKey === 'link_clicks').status === 'OK',
      'and the ratio that divides by reach comes back too');
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

  // ── provenance labels must follow the value, not lag behind it ──────────
  // Reach moved from daily_stats to period_insights and its LABEL did not,
  // so the instrument built to prove provenance asserted the exact opposite
  // of the truth for the one field Gate B exists to verify. Guarding the
  // class rather than the instance: any field the funnel sources from a
  // period fact must not be labelled daily_stats, whichever field it is next.
  check('no period-sourced Observatory fact is labelled daily_stats', () => {
    const obs = readFileSync(join(__dirname, 'src/services/brainObservatory.ts'), 'utf8');
    const intel = readFileSync(join(__dirname, 'src/services/entityIntelligence.ts'), 'utf8');

    // Derive the period-sourced window fields from the PRODUCER, so the guard
    // cannot drift out of step with what entityIntelligence actually does.
    // Normalise to BASE names. The producer writes both `reach` (via
    // `cur.reach = periodCur?.reach`) and `freqCur` (via
    // `freqCur: periodCur?.frequency`), so a captured name may already carry
    // the window suffix. Keeping both forms would have the matcher looking
    // for `w.freqCurCur` — which is how the stale Frequency label survived
    // the first version of this guard.
    const periodFields = new Set<string>();
    const addBase = (n: string) => periodFields.add(n.replace(/(?:Cur|Pri)$/, ''));
    for (const m of intel.matchAll(/(\w+)\s*[:=]\s*period(?:Cur|Pri)\?\.\w+/g)) addBase(m[1]!);
    for (const m of intel.matchAll(/(?:cur|pri)\.(\w+)\s*=\s*period(?:Cur|Pri)\?\./g)) addBase(m[1]!);
    assert.ok(periodFields.size > 0, 'expected to find period-sourced fields in entityIntelligence.ts');

    // Every metaFacts entry, as (value expression, source label).
    const offenders: string[] = [];
    for (const m of obs.matchAll(/\{\s*kind:\s*'[A-Z_]+',\s*label:\s*'([^']+)',\s*value:\s*([^,]+),[^}]*?source:\s*(['"`])((?:\\.|(?!\3)[\s\S])*)\3/g)) {
      const [, label, valueExpr, , source] = m;
      const touchesPeriod = [...periodFields].some((f) =>
        new RegExp(`\\b(?:cur|pri)\\.${f}\\b|\\bw\\.${f}(?:Cur|Pri)\\b|\\bw\\.(?:cur|pri)\\.${f}\\b`).test(valueExpr!));
      // Check the DECLARED ORIGIN — the leading token before the em-dash —
      // not whether the string mentions daily_stats anywhere. A correct label
      // legitimately names daily_stats in order to say it is NOT that, and a
      // guard that cannot tell a claim from its own disclaimer just moves the
      // false reading from the page into the test.
      const origin = source!.split('—')[0]!.trim();
      if (touchesPeriod && /^daily_stats\b/.test(origin)) offenders.push(`${label} -> ${origin}`);
    }
    assert.deepEqual(offenders, [],
      `period-sourced facts labelled daily_stats: ${offenders.join('; ')}`);
  });

  check('the Observatory states period provenance instead of implying it', () => {
    const obs = readFileSync(join(__dirname, 'src/services/brainObservatory.ts'), 'utf8');
    assert.ok(/periodFactSource/.test(obs),
      'periodFactSource is computed by entityIntelligence but never surfaced — a reader '
      + 'can then only infer provenance from a non-null number, which conflates '
      + '"Meta said nothing" with "we never looked"');
  });

  check('impressions is never divided by reach anywhere in these modules', () => {
    // Stated as the arithmetic, not as "frequency is not derived". Anchoring
    // on the word `freq` missed the case that actually matters — a Frequency
    // FACT whose value expression is the bare ratio, where the identifier
    // never appears next to the division. The invariant is simpler and
    // stronger: this division should not exist in either file, for any
    // purpose. Meta's period frequency or UNKNOWN; there is no third source.
    for (const rel of ['src/services/brainObservatory.ts', 'src/services/entityIntelligence.ts']) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const hit = /[\w.]*impressions\s*\/\s*[\w.]*reach\b/i.exec(code);
      assert.equal(hit, null,
        `${rel} divides impressions by reach (${hit?.[0]}) — that reconstructs frequency locally, `
        + 'which invents a figure precisely when Meta declined to supply one');
    }
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

main();
