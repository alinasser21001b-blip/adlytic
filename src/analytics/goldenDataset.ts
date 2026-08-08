// ════════════════════════════════════════════════════════════════════════
//  src/analytics/goldenDataset.ts — THE SEMANTIC GOLDEN DATASET
//
//  A frozen set of campaign shapes with their CORRECT classification.
//
//  Rule: a campaign in this file may never silently change meaning. If a code
//  change flips one of these classifications, the regression suite fails and
//  the author must either fix the code or justify the reclassification by
//  editing this file deliberately — which shows up in review as a semantic
//  change, not as an invisible side effect of a refactor.
//
//  Every case is drawn from a real production shape or a real near-miss.
//  Add a case whenever a new mislabel is discovered in the wild; never delete
//  one without recording why in `note`.
// ════════════════════════════════════════════════════════════════════════

import type { CampaignPurposeInput } from '../lib/campaignPurpose';
import type { ObjectiveKpiFamily } from '../lib/objectiveKpis';

export interface GoldenCase {
  /** Stable id — referenced by test output. Never renumber. */
  id: string;
  /** What this shape represents in the real world. */
  description: string;
  input: CampaignPurposeInput;
  expectedFamily: ObjectiveKpiFamily;
  /**
   * Which rung of the resolution ladder must decide this case. Asserting the
   * REASON as well as the answer catches a classifier that gets the right
   * family via the wrong evidence — which would silently break the next case.
   */
  expectedReasonPrefix: 'destination' | 'optimization_goal' | 'optimization_goal_override' | 'objective' | 'evidence';
  note?: string;
}

/**
 * NOTE ON CORROBORATION (observed while building this dataset).
 *
 * When the campaign objective and the ad-set optimization goal AGREE, the
 * resolver records only `objective:<family>` — the corroborating goal leaves no
 * trace. Classification confidence therefore reads INFERRED for a case that two
 * independent signals actually confirm.
 *
 * This under-claims confidence, which is the safe direction, so it is left
 * as-is rather than changed here: `campaignPurpose` is canonical (architecture
 * rule 1) and must not be altered as a side effect of writing tests. Recorded
 * for the P2 Result Semantics review, where a `corroborated: boolean` on the
 * purpose result would resolve it cleanly.
 */
export const GOLDEN_CASES: readonly GoldenCase[] = [

  // ── The production bug this whole workstream exists for ────────────────
  {
    id: 'G01',
    description: 'Click-to-WhatsApp shipped under an ODAX engagement shell, ad sets optimizing POST_ENGAGEMENT',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['POST_ENGAGEMENT'],
      destinationTypes: ['WHATSAPP'],
      messagesWindow: 41,
      clicksWindow: 260,
    },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'destination',
    note: 'The exact shape that displayed as "تفاعل" in production. Both the objective AND the optimization goal say engagement; only the destination tells the truth.',
  },
  {
    id: 'G02',
    description: 'Engagement objective, ad sets optimizing CONVERSATIONS, destination not yet synced',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['CONVERSATIONS'],
      messagesWindow: 13,
    },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'optimization_goal',
    note: 'Covers accounts synced before destination_type existed.',
  },
  {
    id: 'G03',
    description: 'Messenger destination on a traffic objective',
    input: {
      objective: 'OUTCOME_TRAFFIC',
      optimizationGoals: ['LINK_CLICKS'],
      destinationTypes: ['MESSENGER'],
      messagesWindow: 22,
      clicksWindow: 90,
    },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'destination',
  },
  {
    id: 'G04',
    description: 'Engagement shell whose destination and goals are unknown but whose results are clearly conversations',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['POST_ENGAGEMENT'],
      messagesWindow: 30,
      clicksWindow: 100,
    },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'evidence',
    note: 'The guarded evidence rung: 30 messages against 100 clicks clears both thresholds.',
  },

  // ── False positives the classifier must NOT produce ────────────────────
  {
    id: 'G10',
    description: 'Genuine boosted post with two incidental page messages',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['POST_ENGAGEMENT'],
      destinationTypes: ['WEBSITE'],
      messagesWindow: 2,
      clicksWindow: 900,
    },
    expectedFamily: 'engagement',
    expectedReasonPrefix: 'optimization_goal',
    note: 'MUST NOT flip to messaging. Guard: messages must be >= 3 AND >= 20% of clicks. The explicit POST_ENGAGEMENT goal decides it, which is why the reason is the optimization-goal rung rather than the objective rung.',
  },
  {
    id: 'G11',
    description: 'Reach campaign that happens to attract many page messages',
    input: {
      objective: 'OUTCOME_AWARENESS',
      optimizationGoals: ['REACH'],
      messagesWindow: 500,
      clicksWindow: 10,
    },
    expectedFamily: 'awareness',
    expectedReasonPrefix: 'objective',
    note: 'A clear awareness optimization must never be overridden by message volume. Objective and optimization goal AGREE here, and the resolver records only the objective rung in that case — see the note on corroboration below.',
  },
  {
    id: 'G12',
    description: 'Sales campaign with incidental messages',
    input: {
      objective: 'OUTCOME_SALES',
      optimizationGoals: ['OFFSITE_CONVERSIONS'],
      destinationTypes: ['WEBSITE'],
      messagesWindow: 40,
      clicksWindow: 120,
    },
    expectedFamily: 'sales',
    expectedReasonPrefix: 'objective',
  },
  {
    id: 'G13',
    description: 'Engagement campaign with a handful of clicks and zero messages',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['POST_ENGAGEMENT'],
      messagesWindow: 0,
      clicksWindow: 40,
    },
    expectedFamily: 'engagement',
    expectedReasonPrefix: 'optimization_goal',
  },

  // ── Straightforward objectives (guard against refactor drift) ──────────
  {
    id: 'G20',
    description: 'Legacy MESSAGES objective',
    input: { objective: 'MESSAGES', optimizationGoals: ['CONVERSATIONS'] },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'optimization_goal',
  },
  {
    id: 'G21',
    description: 'Plain traffic campaign',
    input: { objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['LINK_CLICKS'] },
    expectedFamily: 'traffic',
    expectedReasonPrefix: 'objective',
    note: 'Objective and optimization goal agree; only the objective rung is recorded.',
  },
  {
    id: 'G22',
    description: 'Plain lead-generation campaign',
    input: { objective: 'OUTCOME_LEADS', optimizationGoals: ['LEAD_GENERATION'] },
    expectedFamily: 'leads',
    expectedReasonPrefix: 'objective',
  },
  {
    id: 'G23',
    description: 'Plain awareness campaign',
    input: { objective: 'OUTCOME_AWARENESS', optimizationGoals: ['REACH'] },
    expectedFamily: 'awareness',
    expectedReasonPrefix: 'objective',
  },
  {
    id: 'G24',
    description: 'App promotion',
    input: { objective: 'OUTCOME_APP_PROMOTION', optimizationGoals: ['APP_INSTALLS'] },
    expectedFamily: 'app',
    expectedReasonPrefix: 'objective',
  },

  // ── Disagreement between objective and optimization goal ───────────────
  {
    id: 'G30',
    description: 'Traffic objective whose ad sets actually optimize purchases',
    input: { objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['OFFSITE_CONVERSIONS'] },
    expectedFamily: 'sales',
    expectedReasonPrefix: 'optimization_goal_override',
    note: 'Delivery behaviour outranks the declared objective when they clearly disagree.',
  },
  {
    id: 'G31',
    description: 'Mixed ad sets — one conversations, one link clicks',
    input: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoals: ['LINK_CLICKS', 'CONVERSATIONS'],
      messagesWindow: 18,
      clicksWindow: 140,
    },
    expectedFamily: 'messaging',
    expectedReasonPrefix: 'optimization_goal',
    note: 'Any conversations-optimized ad set makes the campaign a messaging campaign.',
  },
] as const;

/**
 * Campaign shapes whose family genuinely CANNOT be determined. These must
 * resolve to null / 'unknown' — never to a plausible-looking guess.
 */
export const GOLDEN_UNKNOWN_OBJECTIVES: readonly string[] = [
  '',
  'SOME_FUTURE_META_OBJECTIVE',
  'OUTCOME_SOMETHING_NEW',
];
