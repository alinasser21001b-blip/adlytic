/**
 * cmoFeedV2 / REFRESH_CREATIVE authority gap — CLOSED.
 *
 * Supersedes test_cmofeed_contradiction_proof.ts (deleted in the same commit
 * as this file, per that file's own header: "WHEN THIS DEFECT IS FIXED, THIS
 * FILE MUST FAIL... its failure is the signal to delete it"). That file
 * proved the gap was reachable; this file proves applyCmoFeedAuthorityGuard()
 * (src/services/getDashboard.ts) actually closes it, behaviorally — by
 * driving the REAL production chain (resolveEntityIntelligenceForGuard() →
 * buildEntityFunnel()/buildEntityIntelligence() → permitAction()) over a fake
 * Prisma, not by asserting source shape alone.
 *
 * Covers:
 *   1. The known contradiction (POST_CLICK / REFRESH_CREATIVE) is blocked —
 *      the item is dropped from the guarded feed, never backfilled.
 *   2. A legitimately-permitted creative case (CLICK-stage break) survives.
 *   3. No diagnosis / insufficient data ⇒ allowed (absence isn't proof).
 *   4. Deterministic repeated calls.
 *   5. Multiple campaigns are judged independently in one call.
 *   6. Tenant/campaign isolation — no cross-contamination between calls.
 *   7. No N+1 — guard cost is bounded by items.length, not by any larger
 *      candidate pool; structurally wired only onto buildCmoFeedV2()'s output.
 *
 * Run: npx tsx test_cmofeed_authority_guard.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType } from '@prisma/client';

import {
  applyCmoFeedAuthorityGuard,
  BRAIN_SECTION_CONFIG,
  type BrainSnapshotRow,
} from './src/services/getDashboard';
import { buildEntityFunnel, buildEntityIntelligence } from './src/services/entityIntelligence';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { classificationConfidenceFromReason } from './src/analytics/confidence';
import type { CmoFeedItemDTO } from './src/types/cmoFeed';

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
const dashSrc = src('src/services/getDashboard.ts');

// ── Fixtures ──────────────────────────────────────────────────────────────
//
// Same campaign identity/shape convention as test_brain_observatory.ts
// (messaging family: OUTCOME_ENGAGEMENT + CONVERSATIONS/WHATSAPP), but two
// distinct funnel shapes:
//   · CAMPAIGN_BLOCKED — upstream flat, messages collapse 90→30/day ⇒ POST_CLICK.
//   · CAMPAIGN_PERMITTED — upstream (reach) flat, link clicks collapse
//     900→300/day while the messages÷linkClicks ratio holds steady ⇒ the
//     EARLIEST break is at the CLICK stage, which forbids only audience
//     actions — REFRESH_CREATIVE stays permitted, and is in fact the
//     textbook "creative isn't earning clicks" remedy for this exact shape.

const DAY_MS = 86_400_000;

function campaignOf(id: string) {
  return {
    id, name: `Fixture ${id}`,
    externalCampaignId: `ext_${id}`, status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT',
    messagingCtaAds: 3, adAccountId: 'acct_fixture',
    adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }],
  };
}

function dayRow(date: Date, opts: { impressions?: number; reach?: number; linkClicks?: number; messages?: number }) {
  const linkClicks = opts.linkClicks ?? 900;
  return {
    date,
    spend: BigInt(100_000),
    impressions: BigInt(opts.impressions ?? 50_000),
    reach: BigInt(opts.reach ?? 20_000),
    linkClicks: BigInt(linkClicks),
    landingPageViews: BigInt(Math.round(linkClicks * 0.8)),
    messages: BigInt(opts.messages ?? 90),
    leads: BigInt(0), purchases: BigInt(0),
    clicks: BigInt(linkClicks + 200),
    ctr: 1.8, cpm: 2_000, cpc: 111, frequency: 2.0, revenueMinor: BigInt(0), roas: null,
  };
}

/** 7 "current" days + 7 "prior" days, anchored to Date.now() like buildEntityFunnel expects. */
function buildWindowRows(
  cur: { linkClicks?: number; messages?: number },
  pri: { linkClicks?: number; messages?: number },
) {
  const lagDays = 2, windowDays = 7;
  const floorUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const currentUntil = floorUtc(new Date(Date.now() - lagDays * DAY_MS));
  const rows: ReturnType<typeof dayRow>[] = [];
  for (let i = 0; i < windowDays; i++) {
    rows.push(dayRow(new Date(currentUntil.getTime() - i * DAY_MS), cur));
  }
  const priorUntil = new Date(currentUntil.getTime() - windowDays * DAY_MS);
  for (let i = 0; i < windowDays; i++) {
    rows.push(dayRow(new Date(priorUntil.getTime() - i * DAY_MS), pri));
  }
  return rows;
}

// POST_CLICK shape: reach/impressions/linkClicks flat, messages collapse 90→30.
const ROWS_BLOCKED = buildWindowRows({ linkClicks: 900, messages: 30 }, { linkClicks: 900, messages: 90 });
// CLICK shape: reach/impressions flat, linkClicks collapse 900→300, messages÷linkClicks held at 0.3.
const ROWS_PERMITTED = buildWindowRows({ linkClicks: 300, messages: 90 }, { linkClicks: 900, messages: 270 });

/**
 * Multi-campaign-aware fake Prisma: every method branches on the requested
 * campaign/entity id, so one instance can serve several campaigns in a
 * single applyCmoFeedAuthorityGuard() call — exactly how one request's
 * Prisma client serves every campaign in buildBrainSection().
 */
function makeFakePrisma(fixtures: Record<string, ReturnType<typeof dayRow>[] | null>) {
  const calls: string[] = [];
  const prisma = {
    campaign: {
      async findUnique(args: any) {
        const id = args?.where?.id;
        calls.push(`campaign.findUnique:${id}`);
        if (!(id in fixtures) || fixtures[id] === null) return null;
        return campaignOf(id);
      },
    },
    dailyStat: {
      async findMany(args: any) {
        const id = args?.where?.entityId;
        calls.push(`dailyStat.findMany:${id}`);
        return fixtures[id] ?? [];
      },
    },
  };
  return { prisma: prisma as any, calls };
}

function feedItem(campaignId: string, actionCode: string): CmoFeedItemDTO {
  return {
    id: `snap_${campaignId}`,
    campaignId,
    campaignName: `Fixture ${campaignId}`,
    insightType: actionCode,
    actionCode,
    date: '2026-08-19',
    title: 'عنوان تجريبي',
    body: 'نص تجريبي',
    severity: 'HIGH',
    dedupeKey: `${campaignId}:${actionCode}:2026-08-19`,
    generatedAt: new Date().toISOString(),
  };
}

async function independentProblemClass(prisma: any, campaignId: string): Promise<string | null> {
  const purpose = resolveCampaignPurpose({
    objective: 'OUTCOME_ENGAGEMENT',
    optimizationGoals: ['CONVERSATIONS'],
    destinationTypes: ['WHATSAPP'],
    messagesWindow: 840, clicksWindow: 15_400, linkClicksWindow: 12_600,
    messagingCtaAds: 3,
  });
  const funnel = await buildEntityFunnel(
    prisma, EntityType.CAMPAIGN, campaignId, purpose.family,
    { classificationConfidence: classificationConfidenceFromReason(purpose.reason, purpose.corroborated) },
  );
  if (!funnel) return null;
  const intel = buildEntityIntelligence(
    funnel.funnel, funnel.family, funnel.windows,
    funnel.classificationConfidence, funnel.dataConfidence, funnel.resultApproximate,
  );
  return intel.problemClass;
}

async function run() {
  console.log('\n── 0. Fixtures reach the intended, non-vacuous diagnoses ──');

  await checkAsync('CAMPAIGN_BLOCKED fixture independently diagnoses POST_CLICK', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED });
    const pc = await independentProblemClass(prisma, 'camp_blocked');
    assert.equal(pc, 'POST_CLICK', 'fixture must reach POST_CLICK or the block-test below is vacuous');
  });

  await checkAsync('CAMPAIGN_PERMITTED fixture independently diagnoses CLICK (not POST_CLICK/CONVERSION)', async () => {
    const { prisma } = makeFakePrisma({ camp_permitted: ROWS_PERMITTED });
    const pc = await independentProblemClass(prisma, 'camp_permitted');
    assert.equal(pc, 'CLICK', 'fixture must reach CLICK or the permitted-test below is vacuous');
  });

  console.log('\n── 1. The known contradiction is now BLOCKED, not surfaced ──');

  await checkAsync('REFRESH_CREATIVE for the POST_CLICK campaign is dropped from the guarded feed', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED });
    const items = [feedItem('camp_blocked', 'REFRESH_CREATIVE')];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, 0, 'the forbidden action must not survive into the guarded feed');
  });

  await checkAsync('the drop is silent-omission, not a replacement — no new campaignId or action appears', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED });
    const items = [feedItem('camp_blocked', 'REFRESH_CREATIVE')];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    const guardedIds = new Set(guarded.map((i) => i.campaignId));
    for (const id of guardedIds) assert.ok(items.some((i) => i.campaignId === id), 'no campaignId may appear that was not in the input');
  });

  console.log('\n── 2. A legitimately-permitted creative action SURVIVES, annotated ──');

  await checkAsync('REFRESH_CREATIVE for the CLICK-stage campaign remains actionable', async () => {
    const { prisma } = makeFakePrisma({ camp_permitted: ROWS_PERMITTED });
    const items = [feedItem('camp_permitted', 'REFRESH_CREATIVE')];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, 1, 'a permitted action must remain actionable');
    assert.equal(guarded[0]!.permitted, true);
    assert.equal(guarded[0]!.permittedReason, null);
    assert.equal(guarded[0]!.actionCode, 'REFRESH_CREATIVE');
  });

  console.log('\n── 3. No diagnosis / insufficient data ⇒ allowed, not blocked ──');

  await checkAsync('a campaign with zero daily rows (unmeasurable) does not get its action blocked', async () => {
    const { prisma } = makeFakePrisma({ camp_unmeasurable: [] });
    const items = [feedItem('camp_unmeasurable', 'REFRESH_CREATIVE')];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, 1, 'absence of a diagnosis is not proof of a contradiction — must not be dropped');
    assert.equal(guarded[0]!.permitted, true);
  });

  await checkAsync('a campaign that no longer exists does not get its action blocked', async () => {
    const { prisma } = makeFakePrisma({ camp_missing: null });
    const items = [feedItem('camp_missing', 'REFRESH_CREATIVE')];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, 1);
    assert.equal(guarded[0]!.permitted, true);
  });

  console.log('\n── 4. Deterministic repeated calls ──');

  await checkAsync('calling the guard twice on the same input yields identical output', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED, camp_permitted: ROWS_PERMITTED });
    const items = [feedItem('camp_blocked', 'REFRESH_CREATIVE'), feedItem('camp_permitted', 'REFRESH_CREATIVE')];
    const first = await applyCmoFeedAuthorityGuard(prisma, items);
    const second = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.deepEqual(first, second, 'the guard must be a pure function of (prisma state, items)');
  });

  console.log('\n── 5. Multiple campaigns judged independently in ONE call ──');

  await checkAsync('a blocked and a permitted campaign in the same feed are each judged on their OWN diagnosis', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED, camp_permitted: ROWS_PERMITTED });
    const items = [
      feedItem('camp_blocked', 'REFRESH_CREATIVE'),
      feedItem('camp_permitted', 'REFRESH_CREATIVE'),
    ];
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, 1, 'exactly the permitted campaign must survive');
    assert.equal(guarded[0]!.campaignId, 'camp_permitted');
  });

  console.log('\n── 6. Tenant/campaign isolation — no cross-contamination between calls ──');

  await checkAsync('a campaign\'s outcome is identical whether judged alone or alongside another campaign', async () => {
    const { prisma } = makeFakePrisma({ camp_blocked: ROWS_BLOCKED, camp_permitted: ROWS_PERMITTED });
    const alone = await applyCmoFeedAuthorityGuard(prisma, [feedItem('camp_permitted', 'REFRESH_CREATIVE')]);
    const together = await applyCmoFeedAuthorityGuard(prisma, [
      feedItem('camp_blocked', 'REFRESH_CREATIVE'),
      feedItem('camp_permitted', 'REFRESH_CREATIVE'),
    ]);
    const fromTogether = together.find((i) => i.campaignId === 'camp_permitted');
    assert.deepEqual(alone[0], fromTogether, 'one campaign\'s presence must not change another\'s verdict');
  });

  console.log('\n── 7. No N+1 — cost is bounded by items.length, not by account size ──');

  await checkAsync('guarding 5 items (CMO_FEED_LIMIT) costs a small constant multiple of 5 calls, not more', async () => {
    const fixtures: Record<string, ReturnType<typeof dayRow>[]> = {};
    const items: CmoFeedItemDTO[] = [];
    for (let i = 0; i < BRAIN_SECTION_CONFIG.CMO_FEED_LIMIT; i++) {
      const id = `camp_bulk_${i}`;
      fixtures[id] = ROWS_PERMITTED;
      items.push(feedItem(id, 'REFRESH_CREATIVE'));
    }
    const { prisma, calls } = makeFakePrisma(fixtures);
    const guarded = await applyCmoFeedAuthorityGuard(prisma, items);
    assert.equal(guarded.length, BRAIN_SECTION_CONFIG.CMO_FEED_LIMIT, 'all 5 permitted items must survive');
    // resolveEntityIntelligenceForGuard costs ~2 Prisma calls per campaign
    // (campaign.findUnique + dailyStat.findMany for the purpose window;
    // buildEntityFunnel's own dailyStat.findMany is a 3rd, folded into the
    // same fake findMany implementation here since both hit the same mock).
    // The bound that matters: calls scale with items.length, NOT with some
    // larger, unrelated account-wide candidate count.
    assert.ok(calls.length <= items.length * 4,
      `expected calls bounded by items.length (${items.length}); saw ${calls.length}: ${calls.join(', ')}`);
  });

  await checkAsync('duplicate campaignIds among items resolve the campaign only ONCE, not once per item', async () => {
    const { prisma, calls } = makeFakePrisma({ camp_permitted: ROWS_PERMITTED });
    const items = [
      feedItem('camp_permitted', 'REFRESH_CREATIVE'),
      { ...feedItem('camp_permitted', 'SCALE_BUDGET'), id: 'snap_2', dedupeKey: 'camp_permitted:SCALE_BUDGET:2026-08-19' },
    ];
    await applyCmoFeedAuthorityGuard(prisma, items);
    const findUniqueCalls = calls.filter((c) => c.startsWith('campaign.findUnique:camp_permitted'));
    assert.equal(findUniqueCalls.length, 1, 'the same campaignId must be resolved once and reused, not re-queried per item');
  });

  console.log('\n── 8. Structural wiring: the guard runs ONLY on the already-selected feed ──');

  check('buildBrainSection calls the guard on buildCmoFeedV2()\'s OUTPUT, not on snapshots/deduped directly', () => {
    const start = dashSrc.indexOf('async function buildBrainSection(');
    assert.ok(start >= 0, 'buildBrainSection must exist');
    const body = dashSrc.slice(start, start + 3000);
    assert.ok(body.includes('buildCmoFeedV2(snapshots, tickToday, nameById)'), 'must still rank from the full snapshot set');
    assert.ok(body.includes('applyCmoFeedAuthorityGuard(prisma, cmoFeedV2Ranked)'),
      'the guard must run on buildCmoFeedV2()\'s already-capped selection, never on the raw snapshot/candidate pool');
  });

  check('applyCmoFeedAuthorityGuard reuses the canonical resolver + policy — no parallel intelligence, no direct Prisma reads', () => {
    const start = dashSrc.indexOf('async function applyCmoFeedAuthorityGuard(');
    assert.ok(start >= 0, 'applyCmoFeedAuthorityGuard must exist');
    const returnIdx = dashSrc.indexOf('return guarded;', start);
    const end = dashSrc.indexOf('\n}', returnIdx);
    const body = dashSrc.slice(start, end);
    assert.ok(body.includes('resolveEntityIntelligenceForGuard('), 'must reuse the existing guard resolver');
    assert.ok(body.includes('permitAction('), 'must reuse the existing policy function');
    assert.ok(!body.includes('diagnoseFunnel'), 'must not call the funnel engine directly');
    assert.ok(!body.includes('detectAnomaly'), 'must not call the anomaly engine directly');
    assert.ok(!/prisma\.\w+\.(find|create|update|upsert|delete)/.test(body),
      'must not query Prisma directly — every DB read must be delegated to resolveEntityIntelligenceForGuard()');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

run();
