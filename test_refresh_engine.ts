/**
 * Smart Refresh Engine — dependency graph + auto-complete matcher.
 * Run: npx tsx test_refresh_engine.ts
 */
import assert from 'node:assert/strict';
import { planRefresh, budgetChangeSatisfies, CampaignChange } from './src/services/refresh/refreshEngine';

const budgetChange = (prev: string | null, next: string | null): CampaignChange => ({
  campaignId: 'c1',
  externalCampaignId: '123',
  name: 'حملة رسائل',
  kind: 'BudgetChanged',
  prevBudgetMinor: prev,
  newBudgetMinor: next,
});

// ── planRefresh: MetaSyncCompleted ───────────────────────────────────────

// Sync that changed nothing → everything skipped, honestly labeled
const idle = planRefresh({ type: 'MetaSyncCompleted', adAccountId: 'a1', changedRows: 0, campaignChanges: [] });
assert.deepEqual(idle.targets, []);
assert.ok(idle.skipped.some((s) => s.target === 'engines' && s.reason === 'no_data_changes'));
assert.ok(idle.skipped.some((s) => s.target === 'brain' && s.reason === 'no_data_changes'));

// Sync with new insight rows but no campaign edits → full pipeline, no autoComplete
const rowsOnly = planRefresh({ type: 'MetaSyncCompleted', adAccountId: 'a1', changedRows: 42, campaignChanges: [] });
assert.deepEqual(rowsOnly.targets, ['engines', 'brain', 'platformStatsCache']);
assert.deepEqual(rowsOnly.skipped, []);

// Sync that detected a budget change → autoComplete runs FIRST (before engines regenerate)
const withBudget = planRefresh({
  type: 'MetaSyncCompleted',
  adAccountId: 'a1',
  changedRows: 0,
  campaignChanges: [budgetChange('1000000', '1500000')],
});
assert.deepEqual(withBudget.targets, ['autoComplete', 'engines', 'brain', 'platformStatsCache']);

// A status flip (no budget) still triggers engines but not autoComplete
const paused = planRefresh({
  type: 'MetaSyncCompleted',
  adAccountId: 'a1',
  changedRows: 0,
  campaignChanges: [{ campaignId: 'c1', externalCampaignId: '123', name: 'x', kind: 'CampaignPaused' }],
});
assert.deepEqual(paused.targets, ['engines', 'brain', 'platformStatsCache']);

// ── planRefresh: recommendation actions ──────────────────────────────────

for (const type of ['RecommendationExecuted', 'RecommendationDismissed'] as const) {
  const plan = planRefresh({ type, adAccountId: 'a1', workspaceId: 'w1', itemKey: 'priority:INCREASE_BUDGET' });
  assert.deepEqual(plan.targets, ['recommendations', 'health', 'platformStatsCache']);
  assert.ok(plan.skipped.every((s) => s.reason === 'source_data_unchanged_by_user_action'));
  assert.ok(plan.skipped.some((s) => s.target === 'engines'));
  assert.ok(plan.skipped.some((s) => s.target === 'brain'));
}

// ── budgetChangeSatisfies ────────────────────────────────────────────────

// Merchant raised the budget in Meta → satisfies increase/scale, not decrease
const raised = budgetChange('1000000', '1500000');
assert.equal(budgetChangeSatisfies(raised, 'INCREASE_BUDGET'), true);
assert.equal(budgetChangeSatisfies(raised, 'SCALE_BUDGET'), true);
assert.equal(budgetChangeSatisfies(raised, 'increase_budget'), true); // case-insensitive
assert.equal(budgetChangeSatisfies(raised, 'DECREASE_BUDGET'), false);

// Merchant lowered the budget → satisfies decrease only
const lowered = budgetChange('1500000', '1000000');
assert.equal(budgetChangeSatisfies(lowered, 'DECREASE_BUDGET'), true);
assert.equal(budgetChangeSatisfies(lowered, 'INCREASE_BUDGET'), false);

// Values beyond Number.MAX_SAFE_INTEGER compare correctly (BigInt path)
const huge = budgetChange('9007199254740993', '9007199254740992');
assert.equal(budgetChangeSatisfies(huge, 'DECREASE_BUDGET'), true);
assert.equal(budgetChangeSatisfies(huge, 'INCREASE_BUDGET'), false);

// Missing/equal budgets never match
assert.equal(budgetChangeSatisfies(budgetChange(null, '1000'), 'INCREASE_BUDGET'), false);
assert.equal(budgetChangeSatisfies(budgetChange('1000', null), 'INCREASE_BUDGET'), false);
assert.equal(budgetChangeSatisfies(budgetChange('1000', '1000'), 'INCREASE_BUDGET'), false);

// Non-budget change kinds never match
assert.equal(
  budgetChangeSatisfies(
    { campaignId: 'c1', externalCampaignId: '123', name: 'x', kind: 'CampaignActivated' },
    'INCREASE_BUDGET',
  ),
  false,
);

// Unknown action codes never match
assert.equal(budgetChangeSatisfies(raised, 'PAUSE_CAMPAIGN'), false);

console.log('✅ test_refresh_engine: all assertions passed');
