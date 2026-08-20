/**
 * Final independent audit — remediation of genuine P0/P1 findings.
 *
 * Four parallel agents, each with no knowledge of this program's prior
 * phases or plan, independently re-audited the current codebase (not
 * graded against the plan — attacked it cold) and surfaced findings this
 * program's own Phases 4-10 had not caught. Each was re-verified directly
 * against the source before being accepted; several agent claims were
 * investigated and found LESS severe than framed (documented below as
 * "investigated, not fixed" rather than silently dropped).
 *
 * Fixed here:
 *   1. detectLowCtr.ts read the deprecated Signals.objective field instead
 *      of purposeFamily (which "takes precedence... when present" per its
 *      own doc) — every real Signals-builder sets purposeFamily, never
 *      objective, so the detector always fell back to a flat 1.0% CTR
 *      threshold, silently ignoring awareness's 0.6%/leads' 1.2% floors.
 *      Extracted the correct precedence (objectiveInputOf, already used 4x
 *      in diagnose.ts) into types.ts so both files share one function.
 *   2. GET /recommendations returned every account-scoped Recommendation
 *      row with no permitAction() check — getDashboard.ts's own
 *      priorityAction already had this guard (P1-01); this flat list didn't.
 *   3. saveRecommendation.ts (the AI agent's one write tool) persisted any
 *      of its allowed action codes with no check against the entity's own
 *      funnel diagnosis. New shared resolveEntityIntelligenceForGuard()
 *      (entityIntelligence.ts) resolves an entity's reconciled intelligence
 *      independently of any caller claim, for both this write-time guard
 *      and the /recommendations read-time filter.
 *   4. reconcileCampaignStatuses() (reads a Campaign snapshot, then upserts
 *      transition/freeze decisions against it) was called with NO advisory
 *      lock from a live Meta webhook handler and a live BullMQ processor —
 *      the same race class Phase 6B closed for the scheduler/syncChunked
 *      path, via a different, previously uninventoried entry point.
 *   5. purgeAccountAnalytics() didn't cover refresh_states (entityType/
 *      entityId — folded into the existing per-entity delete helper),
 *      refresh_logs (adAccountId), or recommendation_logs (campaignId-
 *      scoped rows). campaign_history_rollups is deliberately NOT covered —
 *      see the code comment; it aggregates across a whole workspace's
 *      campaigns with no per-account column, so a correct fix means a
 *      rollup recompute, not a delete, and needs product direction.
 *   6. syncLifetimeTotals() parsed raw Meta insight rows by hand instead of
 *      through the cordon (mapMetaInsight) — now routed through it, mirroring
 *      campaignFreeze.ts's existing use of the same function against the
 *      same getLifetimeTotalsForEntity() row shape.
 *   7. adAssessor/adlyticContext.ts summed messages+purchases+leads (three
 *      different business-outcome units) into one currentResults number —
 *      the exact anti-pattern resultSemantics.ts exists to make
 *      unrepresentable. It's a materiality/volume signal only (not a
 *      displayed count), so max() preserves that intent without fabricating
 *      a cross-unit total.
 *   8. Brain (engine/AdlyticBrain.ts) computes actions independently of
 *      analytics/intelligence/hierarchy.ts's reconcileIntelligence()/
 *      permitAction() — reconciled only against the pattern-level rule
 *      engine, never against a campaign's own funnel diagnosis. Its one
 *      action code that CAN contradict a diagnosis (REFRESH_CREATIVE) is
 *      already in permitAction()'s vocabulary. The campaign-inspector route
 *      now annotates each Brain timeline entry with permitted/
 *      permittedReason using the SAME campaignIntelligence already computed
 *      there — a history ledger, so entries are annotated, not dropped.
 *      getDashboard.ts's workspace-wide cmoFeedV2 feed is NOT covered by
 *      this pass — see "Investigated, not fixed" below.
 *
 * Investigated, not fixed (documented, not silently dropped):
 *   - getDashboard.ts's buildBrainSection()/cmoFeedV2 spans potentially many
 *     campaigns per workspace; guarding every entry would mean computing
 *     full per-campaign funnel intelligence (2-3 queries + funnel/anomaly/
 *     health computation each) for every unique campaign in a 7-day ledger,
 *     inside the already-heavily-optimized hot dashboard-load path. A real
 *     P1, deliberately deferred rather than rushed into a performance-
 *     sensitive path without proper load-testing.
 *   - syncLifetimeTotals() runs with no advisory lock, concurrently with
 *     locked syncChunked() on every new account connection — but it writes
 *     ONLY AdAccount.lifetimeSpendMinor/lifetimeSyncedAt, columns no other
 *     writer touches, so two unserialized writers to disjoint columns of
 *     the same row is not a correctness risk (Postgres applies both; no
 *     lost update). Not the same defect class as reconcileCampaignStatuses().
 *   - discoverCampaignOnDemand() runs with no advisory lock, but only
 *     upserts current Meta metadata (idempotent by external id) — unlike
 *     reconcileCampaignStatuses(), it does no stale-snapshot delta/
 *     transition detection, so concurrent unlocked upserts are benign
 *     (worst case: redundant writes of the same current data).
 *   - AiSignal (in addition to the already-classified AiAnomalyState) is a
 *     second dead-schema candidate from the same migration batch — added
 *     to test_v5_legacy_disposition.ts's existing classification, no code
 *     change (no migration this program, per its standing discipline).
 *
 * Run: npx tsx test_final_audit_remediation.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

console.log('\n── 1. detectLowCtr.ts prefers purposeFamily over the deprecated objective field ──');

check('objectiveInputOf is defined once in types.ts and exported', () => {
  const t = src('src/engines/rules/types.ts');
  assert.ok(/export function objectiveInputOf\(s: Signals\): ObjectiveInput \{/.test(t));
  assert.ok(t.includes('return s.purposeFamily ?? s.objective;'));
});

check('diagnose.ts imports the shared helper instead of defining its own copy', () => {
  const d = src('src/engines/rules/diagnose.ts');
  assert.ok(d.includes("import { objectiveInputOf, type Signals } from \"./types\";"));
  assert.equal((d.match(/function objectiveInputOf/g) || []).length, 0, 'no local duplicate definition left');
});

check('detectLowCtr.ts no longer checks s.objective alone', () => {
  const c = src('src/engines/rules/detectLowCtr.ts');
  assert.ok(!c.includes('s.objective != null && String(s.objective)'), 'the naive objective-only check must be gone');
  assert.ok(c.includes('objectiveInputOf(s)'), 'must use the shared, purposeFamily-preferring resolver');
});

console.log('\n── 2. /recommendations filters by permitAction(); saveRecommendation.ts guards writes ──');

check('resolveEntityIntelligenceForGuard is a shared, exported function', () => {
  const e = src('src/services/entityIntelligence.ts');
  assert.ok(e.includes('export async function resolveEntityIntelligenceForGuard('));
  assert.ok(e.includes("entityType === EntityType.ACCOUNT"), 'must handle ACCOUNT');
  assert.ok(e.includes("entityType === EntityType.CAMPAIGN"), 'must handle CAMPAIGN');
});

check('GET /recommendations filters recs by permitAction before returning them', () => {
  const s = src('src/api/server.ts');
  const idx = s.indexOf("app.get('/api/workspaces/:workspaceId/recommendations'");
  const routeBody = s.slice(idx, s.indexOf('\n  });', idx));
  assert.ok(routeBody.includes('resolveEntityIntelligenceForGuard'), 'must resolve the account intelligence to check against');
  assert.ok(routeBody.includes('permitAction(r.actionCode, accountIntelligence).allowed'), 'must filter by the guard');
});

check('saveRecommendation.ts calls permitAction before persisting and fails closed on a forbidden action', () => {
  const s = src('src/services/agent/tools/saveRecommendation.ts');
  assert.ok(s.includes('resolveEntityIntelligenceForGuard'));
  assert.ok(s.includes('permitAction(args.actionCode, entityIntelligence)'));
  assert.ok(/if \(!permit\.allowed\) \{[\s\S]{0,200}?return fail\(\s*'FORBIDDEN'/.test(s), 'must return FORBIDDEN, not silently proceed, when the guard disallows the action');
});

console.log('\n── 3. reconcileCampaignStatuses() is advisory-locked at its two previously-unlocked entry points ──');

check('metaWebhook.ts acquires the per-account advisory lock before reconciling', () => {
  const w = src('src/services/metaWebhook.ts');
  assert.ok(w.includes('tryAcquireAdvisoryLock(prisma, adAccountId)'));
  assert.ok(/tryAcquireAdvisoryLock\(prisma, adAccountId\)[\s\S]{0,300}?reconcileCampaignStatuses/.test(w), 'lock must be acquired BEFORE the reconcile call');
  assert.ok(w.includes('releaseAdvisoryLock(prisma, lockId)'));
});

check('reconcileCampaignsProcessor.ts acquires the same lock before reconciling', () => {
  const p = src('src/workers/queue/reconcileCampaignsProcessor.ts');
  assert.ok(p.includes('tryAcquireAdvisoryLock(prisma, account.id)'));
  assert.ok(/tryAcquireAdvisoryLock\(prisma, account\.id\)[\s\S]{0,300}?reconcileCampaignStatuses/.test(p), 'lock must be acquired BEFORE the reconcile call');
  assert.ok(p.includes('releaseAdvisoryLock(prisma, lockId)'));
});

console.log('\n── 4. purgeAccountAnalytics() covers the 3 newly-found entity-keyed tables ──');

check('entityDeletes() now also deletes refresh_states (entityType/entityId-keyed)', () => {
  const p = src('src/services/accountDataPurge.ts');
  const fnBody = p.slice(p.indexOf('function entityDeletes'), p.indexOf('\n}', p.indexOf('function entityDeletes')));
  assert.ok(fnBody.includes('prisma.refreshState.deleteMany({ where })'));
});

check('purgeAccountAnalytics() deletes refresh_logs by adAccountId and recommendation_logs by campaignId', () => {
  const p = src('src/services/accountDataPurge.ts');
  assert.ok(p.includes('prisma.refreshLog.deleteMany({ where: { adAccountId: accountId } })'));
  assert.ok(p.includes('prisma.recommendationLog.deleteMany({ where: { campaignId: { in: campaignIds } } })'));
});

check('campaign_history_rollups is documented as deliberately uncovered, not silently missed', () => {
  const p = src('src/services/accountDataPurge.ts');
  assert.ok(p.includes('campaign_history_rollups is deliberately NOT covered'));
});

console.log('\n── 5. syncLifetimeTotals() routes through the Meta cordon ──');

check('syncLifetimeTotals() calls mapMetaInsight instead of reading r.spend by hand', () => {
  const s = src('src/workers/syncAccount.ts');
  const fnBody = s.slice(s.indexOf('async syncLifetimeTotals('), s.indexOf('\n  }', s.indexOf('async syncLifetimeTotals(')));
  assert.ok(fnBody.includes('mapMetaInsight(r, { currencyMinorFactor: factor })'));
  assert.ok(!fnBody.includes("typeof v === 'number' ? v : parseFloat"), 'the old hand-rolled parse must be gone');
});

console.log('\n── 6. adAssessor currentResults no longer sums cross-unit counters ──');

check('adlyticContext.ts uses Math.max, not a cross-unit sum, for the materiality signal', () => {
  const a = src('src/adAssessor/adlyticContext.ts');
  assert.ok(!a.includes('metrics.messages + metrics.purchases + metrics.leads'), 'the cross-unit sum must be gone');
  assert.ok(a.includes('Math.max(metrics.messages, metrics.purchases, metrics.leads)'));
});

console.log('\n── 7. Brain timeline entries are annotated against the funnel\'s own diagnosis ──');

check('the campaign-inspector timeline carries permitted/permittedReason computed via permitAction', () => {
  const s = src('src/api/server.ts');
  const idx = s.indexOf('timeline: snapshots.map((s) => {');
  assert.ok(idx >= 0, 'the timeline builder must be found');
  const block = s.slice(idx, idx + 900);
  assert.ok(block.includes('campaignIntelligence ? permitAction(s.action, campaignIntelligence)'));
  assert.ok(block.includes('permitted:'));
  assert.ok(block.includes('permittedReason:'));
});

console.log('\n── 8. AiSignal added to the dead-schema classification (V5/legacy disposition) ──');

check('test_v5_legacy_disposition.ts also classifies AiSignal as dead schema', () => {
  const t = src('test_v5_legacy_disposition.ts');
  assert.ok(t.includes('model AiSignal'), 'must assert the model is still present, not dropped');
  assert.ok(t.includes("content.includes('AiSignal') || content.includes('ai_signals')"), 'must assert zero src/ references');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
