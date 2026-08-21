/**
 * Brain Observatory — read-only X-ray, enforced.
 *
 * The Observatory's entire value depends on one property: it must show what
 * the Brain ACTUALLY concluded, never a second opinion computed for display.
 * A tool that quietly recomputes is worse than no tool — it would show a
 * reasoning chain the production path never followed, and every validation
 * conclusion drawn from it would be wrong.
 *
 * So this suite does not merely check that the source "looks read-only". It
 * runs the assembler against a fake Prisma, independently runs the SAME
 * canonical production functions over the SAME rows, and asserts the
 * Observatory's output is byte-identical to the canonical output. If anyone
 * ever makes the Observatory compute its own threshold, ratio or verdict,
 * these equality assertions break.
 *
 * Covers:
 *   1. Behavioral equality with the canonical chain (the core guarantee).
 *   2. Read-only: no Prisma write call reachable from the service.
 *   3. No re-derivation: the service owns no threshold/ratio arithmetic.
 *   4. Frontend containment: the page re-derives no KPI, decides no family.
 *   5. Fact-kind vocabulary covers all 7 labels the mission requires.
 *   6. Admin gating on every Observatory route.
 *   7. Honest absence: an unmeasurable campaign yields null, not a fabrication.
 *
 * Run: npx tsx test_brain_observatory.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType } from '@prisma/client';

import { buildBrainObservatory } from './src/services/brainObservatory';
import { buildEntityFunnel, buildEntityIntelligence } from './src/services/entityIntelligence';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { classificationConfidenceFromReason } from './src/analytics/confidence';

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

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const serviceSrc = src('src/services/brainObservatory.ts');
const pageSrc = src('src/web/pages/brainObservatoryPage.ts');
const serverSrc = src('src/api/server.ts');

// ── Fake Prisma ─────────────────────────────────────────────────────────
//
// A post-click deterioration shape: impressions/reach/linkClicks all held
// steady, messages collapsed 90 → 30. Upstream measured healthy, downstream
// broke — the canonical chain should reach POST_CLICK and forbid creative
// actions. Exactly the kind of case the Observatory exists to display.

const DAY_MS = 86_400_000;
function dayRow(daysAgo: number, messages: number) {
  const d = new Date(Date.UTC(2026, 7, 20));
  return {
    date: new Date(d.getTime() - daysAgo * DAY_MS),
    spend: BigInt(100_000), impressions: BigInt(50_000), reach: BigInt(20_000),
    linkClicks: BigInt(900), landingPageViews: BigInt(700),
    messages: BigInt(messages), leads: BigInt(0), purchases: BigInt(0), clicks: BigInt(1_100),
    ctr: 1.8, cpm: 2_000, cpc: 111, frequency: 2.0, revenueMinor: BigInt(0), roas: null,
  };
}

/**
 * buildEntityFunnel's window maths is anchored to Date.now(); these fixture
 * rows are placed relative to the same clock so both the Observatory and the
 * independent canonical run see an identical current/prior split.
 */
function buildRows() {
  const rows: ReturnType<typeof dayRow>[] = [];
  const lagDays = 2, windowDays = 7;
  const floorUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const currentUntil = floorUtc(new Date(Date.now() - lagDays * DAY_MS));
  for (let i = 0; i < windowDays; i++) {
    const dt = new Date(currentUntil.getTime() - i * DAY_MS);
    rows.push({ ...dayRow(0, 30), date: dt });            // current window: 30/day
  }
  const priorUntil = new Date(currentUntil.getTime() - windowDays * DAY_MS);
  for (let i = 0; i < windowDays; i++) {
    const dt = new Date(priorUntil.getTime() - i * DAY_MS);
    rows.push({ ...dayRow(0, 90), date: dt });            // prior window: 90/day
  }
  return rows;
}

const CAMPAIGN = {
  id: 'camp_obs_1', name: 'Observatory Fixture Campaign',
  externalCampaignId: '23851', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT',
  messagingCtaAds: 3, adAccountId: 'acct_obs_1',
  adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }],
};

function makeFakePrisma(opts: { rows?: ReturnType<typeof dayRow>[]; campaign?: unknown | null } = {}) {
  const rows = opts.rows ?? buildRows();
  const campaign = opts.campaign === undefined ? CAMPAIGN : opts.campaign;
  const writes: string[] = [];
  const trap = (name: string) => () => { writes.push(name); throw new Error(`WRITE ATTEMPTED: ${name}`); };
  const prisma = {
    campaign: {
      async findUnique() { return campaign; },
      create: trap('campaign.create'), update: trap('campaign.update'),
      upsert: trap('campaign.upsert'), delete: trap('campaign.delete'),
    },
    dailyStat: {
      async findMany() { return rows; },
      create: trap('dailyStat.create'), update: trap('dailyStat.update'),
      upsert: trap('dailyStat.upsert'), deleteMany: trap('dailyStat.deleteMany'),
    },
    detectedIssue: {
      async findMany() {
        return [{
          issueCode: 'LOW_CTR', severity: 'HIGH', date: new Date(Date.UTC(2026, 7, 18)),
          evidenceJson: {
            schema: 'canonical.v1', confidence: { value: 0.8, basis: 'heuristic_constant' },
            window: { days: 7 },
            metrics: [{ metricKey: 'ctr', valueKind: 'level', unit: 'percent', value: 1.8, threshold: 2.0, relativeToThreshold: 0.1 }],
          },
        }];
      },
      create: trap('detectedIssue.create'), deleteMany: trap('detectedIssue.deleteMany'),
    },
    campaignBrainSnapshot: {
      async findFirst() {
        return {
          action: 'REFRESH_CREATIVE',
          narrationJson: { arabicNarration: 'الإعلان يحتاج تحديثاً حسب تحليل الدماغ.' },
          tickDate: new Date(Date.UTC(2026, 7, 19)),
        };
      },
      create: trap('campaignBrainSnapshot.create'), deleteMany: trap('campaignBrainSnapshot.deleteMany'),
    },
    recommendation: { create: trap('recommendation.create'), upsert: trap('recommendation.upsert') },
  };
  return { prisma: prisma as any, writes };
}

async function run() {
  console.log('\n── 1. The Observatory reports the canonical chain VERBATIM (no recomputation) ──');

  await checkAsync('every displayed verdict equals what the canonical engines independently produce', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.ok(snap, 'a snapshot must be produced for a measurable campaign');

    // Independently run the SAME canonical production functions.
    const purpose = resolveCampaignPurpose({
      objective: CAMPAIGN.objective,
      optimizationGoals: CAMPAIGN.adSets.map((a) => a.optimizationGoal),
      destinationTypes: CAMPAIGN.adSets.map((a) => a.destinationType),
      messagesWindow: 840, clicksWindow: 15_400, linkClicksWindow: 12_600,
      messagingCtaAds: CAMPAIGN.messagingCtaAds,
    });
    const funnel = await buildEntityFunnel(
      prisma, EntityType.CAMPAIGN, 'camp_obs_1', purpose.family,
      { classificationConfidence: classificationConfidenceFromReason(purpose.reason, purpose.corroborated) },
    );
    assert.ok(funnel, 'canonical funnel must resolve for the fixture');
    const canonical = buildEntityIntelligence(
      funnel!.funnel, funnel!.family, funnel!.windows,
      funnel!.classificationConfidence, funnel!.dataConfidence, funnel!.resultApproximate,
    );

    // The core guarantee: identical, field for field.
    assert.equal(snap!.diagnosis.problemClass, canonical.problemClass, 'problemClass must be copied, not recomputed');
    assert.equal(snap!.diagnosis.confidence, canonical.confidence, 'confidence must be copied');
    assert.equal(snap!.diagnosis.decidedBy, canonical.decidedBy, 'decidedBy must be copied');
    assert.equal(snap!.diagnosis.alert, canonical.alert, 'alert must be copied');
    assert.equal(snap!.anomalies.kind, canonical.anomaly.kind, 'anomaly kind must be copied');
    assert.equal(snap!.anomalies.significant, canonical.anomaly.significant, 'anomaly significance must be copied');
    assert.equal(snap!.anomalies.confidence, canonical.anomaly.confidence, 'anomaly confidence must be copied');
    assert.deepEqual(snap!.decision.forbiddenActions, canonical.forbiddenActions, 'forbiddenActions must be copied');
    assert.deepEqual(snap!.diagnosis.suppressedIssueCodes, canonical.suppressedIssueCodes, 'suppressedIssueCodes must be copied');
    assert.equal(snap!.decision.recommendedAction, canonical.recommendation?.action ?? null, 'recommendation must be copied');
    assert.deepEqual(snap!.trace.map((t) => t.conclusion), canonical.trace.map((t) => t.conclusion), 'the trace must be the reconciler\'s own');
  });

  await checkAsync('META TRUTH values equal buildEntityFunnel\'s window context exactly', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const purpose = resolveCampaignPurpose({
      objective: CAMPAIGN.objective,
      optimizationGoals: CAMPAIGN.adSets.map((a) => a.optimizationGoal),
      destinationTypes: CAMPAIGN.adSets.map((a) => a.destinationType),
      messagesWindow: 840, clicksWindow: 15_400, linkClicksWindow: 12_600,
      messagingCtaAds: CAMPAIGN.messagingCtaAds,
    });
    const funnel = await buildEntityFunnel(prisma, EntityType.CAMPAIGN, 'camp_obs_1', purpose.family, {});
    const w = funnel!.windows;
    const factFor = (label: string) => snap!.metaTruth.facts.find((f) => f.label === label);
    assert.equal(factFor('Impressions')!.value, w.cur.impressions);
    assert.equal(factFor('Impressions')!.baseline, w.pri.impressions);
    assert.equal(factFor('Messages')!.value, w.cur.messages);
    assert.equal(factFor('Messages')!.baseline, w.pri.messages);
    assert.equal(factFor('CTR (%)')!.value, w.ctrCur, 'CTR must come from the canonical window context');
    assert.equal(factFor('CPM (minor units)')!.value, w.cpmCur, 'CPM must come from the canonical window context');
    assert.equal(factFor('Primary result count')!.value, w.resultCur);
  });

  await checkAsync('the fixture reaches a real verdict — the equality above is not vacuous', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.equal(snap!.diagnosis.problemClass, 'POST_CLICK',
      'upstream healthy + downstream collapse must diagnose POST_CLICK — otherwise this suite proves nothing');
    assert.ok(snap!.decision.forbiddenActions.length > 0, 'a POST_CLICK verdict must forbid creative/audience actions');
    assert.ok(snap!.trace.length > 0, 'the reconciler must have recorded its layers');
    assert.equal(snap!.backwardTraceComplete, true);
  });

  await checkAsync('Brain\'s own action is audited against this campaign\'s diagnosis, and the contradiction surfaces', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.equal(snap!.llmLayer.brainAction, 'REFRESH_CREATIVE');
    assert.equal(snap!.llmLayer.brainActionPermitted, false,
      'REFRESH_CREATIVE under a POST_CLICK diagnosis must be reported as blocked');
    assert.ok(snap!.llmLayer.brainActionBlockedReason, 'the blocking reason must be shown, not just a boolean');
    assert.equal(snap!.llmLayer.authoritative, false, 'the LLM layer must always declare itself non-authoritative');
  });

  await checkAsync('honest absence: an unmeasurable campaign returns null, never a fabricated snapshot', async () => {
    const noRows = makeFakePrisma({ rows: [] });
    assert.equal(await buildBrainObservatory(noRows.prisma, 'camp_obs_1'), null, 'no daily rows → null');
    const noCampaign = makeFakePrisma({ campaign: null });
    assert.equal(await buildBrainObservatory(noCampaign.prisma, 'nope'), null, 'missing campaign → null');
  });

  await checkAsync('assembling a snapshot performs ZERO writes (every write method is a trap)', async () => {
    const { prisma, writes } = makeFakePrisma();
    await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.deepEqual(writes, [], `the Observatory must never write; attempted: ${writes.join(', ')}`);
  });

  console.log('\n── 2. Source-level containment: the service owns no intelligence of its own ──');

  check('the service calls no Prisma write method anywhere', () => {
    const writeCalls = serviceSrc.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g) || [];
    assert.deepEqual(writeCalls, [], `read-only violated: ${writeCalls.join(', ')}`);
  });

  check('the service imports its verdicts from the canonical modules', () => {
    for (const dep of [
      "from './entityIntelligence'",
      "from '../analytics/intelligence/hierarchy'",
      "from '../lib/campaignPurpose'",
      "from '../analytics/resultSemantics'",
      "from '../analytics/evidence'",
    ]) {
      assert.ok(serviceSrc.includes(dep), `must read canonical output via ${dep}`);
    }
  });

  check('the service defines no threshold constant and no metric arithmetic of its own', () => {
    // A threshold comparison against a numeric literal would mean the
    // Observatory had started judging rather than displaying.
    const comparisons = serviceSrc.match(/[<>]=?\s*\d+\.\d+/g) || [];
    assert.deepEqual(comparisons, [], `the Observatory must not judge against thresholds: ${comparisons.join(', ')}`);
    const ratioMath = serviceSrc.match(/\*\s*1000\b|\/\s*impressions|\bspend\s*\/|\/\s*Number\(/g) || [];
    assert.deepEqual(ratioMath, [], `the Observatory must not compute metrics: ${ratioMath.join(', ')}`);
  });

  check('the service does not import a second anomaly/diagnosis engine directly', () => {
    // It must reach anomaly/diagnosis THROUGH buildEntityIntelligence, never
    // by calling the engines itself — that would be a parallel invocation
    // whose inputs could drift from the production path's.
    assert.ok(!/from '\.\.\/analytics\/intelligence\/anomaly'/.test(serviceSrc), 'must not call detectAnomaly directly');
    assert.ok(!/from '\.\.\/analytics\/funnel\/diagnose'/.test(serviceSrc), 'must not call diagnoseFunnel directly');
    assert.ok(!/from '\.\.\/engines\//.test(serviceSrc), 'must not reach into the rule engines');
  });

  console.log('\n── 3. Frontend containment: the page renders, it does not reason ──');

  check('the page re-derives no KPI (no ratio/×1000 arithmetic in its client JS)', () => {
    const derivation = pageSrc.match(/\*\s*1000\b|\/\s*imp\b|\/\s*impressions\b|spendMaj|minorFactor/g) || [];
    assert.deepEqual(derivation, [], `the page must not re-derive metrics: ${derivation.join(', ')}`);
  });

  check('the page decides no objective family and no threshold band', () => {
    for (const forbidden of ['messaging', 'awareness', 'purposeFamily ===', 'resultKey ===', '>= 0.75', '>= 0.5']) {
      assert.ok(!pageSrc.includes(forbidden),
        `the page must not branch on "${forbidden}" — semantics and bands are server-owned`);
    }
  });

  check('the page issues no write request', () => {
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/i.test(pageSrc), 'the Observatory page must never mutate anything');
  });

  check('the page labels the LLM layer non-authoritative in the rendered output', () => {
    assert.ok(pageSrc.includes('NON-AUTHORITATIVE NARRATION'), 'narration must be visibly labeled for the reviewer');
  });

  console.log('\n── 4. Fact-kind vocabulary + admin gating ──');

  check('all 7 required fact kinds exist in the FactKind union', () => {
    for (const kind of ['OBSERVED_FACT', 'DERIVED_FACT', 'ANOMALY', 'DIAGNOSIS', 'RECOMMENDATION', 'DO_NOT_DO', 'LLM_EXPLANATION']) {
      assert.ok(serviceSrc.includes(`'${kind}'`), `FactKind must include ${kind}`);
      assert.ok(pageSrc.includes(`kind-${kind}`), `the page must style ${kind} distinctly`);
    }
  });

  check('both Observatory API routes require platform admin', () => {
    for (const route of [
      "app.get('/api/admin/brain-observatory/campaigns'",
      "app.get('/api/admin/brain-observatory/:campaignId'",
    ]) {
      const idx = serverSrc.indexOf(route);
      assert.ok(idx >= 0, `route must exist: ${route}`);
      const body = serverSrc.slice(idx, idx + 900);
      assert.ok(body.includes('requirePlatformAdmin'), `${route} must gate on requirePlatformAdmin`);
    }
  });

  check('the Observatory page route is behind the same adminPage gate as every operator surface', () => {
    assert.ok(serverSrc.includes("app.get('/admin/brain-observatory', (c) => adminPage(c, brainObservatoryPage));"));
  });

  check('no production decision path consumes the Observatory (it can influence nothing)', () => {
    const consumers: string[] = [];
    for (const rel of [
      'src/services/getDashboard.ts', 'src/services/entityIntelligence.ts',
      'src/analytics/intelligence/hierarchy.ts', 'src/analytics/intelligence/recommend.ts',
      'src/services/agent/tools/saveRecommendation.ts', 'src/engine/AdlyticBrain.ts',
    ]) {
      if (src(rel).includes('brainObservatory')) consumers.push(rel);
    }
    assert.deepEqual(consumers, [],
      `the Observatory must be a leaf — production code importing it would make the X-ray part of the patient: ${consumers.join(', ')}`);
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

run();
