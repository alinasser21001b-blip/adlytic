// ════════════════════════════════════════════════════════════════════════
//  src/services/periodInsights.ts
//
//  META PERIOD FACTS — the values that cannot be reconstructed from daily
//  rows, and the rule that we would rather say UNKNOWN than invent one.
//
//  ── Why this exists ───────────────────────────────────────────────────
//
//  Reach is not additive. Meta de-duplicates people inside a requested
//  time_range and does not publish the cross-day overlap, so from daily rows
//  the period value is genuinely unknowable: max(daily) is a lower bound,
//  sum(daily) an upper one, and the truth sits somewhere between with no way
//  to locate it. Frequency inherits the problem exactly, being impressions ÷
//  reach over the same span.
//
//  The old code answered anyway — reach as max(daily), frequency as the flat
//  mean of the daily frequencies. The second is the more damaging: a person
//  reached on five days counts once in period reach but washes out of a daily
//  mean, so the mean sits well below the real period frequency, and it is fed
//  straight into ABSOLUTE thresholds (FREQUENCY_WATCH 3.0, FREQUENCY_SATURATED
//  4.0). Audience fatigue was therefore under-detected by construction.
//
//  ── The rule ──────────────────────────────────────────────────────────
//
//  Ask Meta for the exact entity at the exact span, store what it says, and
//  when that is not available report UNKNOWN. Never max(daily reach), never
//  sum(daily reach), never average(daily frequency), never
//  impressions ÷ max(daily reach). A fabricated period metric is worse than
//  an absent one, because absence is visible and a plausible number is not.
//
//  ── Ownership ─────────────────────────────────────────────────────────
//
//  The SYNC writes (one canonical writer, the same place that owns DailyStat).
//  The analytics window builder READS. Nothing else does either. The Brain
//  Observatory reaches these facts only through the database — it is asserted
//  to hold no Meta client and to make no network call, so the read side here
//  must stay Prisma-only.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { isoDay } from '../lib/analysisWindow';

/** Provenance marker. The only value written today. */
export const META_PERIOD_FACT = 'META_PERIOD_FACT';

/**
 * One span's Meta-reported truth.
 *
 * `null` on a field means Meta did not give a trustworthy value for it —
 * the caller reports UNKNOWN and substitutes nothing.
 */
export interface PeriodFact {
  reach: number | null;
  frequency: number | null;
  impressions: number | null;
  provenance: string;
  fetchedAt: Date;
}

/** A Meta insights row, narrowed to the fields a period request asks for. */
export interface RawPeriodRow {
  reach?: string | number | null;
  frequency?: string | number | null;
  impressions?: string | number | null;
}

/**
 * Meta returns numerics as strings. Anything that is not a finite,
 * non-negative number is discarded rather than coerced — `NaN`, `null`,
 * `undefined` and `""` all mean "no trustworthy value", which is UNKNOWN.
 */
function numeric(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Normalize one raw Meta period row.
 *
 * Frequency is taken ONLY as Meta reported it. It is deliberately NOT derived
 * from impressions ÷ reach even though both are present in the same row and
 * Meta's definition is believed to be exactly that: proving the two coincide
 * needs Meta's own documentation, which cannot be read from this environment,
 * and an unproven derivation is precisely the class of invention this module
 * exists to stop. The inputs are stored so a future audit can close it.
 */
export function normalizePeriodRow(row: RawPeriodRow | undefined | null): Omit<PeriodFact, 'fetchedAt'> {
  return {
    reach: numeric(row?.reach),
    frequency: numeric(row?.frequency),
    impressions: numeric(row?.impressions),
    provenance: META_PERIOD_FACT,
  };
}

/**
 * Read the stored fact for an EXACT (entity, span) tuple.
 *
 * Exact is the whole point. A row for a neighbouring span describes different
 * people over different days; accepting it would reintroduce a fabricated
 * period metric through the back door. A miss returns null ⇒ UNKNOWN.
 *
 * Never throws: a missing table (validation service deployed ahead of the
 * migration) or any query failure degrades to UNKNOWN, which is the same
 * answer as "Meta did not tell us" and is safe by construction.
 */
export async function readPeriodFact(
  prisma: PrismaClient,
  entityType: EntityType,
  entityId: string,
  since: Date,
  until: Date,
): Promise<PeriodFact | null> {
  try {
    const row = await prisma.periodInsight.findUnique({
      where: {
        entityType_entityId_since_until: { entityType, entityId, since, until },
      },
      select: { reach: true, frequency: true, impressions: true, provenance: true, fetchedAt: true },
    });
    if (!row) return null;
    return {
      reach: row.reach === null ? null : Number(row.reach),
      frequency: row.frequency,
      impressions: row.impressions === null ? null : Number(row.impressions),
      provenance: row.provenance,
      fetchedAt: row.fetchedAt,
    };
  } catch {
    // Absence of an answer, not an error worth failing analysis over.
    return null;
  }
}

/**
 * Persist one span's fact. Idempotent on (entityType, entityId, since, until),
 * so a re-sync of the same window converges instead of duplicating.
 */
export async function writePeriodFact(
  prisma: PrismaClient,
  entityType: EntityType,
  entityId: string,
  since: Date,
  until: Date,
  fact: Omit<PeriodFact, 'fetchedAt'>,
): Promise<void> {
  const data = {
    reach: fact.reach === null ? null : BigInt(Math.round(fact.reach)),
    frequency: fact.frequency,
    impressions: fact.impressions === null ? null : BigInt(Math.round(fact.impressions)),
    provenance: fact.provenance,
    fetchedAt: new Date(),
  };
  await prisma.periodInsight.upsert({
    where: { entityType_entityId_since_until: { entityType, entityId, since, until } },
    create: { entityType, entityId, since, until, ...data },
    update: data,
  });
}

/** The span a Meta `time_range` needs, from the window bounds. */
export function timeRangeFor(since: Date, until: Date): { since: string; until: string } {
  return { since: isoDay(since), until: isoDay(until) };
}
