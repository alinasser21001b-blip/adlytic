// ════════════════════════════════════════════════════════════════════════
//  src/services/BrainPersistence.ts
//
//  Layer 6 — Persistence for AdlyticBrain output.
//
//  This is the ONLY module allowed to write Brain decisions to the database.
//  Workers and API routes that compute brain results call persistBrainBatch
//  once per tick and hand off here. Idempotent on (campaignId, tickDate) —
//  re-running the worker the same day updates the existing snapshot rather
//  than creating duplicates.
//
//  Read-side queries (Dashboard, Claude CMO) read from the indexed surface
//  columns directly, or unpack the `payload` JSON when the full decision
//  tree is needed. Nothing here is exposed to the UI; presentation belongs
//  to getDashboard.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import type { BrainTickResult } from '../engine/AdlyticBrain';

/**
 * Input for one campaign snapshot.
 * Carries both the Brain's analytical output and the DB identity keys
 * the orchestrator-layer (engine) doesn't know about.
 */
export interface BrainSnapshotInput {
  internalCampaignId: string;       // Campaign.id
  externalCampaignId: string;       // Meta's campaign id (denormalized for fast UI)
  result: BrainTickResult;
}

export interface PersistBatchSummary {
  upserted: number;
  tickDate: string;                 // ISO date string (YYYY-MM-DD) actually written
}

/**
 * Strip time portion — daily-tick granularity per Layer 6 design.
 * Uses UTC midnight so all environments resolve to the same calendar day.
 */
function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Upsert a batch of Brain snapshots.
 * Idempotent on (campaignId, tickDate): re-running the same worker the same
 * day updates the existing row in place.
 *
 * Errors are NOT swallowed. The caller decides whether to retry or alert.
 */
export async function persistBrainBatch(
  prisma: PrismaClient,
  workspaceId: string,
  inputs: BrainSnapshotInput[],
  tickDate: Date = new Date()
): Promise<PersistBatchSummary> {

  const day = toUtcMidnight(tickDate);

  let upserted = 0;
  for (const input of inputs) {
    const { result, internalCampaignId, externalCampaignId } = input;

    const surface = {
      action: result.decision.action,
      priority: result.decision.priority,
      patternSignature: result.pattern.signature,
      finalScore: result.physics.finalScore,
    };

    await prisma.campaignBrainSnapshot.upsert({
      where: {
        campaignId_tickDate: {
          campaignId: internalCampaignId,
          tickDate: day,
        },
      },
      create: {
        workspaceId,
        campaignId: internalCampaignId,
        externalCampaignId,
        tickDate: day,
        ...surface,
        payload: result as unknown as object,    // Prisma Json column
      },
      update: {
        // Surface columns refresh; updatedAt auto-bumps.
        externalCampaignId,                       // tolerate the (rare) Meta id reassign
        ...surface,
        payload: result as unknown as object,
      },
    });

    upserted++;
  }

  return {
    upserted,
    tickDate: day.toISOString().slice(0, 10),
  };
}
