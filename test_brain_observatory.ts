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
import { LAYER_ORDER, PERMIT_ACTION_DOMAIN, CREATIVE_ACTIONS, AUDIENCE_ACTIONS, permitAction, reconcileIntelligence } from './src/analytics/intelligence/hierarchy';
import { CAMPAIGN_BACKFILL_DAYS } from './src/workers/syncHorizon';

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
    // Meta's `ctr` column is clicks(ALL) \u00f7 impressions \u2014 1_100/50_000 = 2.2%.
    // It is deliberately NOT 900/50_000 = 1.8% (that is the link CTR, derived
    // separately). Setting both to the same number would let a regression that
    // conflates the two metrics pass unnoticed.
    ctr: 2.2, cpm: 2_000, cpc: 111, frequency: 2.0, revenueMinor: BigInt(0), roas: null,
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

/**
 * THE BASELINE ACCEPTANCE SHAPE.
 *
 * Reproduces the shape a real campaign showed on the live Observatory: rows
 * in the PRIOR window only, current window carrying no delivery at all. That
 * shape drives reconcileIntelligence() down its INSUFFICIENT_DATA
 * short-circuit (hierarchy.ts: `!funnel || funnel.status === 'INSUFFICIENT_DATA'`),
 * which returns `forbiddenActions: []` — so permitAction() vetoes nothing and
 * every audited code passes the guard while nothing is recommended. Before
 * Mission A that rendered as a column of "PERMITTED".
 *
 * The campaign's identity is deliberately NOT reproduced — only its shape.
 * A fixture pinned to one real campaign id stops being a regression test the
 * moment that campaign changes.
 *
 * @param currentRows how many ZERO-DELIVERY rows to place in the current
 *   window. 0 and 7 produce byte-identical aggregates (every current total is
 *   a sum, and reach is a max), so only storedDates[] can tell them apart —
 *   which is exactly the ambiguity the temporal block exists to resolve.
 */
function buildBaselineShapeRows(currentRows: number) {
  const lagDays = 2, windowDays = 7;
  const floorUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const currentUntil = floorUtc(new Date(Date.now() - lagDays * DAY_MS));
  const currentSince = new Date(currentUntil.getTime() - (windowDays - 1) * DAY_MS);
  const priorUntil = new Date(currentSince.getTime() - DAY_MS);

  const rows: ReturnType<typeof dayRow>[] = [];
  // 5 prior-window rows totalling impressions 5872 / linkClicks 32 /
  // messages 22 / spend 761, with reach peaking at 2371 (max, not a sum).
  // Every row carries the same stored ctr, so the impression-weighted window
  // value is exactly 2.0776% — Meta's all-clicks figure. Link CTR derives to
  // 32/5872 = 0.5449%: a different metric over the same denominator, and the
  // whole reason "CTR" alone is not a metric identity.
  const prior = [
    { imp: 1174, reach: 2371, link: 6, msg: 5, spend: 152, clicks: 24 },
    { imp: 1174, reach: 1900, link: 6, msg: 4, spend: 152, clicks: 24 },
    { imp: 1174, reach: 1850, link: 6, msg: 5, spend: 152, clicks: 25 },
    { imp: 1174, reach: 1800, link: 7, msg: 4, spend: 152, clicks: 24 },
    { imp: 1176, reach: 1750, link: 7, msg: 4, spend: 153, clicks: 25 },
  ];
  prior.forEach((r, i) => {
    rows.push({
      date: new Date(priorUntil.getTime() - i * DAY_MS),
      spend: BigInt(r.spend), impressions: BigInt(r.imp), reach: BigInt(r.reach),
      linkClicks: BigInt(r.link), landingPageViews: BigInt(0),
      messages: BigInt(r.msg), leads: BigInt(0), purchases: BigInt(0), clicks: BigInt(r.clicks),
      ctr: 2.0776, cpm: 2_000, cpc: 111, frequency: 1.2, revenueMinor: BigInt(0), roas: null,
    });
  });
  for (let i = 0; i < currentRows; i++) {
    rows.push({
      date: new Date(currentUntil.getTime() - i * DAY_MS),
      spend: BigInt(0), impressions: BigInt(0), reach: BigInt(0),
      linkClicks: BigInt(0), landingPageViews: BigInt(0),
      messages: BigInt(0), leads: BigInt(0), purchases: BigInt(0), clicks: BigInt(0),
      ctr: null, cpm: null, cpc: null, frequency: null, revenueMinor: BigInt(0), roas: null,
    });
  }
  return rows;
}

const CAMPAIGN = {
  id: 'camp_obs_1', name: 'Observatory Fixture Campaign',
  externalCampaignId: '23851', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT',
  messagingCtaAds: 3, adAccountId: 'acct_obs_1',
  adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }],
};

/**
 * A6 — every mutation vector Prisma exposes, not a hand-picked few.
 *
 * The previous fixture trapped the write methods on the four models the
 * Observatory happens to read. That proves the Observatory does not write
 * TODAY; it proves nothing about a model nobody thought to list. The trap is
 * therefore generic: ANY model, ANY write method, plus the raw-SQL escapes
 * and $transaction — the vectors that bypass the model API entirely.
 */
const WRITE_METHODS = [
  'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany',
  'updateManyAndReturn', 'upsert', 'delete', 'deleteMany',
] as const;

/** Raw SQL and transactions bypass the model API — trapped at the client. */
const CLIENT_ESCAPES = [
  '$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe', '$transaction',
] as const;

function makeFakePrisma(opts: { rows?: ReturnType<typeof dayRow>[]; campaign?: unknown | null; brainAction?: string } = {}) {
  const rows = opts.rows ?? buildRows();
  // The DecisionEngine outcome stored on the snapshot. Configurable because
  // the two fixtures exercise the two sides of the domain boundary:
  // REFRESH_CREATIVE is the one code in BOTH domains, KEEP_COLLECTING is in
  // the DecisionEngine domain only.
  const brainAction = opts.brainAction ?? 'REFRESH_CREATIVE';
  const campaign = opts.campaign === undefined ? CAMPAIGN : opts.campaign;
  const writes: string[] = [];
  const trap = (name: string) => () => { writes.push(name); throw new Error(`WRITE ATTEMPTED: ${name}`); };

  // Only the reads the Observatory is allowed to perform are implemented.
  const reads: Record<string, Record<string, unknown>> = {
    campaign: { async findUnique() { return campaign; } },
    dailyStat: { async findMany() { return rows; } },
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
    },
    campaignBrainSnapshot: {
      async findFirst() {
        return {
          action: brainAction,
          narrationJson: { arabicNarration: 'الإعلان يحتاج تحديثاً حسب تحليل الدماغ.' },
          tickDate: new Date(Date.UTC(2026, 7, 19)),
        };
      },
    },
  };

  /**
   * Every model — including ones this fixture never declared (recommendation,
   * syncJob, adAccount, …) — resolves to a proxy whose write methods trap and
   * whose unimplemented reads fail loudly rather than returning undefined.
   */
  const modelProxy = (model: string) => new Proxy({}, {
    get(_t, method) {
      if (typeof method !== 'string') return undefined;
      const impl = reads[model]?.[method];
      if (impl) return impl;
      if ((WRITE_METHODS as readonly string[]).includes(method)) return trap(`${model}.${method}`);
      return () => { throw new Error(`UNEXPECTED READ: ${model}.${method}`); };
    },
  });

  const modelCache = new Map<string, unknown>();
  const prisma = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      // Never let an `await prisma` treat the proxy as a thenable.
      if (prop === 'then') return undefined;
      if ((CLIENT_ESCAPES as readonly string[]).includes(prop)) return trap(`prisma.${prop}`);
      if (prop === '$connect' || prop === '$disconnect') return async () => undefined;
      if (!modelCache.has(prop)) modelCache.set(prop, modelProxy(prop));
      return modelCache.get(prop);
    },
  });

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
    // A4: 'CTR' alone is not a metric identity. The all-clicks figure is Meta's
    // own reported value; the link figure is derived here and must never be
    // presented as a stored Meta field. Both are asserted so a future rename
    // that silently collapses them back into one label fails loudly.
    assert.equal(factFor('CTR \u2014 all clicks (%)')!.value, w.ctrCur, 'CTR (all clicks) must come from the canonical window context');
    assert.equal(factFor('CTR \u2014 all clicks (%)')!.kind, 'OBSERVED_FACT', "Meta reports ctr itself \u2014 it is observed, not derived");
    assert.equal(factFor('CTR (%)'), undefined, 'the ambiguous bare "CTR (%)" label must no longer exist');
    // Link CTR is DERIVED by buildEntityFunnel and copied here \u2014 the
    // Observatory must not compute it, or the two could disagree.
    const linkCtr = factFor('Link CTR (%)')!;
    assert.equal(linkCtr.kind, 'DERIVED_FACT', 'link CTR is derived by Adlytic, not reported by Meta');
    assert.equal(linkCtr.value, w.linkCtrCur, 'link CTR must come from the canonical window context');
    assert.equal(linkCtr.baseline, w.linkCtrPri);
    assert.ok(/inline_link_click_ctr/.test(linkCtr.source),
      'the fact must name the un-requested Meta field it stands in for');
    // Non-vacuous: the two CTRs must actually differ, or a regression that
    // re-conflates them would pass unnoticed.
    assert.notEqual(linkCtr.value, factFor('CTR \u2014 all clicks (%)')!.value,
      'all-clicks CTR and link CTR must be distinguishable in this fixture');
    // The counters they come from stay visible so a reviewer can check both.
    assert.equal(factFor('Link clicks')!.value, w.cur.linkClicks);
    assert.equal(factFor('Impressions')!.value, w.cur.impressions);
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

  await checkAsync('the canonical decision is audited under DECISION, and the contradiction surfaces', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    // REFRESH_CREATIVE is the ONE code in both domains, so the Brain's own
    // decision is genuinely governable here — and a POST_CLICK diagnosis
    // measured the creative-facing stages healthy, so it must be blocked.
    const cd = snap!.decision.canonicalDecision!;
    assert.ok(cd, 'the deterministic decision must be exposed');
    assert.equal(cd.action, 'REFRESH_CREATIVE');
    assert.equal(cd.deterministic, true);
    assert.match(cd.producer, /DecisionEngine/, 'the decision must name the engine that produced it');
    assert.equal(cd.authorityRelation, 'GOVERNED', 'REFRESH_CREATIVE is inside PERMIT_ACTION_DOMAIN');
    assert.equal(cd.permitState, 'FORBIDDEN',
      'REFRESH_CREATIVE under a POST_CLICK diagnosis must be reported as blocked');
    assert.ok(cd.permitReason, 'the blocking reason must be shown, not just a state');
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
    // Division by ANY qualified metric accessor, not just a bare identifier:
    // `w.cur.linkClicks / w.cur.impressions` is exactly the re-derivation this
    // guard exists to stop, and the earlier `\/\s*impressions` form let it
    // through because of the `w.cur.` prefix.
    const ratioMath = serviceSrc.match(
      /\*\s*1000\b|\/\s*(?:[\w.]+\.)?(?:impressions|reach|clicks|linkClicks|spend)\b|\bspend\s*\/|\/\s*Number\(/g,
    ) || [];
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

  check('the page renders the new identity/temporal/counter-evidence blocks', () => {
    // A pane the assembler produces but the page never prints is invisible
    // truth — the exact failure the Observatory exists to remove.
    for (const [what, needle] of [
      ['object identity', "'OBJECT IDENTITY'"],
      ['insights query level', 'idn.insightsQueryLevel'],
      ['DailyStat ownership level', 'idn.dailyStatOwnershipLevel'],
      ['temporal truth pane', "'TEMPORAL TRUTH'"],
      ['the stored dates themselves', 'tp.storedDates'],
      ['the days with no row', 'tp.datesWithoutRows'],
      ['the coverage basis', 'tp.coverageBasis'],
      ['the withheld-freshness basis', 'tp.freshnessBasis'],
      ['why the legacy status is not a measurement', 'tp.legacyDataStatusBasis'],
      ['counter-evidence', 'd.diagnosis.counterEvidence'],
      ['the action state', 'a.state'],
      ['trace provenance', 't.canonicalSource'],
      ['trace input attribution', 't.inputSource'],
    ] as const) {
      assert.ok(pageSrc.includes(needle), `the page must render ${what} (${needle})`);
    }
  });

  check('the page never presents "permitted" as an endorsement', () => {
    // The deprecated boolean must not drive the action column any more:
    // "PERMITTED" is what made a merely-unvetoed action read as advice.
    assert.ok(!/a\.permitted \? 'PERMITTED'/.test(pageSrc),
      'the binary PERMITTED/BLOCKED rendering is what conflated veto with endorsement');
    assert.ok(pageSrc.includes('st-NOT_VETOED') && pageSrc.includes('st-RECOMMENDED'),
      'NOT_VETOED and RECOMMENDED must be styled distinctly, not share one badge');
    // And they must not resolve to the same CSS declaration.
    const notVetoed = pageSrc.match(/\.st-NOT_VETOED\s*\{([^}]*)\}/);
    const recommended = pageSrc.match(/\.st-RECOMMENDED\s*\{([^}]*)\}/);
    assert.ok(notVetoed && recommended, 'both states need a style rule');
    assert.notEqual(notVetoed![1].trim(), recommended![1].trim(),
      'if the two states look identical, separating them in the data changed nothing for the reader');
  });

  check('the page labels the LLM layer non-authoritative in the rendered output', () => {
    assert.ok(pageSrc.includes('NON-AUTHORITATIVE NARRATION'), 'narration must be visibly labeled for the reviewer');
  });

  console.log('\n── 4. Fact-kind vocabulary + admin gating ──');

  check('NOT_MEASURED exists and is rendered as absence, not as a value', () => {
    assert.ok(serviceSrc.includes("'NOT_MEASURED'"),
      'an unavailable metric needs its own kind — a null OBSERVED_FACT would read as "Meta reported nothing"');
    assert.ok(pageSrc.includes('.kind-NOT_MEASURED'),
      'the kind must be styled, or it renders as an unlabelled blank row');
  });

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

  console.log('\n── 5. A6: every mutation vector, not just the ones already used ──');

  await checkAsync('the write trap fires on models and escapes this fixture never declares', async () => {
    // Proves the trap is generic. If this test passes only because the four
    // read models were hand-listed, the ZERO-writes assertion above would be
    // vacuous for every model nobody thought of.
    const { prisma, writes } = makeFakePrisma();
    const attempts: Array<[string, () => unknown]> = [
      ['recommendation.create',      () => prisma.recommendation.create({})],
      ['recommendation.updateMany',  () => prisma.recommendation.updateMany({})],
      ['recommendation.deleteMany',  () => prisma.recommendation.deleteMany({})],
      ['syncJob.create',             () => prisma.syncJob.create({})],          // sync mutation
      ['syncJob.update',             () => prisma.syncJob.update({})],
      ['adAccount.update',           () => prisma.adAccount.update({})],        // token/lastSyncedAt
      ['campaignBrainSnapshot.upsert', () => prisma.campaignBrainSnapshot.upsert({})],
      ['prisma.$executeRawUnsafe',   () => prisma.$executeRawUnsafe('DELETE FROM daily_stats')],
      ['prisma.$transaction',        () => prisma.$transaction([])],
    ];
    for (const [name, fire] of attempts) {
      assert.throws(fire, /WRITE ATTEMPTED/, `${name} must be trapped, not silently allowed`);
    }
    assert.deepEqual(writes, attempts.map(([n]) => n),
      'every attempted vector must have been recorded by the trap');
  });

  await checkAsync('the Observatory cannot reach a queue, a Meta writer or the sync worker', async () => {
    // Structural, not stylistic: walked at runtime over the real module graph,
    // so a transitive import three levels down is caught too. Reading
    // CAMPAIGN_BACKFILL_DAYS from backgroundScheduler used to drag BullMQ and
    // MetaClient in here; syncHorizon.ts exists to keep that from recurring.
    const Module = require('module');
    const loaded = new Set<string>();
    const orig = Module._load;
    Module._load = function (request: string, ...rest: unknown[]) {
      loaded.add(String(request));
      return orig.apply(this, [request, ...rest]);
    };
    try {
      delete require.cache[require.resolve('./src/services/brainObservatory')];
      require('./src/services/brainObservatory');
    } finally {
      Module._load = orig;
    }
    const forbidden = [...loaded].filter((m) =>
      /bullmq|ioredis|\bqueue\b|metaClient|syncAccount|backgroundScheduler|orchestrator/i.test(m));
    assert.deepEqual(forbidden, [],
      `a read-only inspector must not import a job queue or a Meta/sync writer: ${forbidden.join(', ')}`);
  });

  check('the horizon constant lives in a leaf module with no imports of its own', () => {
    const leaf = src('src/workers/syncHorizon.ts');
    const imports = leaf.match(/^\s*import\s/gm) || [];
    assert.deepEqual(imports, [],
      'syncHorizon.ts must stay import-free — an import here re-opens the path it exists to close');
    // And it must remain the ONE definition, still used by the real scheduler.
    const scheduler = src('src/workers/backgroundScheduler.ts');
    assert.ok(scheduler.includes("from './syncHorizon'"),
      'the scheduler must read the horizon from the leaf, not redeclare it');
    assert.ok(!/const CAMPAIGN_BACKFILL_DAYS\s*=/.test(scheduler),
      'a second definition would let the Observatory report a horizon the sync does not use');
  });

  check('the Observatory issues no network call of its own', () => {
    const net = serviceSrc.match(/\bfetch\s*\(|axios|https?:\/\/graph\.facebook|XMLHttpRequest/g) || [];
    assert.deepEqual(net, [],
      `the Observatory reads the database only; a network call would make it a second Meta client: ${net.join(', ')}`);
    const enqueue = serviceSrc.match(/\.add\s*\(|Queue\s*\(|bootQueueWorkers|enqueue/g) || [];
    assert.deepEqual(enqueue, [], `the Observatory must enqueue nothing: ${enqueue.join(', ')}`);
  });

  console.log('\n── 6. A5: the trace names its own stages and their provenance ──');

  await checkAsync('every canonical layer is present, attributed, and ordered as hierarchy.ts defines', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.equal(snap!.trace.length, LAYER_ORDER.length,
      'the trace must have one entry per REAL layer — no invented stages, no silent gaps');
    assert.deepEqual(snap!.trace.map((t) => t.stage), [...LAYER_ORDER],
      "the trace must follow hierarchy.ts's own LAYER_ORDER");
    snap!.trace.forEach((t, i) => {
      assert.equal(t.ordinal, i + 1);
      assert.ok(t.canonicalSource.length > 0, `${t.stage} must name who decided it`);
      assert.ok(t.inputSource.length > 0, `${t.stage} must name what it consumed`);
      assert.ok(/\.ts::|\.ts /.test(t.canonicalSource),
        `${t.stage}'s canonicalSource must point at a real module, not a description: ${t.canonicalSource}`);
      // Reached ⇔ has a conclusion. Absence is never dressed up as a verdict.
      if (t.status === 'REACHED') {
        assert.ok(t.conclusion, `${t.stage} is REACHED so it must carry the reconciler's own words`);
        assert.equal(t.absenceReason, null);
      } else {
        assert.equal(t.conclusion, null, `${t.stage} did not run — it must not report a conclusion`);
        assert.ok(t.absenceReason, `${t.stage} must say WHY it is absent`);
      }
    });
    assert.deepEqual(
      [...snap!.tracedStages, ...snap!.untracedStages].sort(),
      [...LAYER_ORDER].sort(),
      'traced + untraced must partition the real layers exactly',
    );
    // Non-vacuous: this fixture reaches a full verdict, so nothing is absent.
    assert.deepEqual(snap!.untracedStages, [],
      'a POST_CLICK verdict runs the whole chain — an untraced layer here would mean the fixture stopped early');
  });

  await checkAsync('every trace conclusion is the reconciler\'s own, never re-worded', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    // Independently re-run the canonical chain and compare conclusions.
    const purpose = resolveCampaignPurpose({
      objective: CAMPAIGN.objective,
      optimizationGoals: CAMPAIGN.adSets.map((a) => a.optimizationGoal),
      destinationTypes: CAMPAIGN.adSets.map((a) => a.destinationType),
      messagesWindow: 840, clicksWindow: 15_400, linkClicksWindow: 12_600,
      messagingCtaAds: CAMPAIGN.messagingCtaAds,
    });
    const funnel = await buildEntityFunnel(prisma, EntityType.CAMPAIGN, 'camp_obs_1', purpose.family, {});
    const intel = buildEntityIntelligence(
      funnel!.funnel, funnel!.family, funnel!.windows,
      funnel!.classificationConfidence, funnel!.dataConfidence, funnel!.resultApproximate,
    );
    // The reconciler may emit a layer twice; its LAST word is the one shown.
    const expected = new Map<string, string>();
    for (const t of intel.trace) expected.set(String(t.layer), t.conclusion);
    for (const stage of snap!.trace) {
      assert.equal(stage.conclusion, expected.get(stage.stage) ?? null,
        `${stage.stage}'s conclusion must be reconcileIntelligence's verbatim text`);
    }
  });

  console.log('\n── 7. A4: the action taxonomy separates endorsement from veto ──');

  await checkAsync('AUTHORITY_INVARIANT_VIOLATION never occurs — the guard and the recommender agree', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const violations = snap!.decision.actionAudit.filter((a) => a.state === 'AUTHORITY_INVARIANT_VIOLATION');
    assert.deepEqual(violations, [],
      'recommend.ts returns null when permitAction blocks, so a recommended-yet-forbidden action is '
      + `structurally impossible. Its appearance means that invariant broke: ${violations.map((v) => v.actionCode).join(', ')}`);
  });

  await checkAsync('NOT_VETOED is distinguishable from RECOMMENDED, and NOT_RECOMMENDED is never emitted', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const audit = snap!.decision.actionAudit;
    const states = new Set(audit.map((a) => a.state));
    // POST_CLICK forbids CREATIVE_ACTIONS ∪ AUDIENCE_ACTIONS — i.e. the WHOLE
    // jurisdiction — so every governed code is FORBIDDEN here. NOT_VETOED is
    // exercised on the INSUFFICIENT_DATA fixture in §9, where the reconciler
    // forbids nothing.
    assert.ok(states.has('FORBIDDEN'), 'a POST_CLICK verdict must forbid creative/audience actions');
    assert.deepEqual([...states], ['FORBIDDEN'],
      'POST_CLICK vetoes the entire domain — a surviving code would mean the guard missed one');
    assert.ok(!states.has('NOT_RECOMMENDED' as never),
      'nothing in this codebase records that an action was considered and rejected — emitting '
      + 'NOT_RECOMMENDED would manufacture a meaning no canonical source can support');
    // RECOMMENDED is reserved for the action the recommender actually named.
    const recommended = audit.filter((a) => a.state === 'RECOMMENDED');
    for (const r of recommended) {
      assert.equal(r.actionCode, snap!.decision.recommendedAction,
        'only the canonically recommended action may read as RECOMMENDED');
    }
    // Every permitted-but-unrecommended code must be NOT_VETOED, never RECOMMENDED.
    for (const a of audit) {
      if (a.permitted && a.actionCode !== snap!.decision.recommendedAction) {
        assert.equal(a.state, 'NOT_VETOED',
          `${a.actionCode} passed the veto but nothing advises it — it must not read as an endorsement`);
      }
    }
  });

  console.log('\n── 8. A1/A3: temporal truth is reported as dates, and absence stays absent ──');

  await checkAsync('the temporal block reports the actual stored dates, not a count', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const t = snap!.temporal;
    const expectedDates = buildRows().map((r) => r.date.toISOString().slice(0, 10)).sort();
    assert.deepEqual(t.storedDates, expectedDates, 'storedDates must be the real days, in order');
    assert.equal(t.uniqueDateCount, expectedDates.length);
    assert.equal(t.firstStoredDate, expectedDates[0]);
    assert.equal(t.lastStoredDate, expectedDates[expectedDates.length - 1]);
    assert.equal(t.dataPresence, 'AVAILABLE');
    assert.equal(t.boundarySemantics, 'INCLUSIVE_BOTH_ENDS');
    // Non-vacuous counterpart to the sparse case: a fully covered span must
    // still reach COMPLETE, or the fix would just be a blanket downgrade.
    assert.equal(t.legacyDataStatus, 'COMPLETE',
      'every day carries a row — this window IS verifiably complete');
    // 14 contiguous days across a 14-day span leaves nothing to explain.
    assert.deepEqual(t.datesWithoutRows, []);
    assert.equal(t.temporalCoverage, 'FULL');
  });

  await checkAsync('a gapped window reports UNKNOWN coverage — never SPARSE', async () => {
    // The correction that matters: repository truth cannot distinguish "Meta
    // reported no delivery" from "never synced" from "campaign not running",
    // because Campaign stores no Meta start/stop time. Claiming SPARSE would
    // assert exactly the thing that cannot be checked.
    const rows = buildRows().filter((_, i) => i % 3 === 0);
    const { prisma } = makeFakePrisma({ rows });
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const t = snap!.temporal;
    assert.ok(t.datesWithoutRows.length > 0, 'the fixture must actually have gaps, or this proves nothing');
    assert.equal(t.temporalCoverage, 'UNKNOWN', 'a gap must not be reported as a coverage verdict');
    assert.notEqual(t.temporalCoverage as string, 'SPARSE');
    assert.equal(t.expectedEligibleDates, null, 'the eligible-day calendar is not derivable — it must stay null');
    assert.ok(/NOT COMPUTABLE/.test(t.expectedEligibleDatesBasis));
    assert.ok(/CANNOT be decided/.test(t.coverageBasis), 'the ambiguity must be stated, not implied');
  });

  await checkAsync('freshness is withheld, and the inputs a reader would need are exposed instead', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const t = snap!.temporal;
    assert.equal(t.freshness, 'UNKNOWN', 'no canonical freshness policy exists to reuse');
    assert.ok(/adminOpsHealth/.test(t.freshnessBasis), 'the withheld verdict must name the rules it declined to adopt');
    // The raw inputs are present so a human can apply their own policy.
    assert.ok('lastSyncedAt' in t && 'syncAgeDays' in t && 'latestStoredDateAgeDays' in t);
    assert.equal(t.backfillHorizonDays, CAMPAIGN_BACKFILL_DAYS, 'the horizon must be the sync\'s real constant');
    // No invented threshold anywhere in the temporal reasoning.
    assert.ok(!/24h|48 ?hours|STALE/.test(t.freshnessBasis + t.coverageBasis));
  });

  await checkAsync('identity states levels, so an ad-level screenshot cannot be read as campaign truth', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const id = snap!.identity;
    assert.equal(id.internalEntityType, 'CAMPAIGN');
    assert.equal(id.internalEntityId, 'camp_obs_1');
    assert.equal(id.metaEntityType, 'campaign');
    assert.equal(id.metaExternalId, CAMPAIGN.externalCampaignId);
    assert.equal(id.insightsQueryLevel, 'campaign', 'the Graph API level backing these rows must be explicit');
    assert.equal(id.dailyStatOwnershipLevel, 'CAMPAIGN');
    assert.equal(id.parentCampaign, null, 'this IS the campaign level — the field is present, not omitted');
  });

  console.log('\n── 9. The baseline acceptance shape: INSUFFICIENT_DATA short-circuit ──');

  await checkAsync('rows only in the prior window reproduce the observed 3-layer trace', async () => {
    const { prisma } = makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' });
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.ok(snap, 'a campaign with prior-window rows is still measurable');
    // The exact verdict the live Observatory showed.
    assert.equal(snap!.diagnosis.problemClass, 'NO_MATERIAL_BREAK');
    assert.equal(snap!.diagnosis.confidence, 'INSUFFICIENT_DATA');
    assert.equal(snap!.diagnosis.decidedBy, 'FUNNEL_DIAGNOSIS');
    // reconcileIntelligence() returns at layer 3, so layers 4-6 never form an
    // opinion. They must be reported absent, not back-filled.
    assert.deepEqual(snap!.tracedStages, ['DATA_VALIDITY', 'SEMANTIC_VALIDITY', 'FUNNEL_DIAGNOSIS']);
    assert.deepEqual(snap!.untracedStages, ['ANOMALY_DETECTION', 'HEALTH_IMPACT', 'RECOMMENDATION']);
    for (const stage of snap!.trace) {
      if (stage.status === 'NOT_REACHED') {
        assert.equal(stage.conclusion, null, `${stage.stage} must not report a conclusion it never formed`);
        assert.ok(stage.absenceReason, `${stage.stage} must say why it is absent`);
      }
    }
  });

  await checkAsync('an empty forbidden list must not make every action look advised', async () => {
    // THE ACCEPTANCE CASE. hierarchy.ts's layer-3 short-circuit returns
    // `forbiddenActions: []`, and permitAction() is a pure veto — so it allows
    // everything — while recommend.ts returns null on both NO_MATERIAL_BREAK
    // and INSUFFICIENT_DATA. Before Mission A that rendered as a full column
    // of "PERMITTED" under a verdict of "not enough data to judge".
    const { prisma } = makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' });
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    assert.equal(snap!.decision.recommendedAction, null, 'nothing may be recommended on INSUFFICIENT_DATA');
    assert.deepEqual(snap!.decision.forbiddenActions, [], 'the short-circuit forbids nothing — that is the trap');
    const states = new Set(snap!.decision.actionAudit.map((a) => a.state));
    assert.deepEqual([...states], ['NOT_VETOED'],
      'every audited code must read NOT_VETOED — not one may read RECOMMENDED when nothing was advised');
    // The Brain's own decision is NOT in this table — permitAction has no
    // jurisdiction over KEEP_COLLECTING, so it has no state to show here.
    assert.equal(snap!.decision.actionAudit.find((a) => a.actionCode === 'KEEP_COLLECTING'), undefined,
      'an ungoverned code must never appear in the veto table');
    const cd = snap!.decision.canonicalDecision!;
    assert.equal(cd.action, 'KEEP_COLLECTING');
    assert.equal(cd.authorityRelation, 'NOT_GOVERNED');
    assert.equal(cd.permitState, null,
      'a code the guard cannot rule on must carry NO verdict — NOT_VETOED would be a false clearance');
  });

  await checkAsync('ambiguous day coverage can no longer report COMPLETE', async () => {
    const { prisma } = makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' });
    const t = (await buildBrainObservatory(prisma, 'camp_obs_1'))!.temporal;
    // 5 rows across a 14-day span. This used to read COMPLETE, because
    // buildEntityFunnel returned that as a literal constant — which is how a
    // one-row-in-fourteen-days window reached full confidence. It is now
    // derived from the real coverage.
    assert.equal(t.storedRowCount, 5);
    assert.equal(t.datesWithoutRows.length, 9);
    assert.equal(t.temporalCoverage, 'UNKNOWN');
    assert.equal(t.legacyDataStatus, 'PARTIAL',
      'nine unexplained days cannot report COMPLETE — PARTIAL caps confidence at MEDIUM');
    assert.ok(/NOT A MEASUREMENT/.test(t.legacyDataStatusBasis),
      'the legacy value must still be labelled non-authoritative — the temporal axes are');
  });

  await checkAsync('a window with no delivery yields no rate — null, never zero', async () => {
    const { prisma } = makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' });
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const factFor = (label: string) => snap!.metaTruth.facts.find((f) => f.label === label)!;
    const all = factFor('CTR — all clicks (%)');
    const link = factFor('Link CTR (%)');
    // Zero impressions is no sample, not a 0% rate. A rate of 0 would invite
    // "CTR collapsed to zero" when nothing was served at all.
    assert.equal(all.value, null, 'no impressions means no CTR, not a CTR of zero');
    assert.equal(link.value, null);
    assert.equal(factFor('Impressions').value, 0, 'the counter itself IS zero — the distinction is the point');
    // The prior window carries both metrics, and they are different numbers.
    assert.equal(all.baseline, 2.0776, "the stored all-clicks CTR is Meta's own reported value");
    assert.equal(link.baseline, 0.545, 'link CTR derives to a materially different figure');
    assert.notEqual(all.baseline, link.baseline,
      'if these ever coincide the fixture stops proving the two metrics are distinguishable');
  });

  await checkAsync('zero-delivery rows are distinguishable from absent rows ONLY by storedDates', async () => {
    // The warning that motivated this whole block: every current-window
    // aggregate is a sum (and reach a max), so 7 all-zero rows and 0 rows
    // produce IDENTICAL numbers. If coverage were inferred from the metrics,
    // the two would be indistinguishable — and a sync gap would read the same
    // as a campaign that simply did not deliver.
    const empty = (await buildBrainObservatory(
      makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' }).prisma, 'camp_obs_1'))!;
    const zeroRows = (await buildBrainObservatory(
      makeFakePrisma({ rows: buildBaselineShapeRows(7), brainAction: 'KEEP_COLLECTING' }).prisma, 'camp_obs_1'))!;

    // Indistinguishable by every delivery metric...
    for (const label of ['Impressions', 'Reach', 'Link clicks', 'Messages', 'Spend (minor units)']) {
      const a = empty.metaTruth.facts.find((f) => f.label === label)!;
      const b = zeroRows.metaTruth.facts.find((f) => f.label === label)!;
      assert.equal(a.value, b.value, `${label} cannot tell the two cases apart — that is why dates are reported`);
    }
    assert.equal(empty.diagnosis.problemClass, zeroRows.diagnosis.problemClass);
    assert.equal(empty.diagnosis.confidence, zeroRows.diagnosis.confidence);

    // ...and cleanly separated by the temporal block.
    assert.equal(empty.temporal.storedRowCount, 5);
    assert.equal(zeroRows.temporal.storedRowCount, 12);
    assert.equal(empty.temporal.datesWithoutRows.length, 9);
    assert.equal(zeroRows.temporal.datesWithoutRows.length, 2);
    assert.notDeepEqual(empty.temporal.storedDates, zeroRows.temporal.storedDates,
      'storedDates is the ONLY field that separates these two cases');
    // Neither may claim FULL: 12 of 14 days is still an unexplained absence.
    assert.equal(zeroRows.temporal.temporalCoverage, 'UNKNOWN');
  });

  await checkAsync('sparse coverage cannot reach HIGH confidence — the cap is real', async () => {
    // THE BEHAVIOURAL POINT of deriving dataConfidence. Same funnel break,
    // same verdict; the only difference is whether every day in the span
    // carries a row. Full coverage may reach HIGH; a gap must cap at MEDIUM
    // via reconcileIntelligence()'s PARTIAL rule. Before the fix both
    // returned COMPLETE and both reached HIGH.
    const runWith = async (rows: ReturnType<typeof dayRow>[]) => {
      const { prisma } = makeFakePrisma({ rows });
      const funnel = await buildEntityFunnel(prisma, EntityType.CAMPAIGN, 'camp_obs_1', 'messaging', {});
      const intel = buildEntityIntelligence(
        funnel!.funnel, funnel!.family, funnel!.windows,
        funnel!.classificationConfidence, funnel!.dataConfidence, funnel!.resultApproximate,
      );
      return { dataConfidence: funnel!.dataConfidence, confidence: intel.confidence, problemClass: intel.problemClass };
    };

    const full = await runWith(buildRows());
    // Drop ONE day from an otherwise identical window. The break is a ratio,
    // so the diagnosis must survive — only the coverage claim changes.
    const gapped = await runWith(buildRows().slice(1));

    assert.equal(full.dataConfidence, 'COMPLETE', '14 of 14 days is verifiably complete');
    assert.equal(gapped.dataConfidence, 'PARTIAL', '13 of 14 days cannot be vouched for');
    assert.equal(full.problemClass, gapped.problemClass,
      'the diagnosis must be unchanged — otherwise this compares two different situations');
    assert.equal(full.confidence, 'HIGH', 'the complete case must actually reach HIGH, or the cap proves nothing');
    assert.notEqual(gapped.confidence, 'HIGH', 'a gap in the span must prevent full confidence');
    assert.equal(gapped.confidence, 'MEDIUM', 'PARTIAL caps at MEDIUM — no lower, no higher');
  });

  await checkAsync('DATA_VALIDITY reports the measured value, not a constant', async () => {
    const { prisma } = makeFakePrisma({ rows: buildBaselineShapeRows(0), brainAction: 'KEEP_COLLECTING' });
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const dv = snap!.trace.find((t) => t.stage === 'DATA_VALIDITY')!;
    assert.equal(dv.status, 'REACHED');
    assert.match(String(dv.conclusion), /partial/,
      'the reconciler must SEE the real coverage — a hardcoded COMPLETE made this layer decorative');
  });

  console.log('\n── 10. Authority domains: the veto governs what it governs, and nothing else ──');

  /**
   * permitAction() is a membership test against forbiddenActions, and
   * forbiddenActions is only ever filled from CREATIVE_ACTIONS ∪
   * AUDIENCE_ACTIONS. Every assertion below follows from that one fact.
   */
  const DECISION_ENGINE_DOMAIN = [
    'SCALE_BUDGET', 'HOLD_AND_MONITOR', 'REFRESH_CREATIVE', 'PAUSE_CAMPAIGN',
    'KEEP_COLLECTING', 'RESCUE_WATCH', 'EMERGENCY_PAUSE',
  ] as const;

  await checkAsync('the veto table equals permitAction\'s jurisdiction EXACTLY — not a subset', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const shown = [...snap!.decision.actionAudit.map((a) => a.actionCode)].sort();
    const domain = [...PERMIT_ACTION_DOMAIN].sort();
    // Set EQUALITY. Subset inclusion would let a governed code stay hidden —
    // which is how CHANGE_CREATIVE, NEW_CREATIVE, WIDEN_TARGETING and
    // BROADEN_AUDIENCE went unshown while nine ungoverned codes were.
    assert.deepEqual(shown, domain,
      'the table must be exactly the domain: no ungoverned code shown, no governed code hidden');
    assert.deepEqual(domain, [...new Set([...CREATIVE_ACTIONS, ...AUDIENCE_ACTIONS])].sort(),
      'the domain must be derived from the SAME arrays reconcileIntelligence pushes onto forbidden');
    assert.deepEqual([...snap!.decision.authorityDomain.codes].sort(), domain,
      'the published domain must be the one actually iterated');
  });

  check('permitAction is VACUOUS outside its domain — the reason an ungoverned NOT_VETOED means nothing', () => {
    // Not an argument, a demonstration. permitAction's own signature accepts
    // `string`, so no cast is needed and production typing is untouched.
    const reconciled = { forbiddenActions: [...PERMIT_ACTION_DOMAIN], problemClass: 'POST_CLICK' };
    assert.equal(permitAction('__NOT_A_REAL_ACTION__', reconciled).allowed, true,
      'a string that is not an action at all is "allowed" — that is absence of jurisdiction, not clearance');
    assert.equal(permitAction('KEEP_COLLECTING', reconciled).allowed, true,
      'even with the ENTIRE domain forbidden, an ungoverned code still passes');
    // ...while a governed code under the same input is genuinely blocked.
    assert.equal(permitAction('REFRESH_CREATIVE', reconciled).allowed, false,
      'a governed code IS ruled on — the contrast is what makes the table meaningful');
  });

  await checkAsync('every code in the veto table can genuinely be forbidden on some canonical path', async () => {
    // Stronger than "it is in a list": each code must actually appear in
    // forbiddenActions from a real reconcileIntelligence() run. POST_CLICK
    // forbids creative ∪ audience; CLICK forbids audience only. Their union
    // must cover the whole table, or the table shows a code no diagnosis can
    // ever veto.
    const base = {
      dataConfidence: 'COMPLETE' as const,
      classificationConfidence: 'CONFIRMED' as const,
      anomaly: { kind: 'NONE', significant: false, confidence: 'HIGH' as const, evidence: [] },
      fatigue: null,
    };
    const mkFunnel = (problemClass: string) => ({
      status: 'BREAK', problemClass, degradedStage: 'x', confidence: 'HIGH',
      evidence: [], approximateInvolved: false, stages: [], ratios: [],
    });
    const everForbidden = new Set<string>();
    for (const pc of ['POST_CLICK', 'CONVERSION', 'CLICK', 'DELIVERY']) {
      const r = reconcileIntelligence({ ...base, funnel: mkFunnel(pc) } as never);
      r.forbiddenActions.forEach((a) => everForbidden.add(a));
    }
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const unvetoable = snap!.decision.actionAudit
      .map((a) => a.actionCode)
      .filter((c) => !everForbidden.has(c));
    assert.deepEqual(unvetoable, [],
      `these codes are displayed as governed but no canonical path can forbid them: ${unvetoable.join(', ')}`);
  });

  await checkAsync('no DecisionEngine outcome is silently labelled NOT_VETOED', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const shown = new Set(snap!.decision.actionAudit.map((a) => a.actionCode));
    for (const code of DECISION_ENGINE_DOMAIN) {
      if (code === 'REFRESH_CREATIVE') continue;          // the real overlap
      assert.ok(!shown.has(code),
        `${code} is a DecisionEngine OUTCOME, not a guardable action — it must not carry a permit state`);
    }
  });

  await checkAsync('REFRESH_CREATIVE overlaps both domains, and the Part A veto still bites', async () => {
    // The domains are separated, NOT made disjoint. REFRESH_CREATIVE belongs
    // to both, and it is the exact code behind the cmoFeedV2 authority gap —
    // so if separating the surfaces disarmed it, this fails.
    assert.ok(PERMIT_ACTION_DOMAIN.includes('REFRESH_CREATIVE'));
    assert.ok((DECISION_ENGINE_DOMAIN as readonly string[]).includes('REFRESH_CREATIVE'));
    const overlap = DECISION_ENGINE_DOMAIN.filter((c) => PERMIT_ACTION_DOMAIN.includes(c));
    assert.deepEqual(overlap, ['REFRESH_CREATIVE'], 'exactly one code is in both domains');

    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const row = snap!.decision.actionAudit.find((a) => a.actionCode === 'REFRESH_CREATIVE')!;
    assert.equal(row.state, 'FORBIDDEN', 'POST_CLICK must still forbid REFRESH_CREATIVE');
    assert.equal(snap!.decision.canonicalDecision!.permitState, 'FORBIDDEN',
      "and the Brain's own decision must carry that same verdict");
  });

  await checkAsync('the outside-the-domain surface carries NO verdict, only jurisdiction', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const outside = snap!.decision.outsideVetoDomain;
    assert.ok(outside.length > 0, 'real producers do emit ungoverned codes — that fact must be visible');
    for (const e of outside) {
      assert.equal(e.authorityRelation, 'NOT_GOVERNED');
      assert.ok(!PERMIT_ACTION_DOMAIN.includes(e.code),
        `${e.code} IS governed — it belongs in the veto table, not here`);
      assert.ok(e.producer.includes('.ts'), `${e.code} must name a real producer module`);
      assert.match(e.explanation, /no jurisdiction/,
        'the entry must say the guard cannot rule on it');
      // The load-bearing property: no allowed/forbidden verdict of any kind.
      assert.ok(!('permitted' in e) && !('state' in e) && !('permitState' in e),
        `${e.code} must carry no verdict — assigning one recreates the confusion`);
    }
    // REFRESH_CREATIVE is a DecisionEngine code but IS governed, so the
    // derivation must have filtered it out of this surface.
    assert.ok(!outside.some((e) => e.code === 'REFRESH_CREATIVE'),
      'a governed code must never appear on the ungoverned surface');
    // recommend.ts's four ungoverned templates must be reported.
    for (const code of ['FIX_MESSAGING_DESTINATION', 'FIX_LANDING_PAGE', 'FIX_CONVERSION_STEP', 'REVIEW_BIDDING']) {
      assert.ok(outside.some((e) => e.code === code),
        `${code} is emitted by recommend.ts yet ungoverned — that must be reported, not hidden`);
    }
  });

  await checkAsync('the LLM layer owns no decision and can produce none', async () => {
    const { prisma } = makeFakePrisma();
    const snap = await buildBrainObservatory(prisma, 'camp_obs_1');
    const llm = snap!.llmLayer as Record<string, unknown>;
    assert.equal(llm['authoritative'], false);
    // The fields that put deterministic engine output inside a pane headed
    // "authoritative: false" must be gone, not merely relabelled.
    for (const field of ['brainAction', 'brainActionPermitted', 'brainActionBlockedReason']) {
      assert.ok(!(field in llm),
        `llmLayer.${field} attributed DecisionEngine output to the LLM — it must live under decision`);
    }
    // It may only REFERENCE the canonical decision.
    assert.equal(llm['narratesDecision'], snap!.decision.canonicalDecision!.action,
      'the narration must point at the canonical decision, not restate it as its own');
    assert.match(String(llm['ownershipNote']), /DecisionEngine/,
      'the pane must say who actually decided');
    assert.match(snap!.decision.canonicalDecision!.producer, /DecisionEngine/);
  });

  check('the page renders the decision under DECISION, never under the LLM pane', () => {
    // Anchor on the section markers, not the stage() calls: the page builds
    // each pane's variables before emitting it, so emit order alone would put
    // the decision's own construction outside the block.
    const decisionIdx = pageSrc.indexOf('// 8 DECISION');
    const llmIdx = pageSrc.indexOf('// 9 LLM LAYER');
    assert.ok(decisionIdx >= 0, 'the DECISION section marker must exist');
    assert.ok(llmIdx >= 0, 'the LLM LAYER section marker must exist');
    assert.ok(decisionIdx < llmIdx, 'DECISION must precede the LLM pane in the chain');
    const decisionBlock = pageSrc.slice(decisionIdx, llmIdx);
    const llmBlock = pageSrc.slice(llmIdx);
    assert.ok(decisionBlock.includes('d.decision.canonicalDecision'),
      'DECISION must render the canonical decision');
    // The LLM pane may reference the decision by name, but must never read it
    // from the decision object as though it were its own output.
    assert.ok(!llmBlock.includes('canonicalDecision'),
      'the LLM pane must not re-render the decision as though it owned it');
    assert.ok(llmBlock.includes('narratesDecision'),
      'the LLM pane must reference the decision, not restate it');
    assert.ok(pageSrc.includes('outsideVetoDomain'), 'the ungoverned surface must be rendered');
    assert.ok(pageSrc.includes('authorityRelation'), 'jurisdiction must be visible, not implied');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

run();
