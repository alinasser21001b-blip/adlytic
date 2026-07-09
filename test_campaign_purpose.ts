/**
 * Campaign purpose resolution — ENGAGEMENT+CONVERSATIONS → messaging.
 * Run: npx tsx test_campaign_purpose.ts
 */
import assert from 'node:assert/strict';
import {
  familyFromOptimizationGoal,
  resolveCampaignPurpose,
} from './src/lib/campaignPurpose';
import { resultCountForObjective, efficiencyForObjective } from './src/lib/objectiveKpis';

// Optimization goal mapping
assert.equal(familyFromOptimizationGoal('CONVERSATIONS'), 'messaging');
assert.equal(familyFromOptimizationGoal('REACH'), 'awareness');
assert.equal(familyFromOptimizationGoal('LINK_CLICKS'), 'traffic');
assert.equal(familyFromOptimizationGoal('POST_ENGAGEMENT'), 'engagement');
assert.equal(familyFromOptimizationGoal('OFFSITE_CONVERSIONS'), 'sales');

// The bug from production: Meta shows Engagement + Conversations → messages
const engagementMessages = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['CONVERSATIONS'],
  messagesWindow: 13,
});
assert.equal(engagementMessages.family, 'messaging');
assert.equal(engagementMessages.labelAr, 'رسائل');
assert.equal(engagementMessages.kpi.resultKey, 'messages');
assert.equal(engagementMessages.kpi.efficiencyKey, 'costPerMessage');
assert.equal(engagementMessages.kpi.resultLabelAr, 'إجمالي الرسائل');
assert.equal(engagementMessages.kpi.efficiencyLabelAr, 'تكلفة الرسالة');
assert.ok(engagementMessages.reason.includes('CONVERSATIONS'));

// Awareness + REACH stays awareness (Meta screenshot: وعي ٤٦)
const awareness = resolveCampaignPurpose({
  objective: 'OUTCOME_AWARENESS',
  optimizationGoals: ['REACH'],
  messagesWindow: 0,
});
assert.equal(awareness.family, 'awareness');
assert.equal(awareness.labelAr, 'وعي بالعلامة');
assert.equal(awareness.kpi.resultKey, 'impressions');
assert.equal(awareness.kpi.efficiencyKey, 'cpm');

// True post engagement (no conversations) stays engagement
const postEng = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  messagesWindow: 0,
});
assert.equal(postEng.family, 'engagement');
assert.equal(postEng.kpi.resultKey, 'clicks');

// Soft fallback: engagement + messages, no opt goal → messaging
const soft = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: [],
  messagesWindow: 13,
});
assert.equal(soft.family, 'messaging');
assert.equal(soft.reason, 'soft:engagement_with_messages');

// Soft must NOT override awareness even if messages somehow present
const awarenessSoft = resolveCampaignPurpose({
  objective: 'OUTCOME_AWARENESS',
  optimizationGoals: [],
  messagesWindow: 5,
});
assert.equal(awarenessSoft.family, 'awareness');

// KPI math for messaging purpose
const totals = {
  spendMinor: 447, // $4.47
  impressions: 1171,
  reach: 840,
  clicks: 114,
  messages: 13,
  purchases: 0,
  leads: 0,
  revenueMinor: 0,
};
assert.equal(resultCountForObjective('MESSAGES', totals), 13);
const cpmMsg = efficiencyForObjective('MESSAGES', totals, 100);
assert.ok(cpmMsg != null);
assert.ok(Math.abs(cpmMsg! - 4.47 / 13) < 1e-9);

// Engagement-without-purpose would wrongly use clicks — purpose prevents that
assert.equal(resultCountForObjective('OUTCOME_ENGAGEMENT', totals), 114);
assert.notEqual(
  engagementMessages.kpi.resultKey,
  'clicks',
  'conversations-optimized engagement must not use clicks as results',
);

console.log('test_campaign_purpose: ok');
