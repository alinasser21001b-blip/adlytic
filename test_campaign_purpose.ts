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

// Evidence fallback: engagement + real conversations, no opt goal → messaging
const soft = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: [],
  messagesWindow: 13,
});
assert.equal(soft.family, 'messaging');
assert.ok(soft.reason.startsWith('evidence:'));

// Soft must NOT override awareness even if messages somehow present
const awarenessSoft = resolveCampaignPurpose({
  objective: 'OUTCOME_AWARENESS',
  optimizationGoals: [],
  messagesWindow: 5,
});
assert.equal(awarenessSoft.family, 'awareness');

// ── destination_type — THE authoritative click-to-message signal ─────────
// The production mislabel: ODAX engagement shell + LINK_CLICKS optimization,
// but ads open WhatsApp. objective AND optimization_goal both say the wrong
// thing; destination_type is what Ads Manager actually keys messaging off.
const whatsappClicks = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['LINK_CLICKS'],
  destinationTypes: ['WHATSAPP'],
  messagesWindow: 0, // even before any conversation lands
  clicksWindow: 50,
});
assert.equal(whatsappClicks.family, 'messaging');
assert.equal(whatsappClicks.destinationType, 'WHATSAPP');
assert.ok(whatsappClicks.reason.startsWith('destination:'));
assert.ok(whatsappClicks.reasonAr.includes('واتساب'));

// destination beats POST_ENGAGEMENT optimization too
const messengerPostEng = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  destinationTypes: ['MESSENGER'],
  messagesWindow: 30,
  clicksWindow: 30,
});
assert.equal(messengerPostEng.family, 'messaging');

// WEBSITE destination is NOT messaging — classification falls through
const websiteDest = resolveCampaignPurpose({
  objective: 'OUTCOME_TRAFFIC',
  optimizationGoals: ['LINK_CLICKS'],
  destinationTypes: ['WEBSITE'],
  messagesWindow: 0,
  clicksWindow: 200,
});
assert.equal(websiteDest.family, 'traffic');
assert.equal(websiteDest.destinationType, null);

// Evidence rung: engagement-optimized but results ARE conversations
// (destination not synced yet on an old row) → messaging
const evidenceMsgs = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  messagesWindow: 30,
  clicksWindow: 30,
});
assert.equal(evidenceMsgs.family, 'messaging');
assert.ok(evidenceMsgs.reason.startsWith('evidence:'));

// Guard: a genuine boosted post with 2 incidental page messages and lots of
// clicks must STAY engagement — never flip on noise.
const boostedPost = resolveCampaignPurpose({
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  messagesWindow: 2,
  clicksWindow: 500,
});
assert.equal(boostedPost.family, 'engagement');

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
