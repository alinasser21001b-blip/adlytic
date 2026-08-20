/**
 * PHASE 2.6 — Canonical result semantics closure.
 *
 * Closes the last live disagreement between the two independently-authored
 * family→result-column tables:
 *   src/analytics/resultSemantics.ts::DEFINITIONS   (the preferred Brain path)
 *   src/lib/objectiveKpis.ts::SPECS                 (canonicalized in P1-02)
 *
 * DEFINITIONS.traffic/app.resultKey now DELEGATES to
 * getKpiSpecForFamily(family).resultKey instead of being hand-duplicated —
 * one authoritative mapping, not two tables that happen to agree.
 *
 * Run: npx tsx test_result_semantics_canonicalization.ts
 */
import assert from 'node:assert/strict';
import {
  resultFor,
  resolveResult,
  resolveResultTotal,
  aggregateMixedResults,
  addResults,
  singleUnitCount,
  type DailyResultRow,
} from './src/analytics/resultSemantics';
import { resultCountForObjective, getKpiSpecForFamily, type WindowTotals, type ObjectiveKpiFamily } from './src/lib/objectiveKpis';
import { buildObjectiveKpiCards, type KpiSource } from './src/analytics/objectiveKpiCards';
import { signalsFromCampaignRaw } from './src/engines/rules/campaignSignals';
import type { CampaignRawData, AccountBaseline } from './src/engine/BaselineCalculator';
import { loadCampaignSignalsBatch } from './src/engines/rules/loadCampaignSignals';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (e: any) => { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); },
  );
}

const baseline: AccountBaseline = {
  avgCostPerMessage: 5, avgCTR: 2, avgFrequency: 2, avgCPM: 10, avgCPC: 0.5,
  metadata: { campaignCount: 1, totalSpend: 100, totalMessages: 10, totalImpressions: 9000, totalClicks: 100 },
  confidence: { score: 90, level: 'high' },
};

function makeFakePrisma(dailyStatRows: any[], campaigns: any[]) {
  return {
    dailyStat: {
      findMany: async (args: any) => {
        const ids: string[] = args.where.entityId.in;
        const gte: Date = args.where.date.gte;
        const lte: Date = args.where.date.lte;
        return dailyStatRows.filter((r) =>
          ids.includes(r.entityId) && r.date.getTime() >= gte.getTime() && r.date.getTime() <= lte.getTime(),
        );
      },
    },
    campaign: {
      findMany: async (args: any) => {
        const ids: string[] = args.where.id.in;
        return campaigns.filter((c) => ids.includes(c.id));
      },
    },
  } as any;
}

const ASOF = new Date('2026-06-15T00:00:00.000Z');
const WITHIN_WINDOW = new Date('2026-06-10T00:00:00.000Z'); // 2026-06-07..06-13 is "current" for asOf=06-15,lag=2,window=7

function dailyStatRow(entityId: string, overrides: Record<string, unknown> = {}) {
  return {
    entityId, date: WITHIN_WINDOW,
    spend: 5000, messages: 0, impressions: 9000, reach: 6000,
    clicks: 100, linkClicks: 37,
    ctr: 1.1, cpm: 500, frequency: 1.5, purchases: 0, leads: 0,
    ...overrides,
  };
}

async function run() {
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 1/2. TRAFFIC_TEST / APP_TEST — the adversarial case ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('traffic: clicks=100, linkClicks=37 → resolveResult reads 37, never 100', () => {
    const r = resolveResult('traffic', { clicks: 100, linkClicks: 37 });
    assert.equal(r.status, 'OK');
    assert.equal((r as any).count, 37);
  });

  await check('app: clicks=100, linkClicks=37 → resolveResult reads 37, never 100', () => {
    const r = resolveResult('app', { clicks: 100, linkClicks: 37 });
    assert.equal(r.status, 'OK');
    assert.equal((r as any).count, 37);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 3. ZERO_VS_MISSING_TEST — explicit zero ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('explicit zero: clicks=100, linkClicks=0 → result is honestly 0, not the clicks value', () => {
    const r = resolveResult('traffic', { clicks: 100, linkClicks: 0 });
    assert.equal(r.status, 'OK', 'a present zero is a real answer, not UNAVAILABLE');
    assert.equal((r as any).count, 0);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 4. Missing linkClicks — resultSemantics.ts\'s OWN, stricter contract ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('missing linkClicks (key absent) → UNAVAILABLE/INSUFFICIENT_DATA, NEVER a silent fallback to clicks', () => {
    // Deliberately distinct from objectiveKpis.ts's resultCountForObjective(),
    // which DOES fall back to clicks for legacy CampaignRawData-based callers
    // that structurally cannot supply linkClicks. resultSemantics.ts has no
    // such caller and no such fallback: an unpopulated column is honestly
    // "no data", never silently re-interpreted as a different metric.
    const row: DailyResultRow = { clicks: 100 };
    assert.equal('linkClicks' in row, false, 'precondition: key truly absent');
    const r = resolveResult('traffic', row);
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal((r as any).reason, 'INSUFFICIENT_DATA');
    assert.equal((r as any).count, undefined, 'no count may be fabricated from clicks');
  });

  await check('missing linkClicks also applies to app', () => {
    const r = resolveResult('app', { clicks: 64 });
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal((r as any).reason, 'INSUFFICIENT_DATA');
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 5/6/7. Untouched families are BYTE-FOR-BYTE unchanged ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('leads unchanged: resultKey is still "leads"', () => {
    assert.equal(resultFor('leads').resultKey, 'leads');
    const r = resolveResult('leads', { leads: 12, clicks: 999, linkClicks: 999 });
    assert.equal((r as any).count, 12, 'leads must ignore clicks/linkClicks entirely');
  });

  await check('sales/purchases unchanged: resultKey is still "purchases"', () => {
    assert.equal(resultFor('sales').resultKey, 'purchases');
    const r = resolveResult('sales', { purchases: 8, clicks: 999, linkClicks: 999 });
    assert.equal((r as any).count, 8);
  });

  await check('messages/messaging unchanged: resultKey is still "messages"', () => {
    assert.equal(resultFor('messaging').resultKey, 'messages');
    const r = resolveResult('messaging', { messages: 55, clicks: 999, linkClicks: 999 });
    assert.equal((r as any).count, 55);
  });

  await check('engagement unchanged: resultKey is STILL "clicks", not linkClicks — proves the fix does not turn every clicks use into linkClicks', () => {
    assert.equal(resultFor('engagement').resultKey, 'clicks');
    const r = resolveResult('engagement', { clicks: 50, linkClicks: 12 });
    assert.equal((r as any).count, 50, 'engagement must read all-clicks, not linkClicks, even when linkClicks is present');
  });

  await check('awareness unchanged: resultKey is still "impressions"', () => {
    assert.equal(resultFor('awareness').resultKey, 'impressions');
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 8. Unknown objective preserves existing behavior ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('unknown/null purpose family never yields a guessed result, linkClicks data present or not', () => {
    const rich = { messages: 50, purchases: 30, leads: 20, clicks: 500, linkClicks: 200, impressions: 90000 };
    const r = resolveResult(null, rich);
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal((r as any).reason, 'NOT_APPLICABLE');
    assert.equal((r as any).count, undefined);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 9. Mixed-unit safety remains intact (the CRITICAL P0 invariant) ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('traffic (linkClicks) and sales (purchases) never sum into one number', () => {
    const t = aggregateMixedResults([
      { family: 'traffic', rows: [{ linkClicks: 37 }], spendMinor: 100_000 },
      { family: 'sales', rows: [{ purchases: 8 }], spendMinor: 50_000 },
    ]);
    assert.equal(t.byUnit.length, 2, 'two distinct outcomes must stay separate');
    assert.equal(t.mixed, true);
    assert.equal(singleUnitCount(t), null, 'no single number may represent both');
    assert.equal(t.byUnit.find((u) => u.outcome === 'site_visits')!.count, 37);
    assert.equal(t.byUnit.find((u) => u.outcome === 'orders')!.count, 8);
  });

  await check('addResults still throws when traffic (visit) and app (install) are combined despite sharing a column', () => {
    const traffic = resolveResultTotal('traffic', [{ linkClicks: 37 }]);
    const app = resolveResultTotal('app', [{ linkClicks: 37 }]);
    assert.notEqual((traffic as any).unit, (app as any).unit, 'same column, still different units');
    assert.throws(() => addResults(traffic, app), /Illegal cross-purpose aggregation/);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── 10. CROSS-PATH AGREEMENT — objectiveKpis = objectiveKpiCards = CampaignRawData fallback = resultSemantics, all 7 families ──');
  // ══════════════════════════════════════════════════════════════════════

  const OBJECTIVE_FOR: Record<ObjectiveKpiFamily, string> = {
    awareness: 'OUTCOME_AWARENESS', traffic: 'OUTCOME_TRAFFIC', engagement: 'OUTCOME_ENGAGEMENT',
    leads: 'OUTCOME_LEADS', sales: 'OUTCOME_SALES', messaging: 'MESSAGES', app: 'OUTCOME_APP_PROMOTION',
  };

  for (const family of ['awareness', 'traffic', 'engagement', 'leads', 'sales', 'messaging', 'app'] as ObjectiveKpiFamily[]) {
    await check(`${family}: objectiveKpis / objectiveKpiCards / CampaignRawData-fallback / resultSemantics all agree`, () => {
      const inputs = { clicks: 100, linkClicks: 37, messages: 55, leads: 12, purchases: 8, impressions: 9000, reach: 6000 };
      const objective = OBJECTIVE_FOR[family];

      // (a) objectiveKpis.ts
      const totals: WindowTotals = { spendMinor: 10_000, revenueMinor: 0, ...inputs };
      const a = resultCountForObjective(objective, totals);

      // (b) objectiveKpiCards.ts — via its headline (priority 1) card for this concept
      const src: KpiSource = {
        spendMinor: 10_000, landingPageViews: 20, revenueMinor: 0,
        ctr: 2, cpc: 100, cpm: 200, frequency: 1.5, roas: null,
        money: (m: number) => `$${(m / 100).toFixed(2)}`,
        ...inputs,
      };
      const cardResult = buildObjectiveKpiCards(family, src);
      const spec = getKpiSpecForFamily(family);
      const RESULT_KEY_TO_CARD_KEY: Record<string, string> = {
        impressions: 'impressions', clicks: 'engagements', linkClicks: 'link_clicks',
        messages: 'conversations', purchases: 'purchases', leads: 'leads',
      };
      const b = cardResult!.cards.find((c) => c.key === RESULT_KEY_TO_CARD_KEY[spec.resultKey])!.value;

      // (c) CampaignRawData fallback path (src/engine/BaselineCalculator.ts, Phase 2.5)
      const raw: CampaignRawData = {
        campaignId: 'c1', campaignName: 'test', objective,
        spend: 100, impressions: inputs.impressions, clicks: inputs.clicks, linkClicks: inputs.linkClicks,
        ctr: 2, frequency: 1.5, messages: inputs.messages, purchases: inputs.purchases, leads: inputs.leads,
        reach: inputs.reach, cpm: 200, cpc: 100,
      };
      const c = signalsFromCampaignRaw(raw, baseline).currentResults;

      // (d) resultSemantics.ts — the table THIS phase fixes
      const d = (resolveResult(family, inputs) as any).count;

      assert.equal(a, b, `${family}: objectiveKpis (${a}) vs objectiveKpiCards (${b})`);
      assert.equal(a, c, `${family}: objectiveKpis (${a}) vs CampaignRawData fallback (${c})`);
      assert.equal(a, d, `${family}: objectiveKpis (${a}) vs resultSemantics (${d})`);
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── PREFERRED_BRAIN path: DailyStat → loadCampaignSignalsBatch() → resultFor() → Signals ──');
  // ══════════════════════════════════════════════════════════════════════

  await check('preferred path: traffic campaign (clicks=100, linkClicks=37) → currentResults=37', async () => {
    const prisma = makeFakePrisma(
      [dailyStatRow('camp_traffic')],
      [{ id: 'camp_traffic', objective: 'OUTCOME_TRAFFIC', messagingCtaAds: 0,
         adSets: [{ optimizationGoal: 'LINK_CLICKS', destinationType: null }] }],
    );
    const signals = await loadCampaignSignalsBatch(prisma, ['camp_traffic'], { asOf: ASOF });
    const s = signals.get('camp_traffic');
    assert.ok(s, 'campaign must resolve a Signals entry');
    assert.equal(s!.purposeFamily, 'traffic');
    assert.equal(s!.currentResults, 37);
    assert.notEqual(s!.currentResults, 100);
  });

  await check('preferred path: app campaign (clicks=100, linkClicks=37) → currentResults=37', async () => {
    const prisma = makeFakePrisma(
      [dailyStatRow('camp_app')],
      [{ id: 'camp_app', objective: 'OUTCOME_APP_PROMOTION', messagingCtaAds: 0,
         adSets: [{ optimizationGoal: 'APP_INSTALLS', destinationType: null }] }],
    );
    const signals = await loadCampaignSignalsBatch(prisma, ['camp_app'], { asOf: ASOF });
    const s = signals.get('camp_app');
    assert.ok(s);
    assert.equal(s!.purposeFamily, 'app');
    assert.equal(s!.currentResults, 37);
  });

  await check('preferred path: messaging campaign unaffected — still reads messages, not linkClicks', async () => {
    const prisma = makeFakePrisma(
      [dailyStatRow('camp_msg', { messages: 42, clicks: 900, linkClicks: 300 })],
      [{ id: 'camp_msg', objective: 'MESSAGES', messagingCtaAds: 0,
         adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }] }],
    );
    const signals = await loadCampaignSignalsBatch(prisma, ['camp_msg'], { asOf: ASOF });
    const s = signals.get('camp_msg');
    assert.ok(s);
    assert.equal(s!.purposeFamily, 'messaging');
    assert.equal(s!.currentResults, 42);
  });

  await check('PREFERRED_VS_FALLBACK_TEST: preferred path (loadCampaignSignalsBatch) and fallback path (signalsFromCampaignRaw/CampaignRawData) agree on the same adversarial traffic input', async () => {
    const prisma = makeFakePrisma(
      [dailyStatRow('camp_x')],
      [{ id: 'camp_x', objective: 'OUTCOME_TRAFFIC', messagingCtaAds: 0,
         adSets: [{ optimizationGoal: 'LINK_CLICKS', destinationType: null }] }],
    );
    const preferred = (await loadCampaignSignalsBatch(prisma, ['camp_x'], { asOf: ASOF })).get('camp_x')!.currentResults;

    const raw: CampaignRawData = {
      campaignId: 'camp_x', campaignName: 'x', objective: 'OUTCOME_TRAFFIC',
      spend: 50, impressions: 9000, clicks: 100, linkClicks: 37,
      ctr: 1.1, frequency: 1.5, messages: 0, reach: 6000, cpm: 500, cpc: 50,
    };
    const fallback = signalsFromCampaignRaw(raw, baseline).currentResults;

    assert.equal(preferred, fallback, `preferred (${preferred}) must equal fallback (${fallback})`);
    assert.equal(preferred, 37);
  });

  console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
  if (fail.length > 0) {
    console.error('failed: ' + fail.join(', '));
    process.exit(1);
  }
}

run();
