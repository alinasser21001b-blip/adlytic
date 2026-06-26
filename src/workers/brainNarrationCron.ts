// ════════════════════════════════════════════════════════════════════════
//  src/workers/brainNarrationCron.ts
//
//  Background narration filler for V6 Brain V2.
//
//  Reads CampaignBrainSnapshot rows whose `narrationJson` is empty (or stale
//  for CRITICAL/HIGH actions), calls Claude CMO (Layer 7), and writes the
//  Arabic narration back into the snapshot row.
//
//  Strict guardrails (signed off by user 2026-06-22):
//
//    1. Targeted fetching: skip rows already narrated unless they are
//       CRITICAL/HIGH and older than STALE_HOURS_FOR_REGEN.
//
//    2. Rate limiting: sequential processing with DELAY_MS_BETWEEN_LLM_CALLS
//       between LLM calls to stay under Anthropic's RPM ceiling.
//
//    3. Per-campaign fault isolation: every snapshot is wrapped in try/catch.
//       On failure we still write a Sentinel narration + bump
//       `narrationGeneratedAt` so the same broken row never re-enters the queue
//       (until stale-invalidation lets it retry deliberately, hours later).
//
//    4. Defensive payload casting: snapshot.payload is a Prisma Json blob.
//       `parseSnapshotPayload` validates it into the BrainTickResult shape
//       Claude CMO requires. Shape drift → caught by the per-row try/catch
//       and written as a Sentinel.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, Prisma } from '@prisma/client';
import { BrainTickResult } from '../engine/AdlyticBrain';
import { generateMerchantNarration, CmoNarration } from '../services/ClaudeCMO';
import { askClaudeWithSystem } from '../services/claudeClient';
import { buildCmoHistoricalContext } from '../services/getCampaignHistory';
import { findReusableLearningNarration, isLearningPhaseNarration, isLearningPhaseSnapshot } from '../lib/cmoInsightDedupe';

// ── Tuning dials ────────────────────────────────────────────────────────
export const NARRATION_CRON_CONFIG = {
  /** Max snapshots processed in one cron tick. Bounds memory + run time. */
  BATCH_LIMIT: 20,
  /** Wait between sequential LLM calls. ~50 RPM ceiling, well under tier-1. */
  DELAY_MS_BETWEEN_LLM_CALLS: 1200,
  /** Re-narrate CRITICAL/HIGH rows older than this many hours. */
  STALE_HOURS_FOR_REGEN: 12,
} as const;

const PRIORITIES_ELIGIBLE_FOR_REGEN: ReadonlySet<string> = new Set(['CRITICAL', 'HIGH']);

export interface NarrationCronResult {
  ok: boolean;
  durationMs: number;
  considered: number;     // rows selected by the targeted query
  narrated: number;       // successful LLM-backed narrations written
  reused: number;         // learning-phase rows that reused an existing narration
  sentinels: number;      // failed rows that got a fallback narration
  error?: string;         // only set when ok === false (catastrophic loop failure)
}

/**
 * One cron tick.
 *
 * Designed to be invoked by an external scheduler (Railway Cron) every N
 * minutes. Each call processes up to BATCH_LIMIT rows then exits cleanly —
 * no internal loop, no daemon state.
 */
export async function runBrainNarrationCron(
  prisma: PrismaClient,
  opts?: { now?: Date },
): Promise<NarrationCronResult> {
  const start = Date.now();
  const now = opts?.now ?? new Date();
  const tag = '[narration-cron]';

  try {
    // ── 1. Targeted fetch: NULL narration OR (HIGH/CRITICAL AND stale). ──
    const staleCutoff = new Date(now.getTime() - NARRATION_CRON_CONFIG.STALE_HOURS_FOR_REGEN * 3600_000);

    // BUG FIX 2026-06-24: BrainPersistence.persistBrainBatch creates rows
    // without setting `narrationJson`, so the column defaults to DATABASE
    // NULL. The previous filter `equals: Prisma.JsonNull` only matches rows
    // whose stored JSON value is the literal `null` — it does NOT match DB
    // NULL. Net effect: brand-new (cold-start) snapshots were never picked
    // up, and the cron logged "no rows pending narration — exiting" forever.
    // `Prisma.AnyNull` matches BOTH DB NULL and JSON null, covering newly
    // created rows and any legacy rows that may have been explicitly nulled.
    const rows = await prisma.campaignBrainSnapshot.findMany({
      where: {
        OR: [
          { narrationJson: { equals: Prisma.AnyNull } },
          {
            priority: { in: ['CRITICAL', 'HIGH'] },
            narrationGeneratedAt: { lt: staleCutoff },
          },
        ],
      },
      orderBy: [
        // Critical first, then by tickDate desc so today's noise gets narrated before yesterday's.
        { priority: 'asc' },     // alphabetical: CRITICAL < HIGH < NORMAL
        { tickDate: 'desc' },
      ],
      take: NARRATION_CRON_CONFIG.BATCH_LIMIT,
    });

    if (rows.length === 0) {
      console.log(`${tag} no rows pending narration — exiting`);
      return {
        ok: true,
        durationMs: Date.now() - start,
        considered: 0,
        narrated: 0,
        reused: 0,
        sentinels: 0,
      };
    }

    console.log(`${tag} ${rows.length} rows pending narration`);

    // ── 2. Sequential LLM calls with rate-limit-friendly delay. ──
    let narrated = 0;
    let reused = 0;
    let sentinels = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const label = `${row.externalCampaignId}@${row.tickDate.toISOString().slice(0, 10)}`;

      try {
        // Stale-regen queue can re-select CRITICAL/HIGH rows that already have a
        // learning-phase narration. Skip LLM until the decision action changes.
        if (
          row.narrationJson != null &&
          isLearningPhaseSnapshot(row) &&
          isLearningPhaseNarration(row.narrationJson)
        ) {
          await prisma.campaignBrainSnapshot.update({
            where: { id: row.id },
            data: { narrationGeneratedAt: new Date() },
          });
          reused++;
          console.log(`${tag} ${label} learning-phase narration held (stale-regen skip)`);
          if (i < rows.length - 1) {
            await delay(NARRATION_CRON_CONFIG.DELAY_MS_BETWEEN_LLM_CALLS);
          }
          continue;
        }

        const reusable = await findReusableLearningNarration(prisma, row);
        if (reusable) {
          await prisma.campaignBrainSnapshot.update({
            where: { id: row.id },
            data: {
              narrationJson: reusable.narrationJson,
              narrationGeneratedAt: reusable.narrationGeneratedAt ?? new Date(),
            },
          });
          reused++;
          console.log(`${tag} ${label} learning-phase narration reused (dedupe)`);
          if (i < rows.length - 1) {
            await delay(NARRATION_CRON_CONFIG.DELAY_MS_BETWEEN_LLM_CALLS);
          }
          continue;
        }

        const brainResult = parseSnapshotPayload(row.payload, row.externalCampaignId);
        const campaign = await prisma.campaign.findUnique({
          where: { id: row.campaignId },
          select: { objective: true },
        });
        const history = await buildCmoHistoricalContext(
          prisma,
          row.workspaceId,
          campaign?.objective,
        );
        const narration = await generateMerchantNarration(
          brainResult,
          askClaudeWithSystem,
          history,
        );

        await prisma.campaignBrainSnapshot.update({
          where: { id: row.id },
          data: {
            narrationJson: serializeNarration(narration),
            narrationGeneratedAt: new Date(),
          },
        });
        narrated++;
      } catch (e) {
        // Guardrail #3: Sentinel write. Bump narrationGeneratedAt so the row
        // exits the "null narration" queue immediately. It will become eligible
        // for retry again only via STALE_HOURS_FOR_REGEN (CRITICAL/HIGH only).
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${tag} ${label} narration failed → ${msg} (writing sentinel)`);

        try {
          await prisma.campaignBrainSnapshot.update({
            where: { id: row.id },
            data: {
              narrationJson: buildSentinelNarration(row.action),
              narrationGeneratedAt: new Date(),
            },
          });
          sentinels++;
        } catch (writeErr) {
          // DB write itself failed — don't crash the whole batch, just log.
          const w = writeErr instanceof Error ? writeErr.message : String(writeErr);
          console.error(`${tag} ${label} sentinel write also failed → ${w}`);
        }
      }

      // Respect rate limits — skip the wait after the last row.
      if (i < rows.length - 1) {
        await delay(NARRATION_CRON_CONFIG.DELAY_MS_BETWEEN_LLM_CALLS);
      }
    }

    const durationMs = Date.now() - start;
    console.log(`${tag} DONE — narrated=${narrated} reused=${reused} sentinels=${sentinels} (${durationMs}ms)`);

    return {
      ok: true,
      durationMs,
      considered: rows.length,
      narrated,
      reused,
      sentinels,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`${tag} CRON FAILED — ${error}`);
    return {
      ok: false,
      durationMs: Date.now() - start,
      considered: 0,
      narrated: 0,
      reused: 0,
      sentinels: 0,
      error,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

// Suppress the "unused" warning: PRIORITIES_ELIGIBLE_FOR_REGEN documents the
// stale-eligible set for readers; the query uses the literal `in` array for
// Prisma type-narrowing reasons.
void PRIORITIES_ELIGIBLE_FOR_REGEN;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Defensive casting from Prisma Json blob → BrainTickResult.
 *
 * The persisted payload was originally a serialized BrainTickResult
 * (see `BrainPersistence.persistBrainBatch` — `payload: result`). This guard
 * checks the minimum shape that ClaudeCMO touches and throws loudly otherwise
 * so the per-row try/catch can write a sentinel.
 */
function parseSnapshotPayload(payload: unknown, externalCampaignId: string): BrainTickResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`payload is not an object (${typeof payload})`);
  }
  const p = payload as Record<string, unknown>;

  if (!p['decision'] || typeof p['decision'] !== 'object') {
    throw new Error('payload.decision missing or not an object');
  }
  if (!p['physics'] || typeof p['physics'] !== 'object') {
    throw new Error('payload.physics missing or not an object');
  }
  if (!p['confidence'] || typeof p['confidence'] !== 'object') {
    throw new Error('payload.confidence missing or not an object');
  }
  if (!p['pattern'] || typeof p['pattern'] !== 'object') {
    throw new Error('payload.pattern missing or not an object');
  }
  if (!p['recovery'] || typeof p['recovery'] !== 'object') {
    throw new Error('payload.recovery missing or not an object');
  }

  // Some payloads predate the Brain V2 contract guaranteeing `campaignId` is
  // the EXTERNAL id; coerce defensively to keep ClaudeCMO's output consistent
  // with what the dashboard already shows.
  const out = payload as BrainTickResult;
  if (!out.campaignId) {
    return { ...out, campaignId: externalCampaignId };
  }
  return out;
}

/**
 * Convert a CmoNarration into the JSONB shape the dashboard reader
 * (`getDashboard.readNarration`) expects.
 */
function serializeNarration(n: CmoNarration): Prisma.InputJsonValue {
  const obj: Record<string, string> = {
    arabicTitle: n.arabicTitle,
    arabicNarration: n.arabicNarration,
  };
  if (n.creativeDirective) {
    obj['creativeDirective'] = n.creativeDirective;
  }
  return obj;
}

/**
 * Failure sentinel — written to narrationJson when Claude CMO throws or the
 * payload fails shape validation. Same JSONB schema as a real narration so the
 * dashboard reader works uniformly. Arabic copy mirrors ClaudeCMO's own
 * production-safe fallback.
 */
function buildSentinelNarration(action: string): Prisma.InputJsonValue {
  return {
    arabicTitle: 'إشعار استراتيجي آلي',
    arabicNarration: `قام النظام الآلي باتخاذ إجراء (${action}) استناداً إلى أداء المزاد ومؤشرات الثقة الحالية. تعذّر توليد السرد التفصيلي هذه المرة — سيُعاد المحاولة لاحقاً.`,
  };
}
