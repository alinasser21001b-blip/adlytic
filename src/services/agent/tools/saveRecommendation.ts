// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/saveRecommendation.ts   —  T12
//
//  The ONE write tool the AI agent can call. Persists a recommendation to
//  the merchant's Recommendations feed with source=AI_AGENT. The dashboard
//  will render it as an actionable card the merchant can accept or dismiss.
//
//  Guardrails:
//    • Idempotency key = (entityType, entityId, date=today, actionCode) —
//      same key returns the existing row with meta.deduplicated=true.
//      Prevents duplicate persistence on Claude retries.
//    • Nothing changes on Meta. Only writes to our DB.
//    • Requires reasoning + evidence message ids for the audit trail.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.5 T12 + §29 explainable trail
// ════════════════════════════════════════════════════════════════════════

import { EntityType, RecommendationPriority, RecommendationSource, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveEntityIntelligenceForGuard } from '../../entityIntelligence';
import { permitAction } from '../../../analytics/intelligence/hierarchy';

const ALLOWED_ACTION_CODES = [
  'PAUSE',
  'REFRESH_CREATIVE',
  'INCREASE_BUDGET',
  'DECREASE_BUDGET',
  'NARROW_AUDIENCE',
  'EXPAND_AUDIENCE',
  'MONITOR',
  'INVESTIGATE_TRACKING',
  'PAUSE_URGENT',
] as const;
type ActionCode = (typeof ALLOWED_ACTION_CODES)[number];

interface SaveRecommendationArgs {
  entityType: 'ACCOUNT' | 'CAMPAIGN';
  entityId: string;
  text: string;
  actionCode: ActionCode;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  reasoning: string;
  evidenceMessageIds?: string[];
}

interface SaveRecommendationResult {
  recommendationId: string;
  status: 'SUGGESTED_BY_AI';
  deduplicated: boolean;
  entityType: string;
  entityId: string;
  actionCode: string;
  priority: string;
}

export function saveRecommendationHandler(): ToolHandler<SaveRecommendationArgs, SaveRecommendationResult> {
  return {
    name: 'save_recommendation',
    description:
      "Persist a recommendation to the merchant's Recommendations feed with status SUGGESTED_BY_AI. The merchant will see it as an actionable card. Use SPARINGLY — one per turn max — and only when your analysis is backed by tool evidence in the same turn. NEVER call this without at least one read-tool call preceding it in the current turn. Nothing changes on Meta itself; only our DB records the suggestion. Idempotent on (entityType, entityId, today, actionCode) — a repeat call returns the existing row with meta.deduplicated=true instead of inserting a duplicate.",
    schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['ACCOUNT', 'CAMPAIGN'] },
        entityId: { type: 'string', minLength: 1, maxLength: 128 },
        text: {
          type: 'string',
          minLength: 10,
          maxLength: 500,
          description: 'Merchant-facing action text in Arabic.',
        },
        actionCode: {
          type: 'string',
          enum: [...ALLOWED_ACTION_CODES] as unknown as string[],
        },
        priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'NORMAL'] },
        reasoning: {
          type: 'string',
          minLength: 20,
          maxLength: 800,
          description: 'Why the agent chose this. Kept for audit ("لماذا اقترحت هذا؟").',
        },
        evidenceMessageIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 20,
          description: 'AiMessage.id references to TOOL messages that backed this recommendation.',
        },
      },
      required: ['entityType', 'entityId', 'text', 'actionCode', 'priority', 'reasoning'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 0,   // write tool — never cache
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      // Entity-scope check: campaign must belong to a workspace ad account.
      if (args.entityType === 'CAMPAIGN') {
        const campaign = await prisma.campaign.findFirst({
          where: { id: args.entityId, adAccount: { workspaceId } },
          select: { id: true },
        });
        if (!campaign) {
          return fail(
            'NOT_FOUND',
            `Campaign "${args.entityId}" not found in this workspace`,
            { field: 'entityId', retryable: false, suggestion: 'Call list_campaigns first to see valid campaign ids.' },
          );
        }
      } else {
        // ACCOUNT: verify the id belongs to this workspace.
        const account = await prisma.adAccount.findFirst({
          where: { id: args.entityId, workspaceId },
          select: { id: true },
        });
        if (!account) {
          return fail(
            'NOT_FOUND',
            `AdAccount "${args.entityId}" not found in this workspace`,
            { field: 'entityId', retryable: false },
          );
        }
      }

      // Today (UTC-midnight, matches Recommendation.date @db.Date).
      const today = new Date(new Date().toISOString().slice(0, 10));

      const reasoningChain = {
        generatedByModel: null as string | null,   // stamped by loop when available
        keyFacts: [] as string[],
        reasoning: args.reasoning,
        confidenceScore: null as number | null,
        alternativesConsidered: [] as string[],
        evidenceMessageIds: args.evidenceMessageIds ?? [],
        createdBy: 'ai_agent',
      };

      // Determine insert-vs-update DETERMINISTICALLY by checking existence
      // first — Recommendation has no updatedAt column, and a timestamp-since-
      // creation heuristic cannot distinguish "just inserted this call" from
      // "inserted moments ago by a prior call in the same turn," which is
      // exactly the retry scenario this idempotency key exists to catch.
      const compositeKey = {
        entityType_entityId_date_actionCode: {
          entityType: args.entityType === 'ACCOUNT' ? EntityType.ACCOUNT : EntityType.CAMPAIGN,
          entityId: args.entityId,
          date: today,
          actionCode: args.actionCode,
        },
      };
      const existing = await prisma.recommendation.findUnique({ where: compositeKey });
      const deduplicated = existing != null;

      // Ownership guard (P0-02): this tool may create or refresh only rows it
      // owns. A row already exists for this exact action slot but was NOT
      // authored by the AI agent — almost always the deterministic engine
      // (source=V1_RULES) or the V5 shadow system. Overwriting it here would
      // silently replace a different producer's recommendation with no
      // cross-source policy authorizing that; refuse instead.
      if (existing != null && existing.source !== RecommendationSource.AI_AGENT) {
        return fail(
          'FORBIDDEN',
          `A ${existing.source} recommendation already uses action "${args.actionCode}" for this entity today — the AI agent may not overwrite a recommendation it did not author.`,
          {
            field: 'actionCode',
            retryable: false,
            suggestion: 'Choose a different actionCode, or call list_campaigns / get_campaign_details to see the existing recommendation instead of replacing it.',
          },
        );
      }

      // Diagnosis guard: this is the same permitAction()/forbiddenActions
      // check getDashboard.ts already applies to priorityAction/the funnel's
      // own recommendation — an LLM-authored action code otherwise reached
      // the Recommendations feed with no check that it doesn't contradict
      // this entity's own current funnel diagnosis (e.g. REFRESH_CREATIVE
      // for an entity the funnel just measured as POST_CLICK, where the
      // creative was verified healthy). No verdict for the entity (unmeasured,
      // mixed-purpose account, ADSET/AD) means nothing to check against —
      // the write proceeds rather than blocking on an absent, not a failing, check.
      const entityIntelligence = await resolveEntityIntelligenceForGuard(
        prisma,
        args.entityType === 'ACCOUNT' ? EntityType.ACCOUNT : EntityType.CAMPAIGN,
        args.entityId,
      ).catch(() => null);
      if (entityIntelligence) {
        const permit = permitAction(args.actionCode, entityIntelligence);
        if (!permit.allowed) {
          return fail(
            'FORBIDDEN',
            permit.reason ?? `"${args.actionCode}" contradicts this entity's current funnel diagnosis.`,
            {
              field: 'actionCode',
              retryable: false,
              suggestion: 'Re-check get_campaign_details / the funnel diagnosis before choosing an action — the upstream stages were measured healthy, so a creative- or audience-facing action would misdirect the merchant.',
            },
          );
        }
      }

      const rec = await prisma.recommendation.upsert({
        where: compositeKey,
        create: {
          entityType: args.entityType === 'ACCOUNT' ? EntityType.ACCOUNT : EntityType.CAMPAIGN,
          entityId: args.entityId,
          date: today,
          priority: mapPriority(args.priority),
          actionCode: args.actionCode,
          sourceIssuesJson: { source: 'ai_agent', text: args.text },
          detailsJson: { text: args.text },
          source: RecommendationSource.AI_AGENT,
          reasoningChainJson: reasoningChain,
        },
        update: {
          // Only refresh the human-facing text + reasoning; leave the rest.
          detailsJson: { text: args.text },
          reasoningChainJson: reasoningChain,
          priority: mapPriority(args.priority),
        },
      });

      return ok<SaveRecommendationResult>(
        {
          recommendationId: rec.id,
          status: 'SUGGESTED_BY_AI',
          deduplicated,
          entityType: rec.entityType,
          entityId: rec.entityId,
          actionCode: rec.actionCode,
          priority: rec.priority,
        },
        {
          sourceTable: 'recommendations',
          latestRowDate: today.toISOString().slice(0, 10),
          stalenessMinutes: 0,
        },
      );
    },
  } satisfies ToolHandler<SaveRecommendationArgs, SaveRecommendationResult>;
}

function mapPriority(p: 'CRITICAL' | 'HIGH' | 'NORMAL'): RecommendationPriority {
  // Tool exposes CRITICAL/HIGH/NORMAL to Claude (matches design doc); DB enum
  // has LOW/MEDIUM/HIGH/CRITICAL. Map NORMAL → MEDIUM.
  if (p === 'NORMAL') return RecommendationPriority.MEDIUM;
  return p as RecommendationPriority;
}

export type { SaveRecommendationArgs, SaveRecommendationResult };
void (undefined as unknown as PrismaClient | undefined);
