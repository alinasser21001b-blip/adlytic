// ════════════════════════════════════════════════════════════════════════
//  src/lib/iqdRepair.ts — the ONLY code that rewrites stored IQD money.
//
//  Background. IQD has no practical sub-unit, so its canonical minor factor is
//  1; ad_accounts.currency_minor_factor defaults to 100. An IQD account that
//  kept the default could have been synced at ×100, so daily_stats.spend (and
//  cpc / cpm / cost_per_message / revenue_minor) are 100× too large.
//
//  This module USED to run on GET requests, and it was reproduced rewriting
//  CORRECT rows 100× too small, double-dividing under concurrent requests, and
//  committing its "repaired" flag before the repair so a failed repair never
//  retried (scripts/repro/heal_on_get.ts, delivery/core/HEAL_ON_GET.md).
//  Reads no longer write. What remains, and what it guarantees:
//
//   · EVIDENCE, PER ROW. A row is rewritten only when raw Meta spend for that
//     entity and date proves it is exactly ×100 (judgeSpendScale). No
//     heuristic on magnitude or CPM. A row with no evidence, conflicting
//     evidence, or a ratio that matches neither scale is LEFT INTACT and counted.
//   · ONE TRANSACTION. Row rewrites and the factor flag commit together or not
//     at all. The flag is set last, so it can never claim a repair that did not
//     happen.
//   · CONCURRENCY. A per-account advisory lock serialises repairs; every row
//     update is additionally conditional on the spend it was judged on
//     (optimistic check), so a sync that rewrites the same row in between wins
//     and the repair skips it instead of dividing a correct value.
//   · SCOPE. One account. Never other tenants.
//
//  Callers allowed to write: the sync workers (reconcileAccountScaleForSync)
//  and the explicit POST /api/workspaces/:id/repair-iqd. A static test
//  (test_iqd_no_get_writes.ts) fails the build if a GET handler reaches this
//  module.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type Prisma, type PrismaClient } from "@prisma/client";
import { currencyMinorFactorFor } from "./currency";

/** Over-scale is exactly ×100 (the schema default factor applied to an IQD major). */
const OVERSCALE_DIVISOR = 100;
const OVERSCALE_TOLERANCE = 0.02;
/** Only the entity levels the old repair covered. Ad-set / ad rows are NOT repaired. */
const COVERED_ENTITY_TYPES = [EntityType.ACCOUNT, EntityType.CAMPAIGN] as const;
const ID_CHUNK = 500;
const TX_TIMEOUT_MS = 60_000;
const TX_MAX_WAIT_MS = 10_000;

type Reader = Pick<PrismaClient, "rawInsight" | "dailyStat" | "campaign">;

export type ScaleVerdict = "OVERSCALED" | "VERIFIED" | "UNVERIFIABLE";

/** Raw Meta `spend` (account-currency MAJOR units) from a raw_insights payload, or null. */
export function parseMetaSpend(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = (rawJson as Record<string, unknown>)["spend"];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Pure. For an IQD account (canonical factor 1) is the stored minor spend what
 * raw Meta says (VERIFIED), exactly 100× that (OVERSCALED), or neither
 * (UNVERIFIABLE)? Missing or invalid evidence is UNVERIFIABLE — never a guess.
 */
export function judgeSpendScale(storedMinor: number, rawMetaSpendMajor: number | null): ScaleVerdict {
  if (rawMetaSpendMajor == null || !Number.isFinite(rawMetaSpendMajor) || rawMetaSpendMajor < 0) return "UNVERIFIABLE";
  if (!Number.isFinite(storedMinor) || storedMinor < 0) return "UNVERIFIABLE";
  const expected = Math.round(rawMetaSpendMajor); // IQD factor is 1
  if (Math.abs(storedMinor - expected) <= 1) return "VERIFIED";
  if (rawMetaSpendMajor > 0 && Math.abs(storedMinor / (rawMetaSpendMajor * OVERSCALE_DIVISOR) - 1) < OVERSCALE_TOLERANCE) {
    return "OVERSCALED";
  }
  return "UNVERIFIABLE";
}

export interface ScaleEvidenceRow {
  statId: string;
  entityType: EntityType;
  entityId: string;
  date: Date;
  storedSpend: bigint;
  cpc: number | null;
  cpm: number | null;
  costPerMessage: number | null;
  revenueMinor: bigint;
  verdict: ScaleVerdict;
}

export interface ScaleEvidence {
  overscaled: ScaleEvidenceRow[];
  verified: number;
  /** Rows inside the evidence range with no usable raw spend, conflicting raw spends, or a ratio matching neither scale. */
  unverifiable: number;
  /** (entity, date) keys whose raw rows disagree with each other — treated as no evidence. */
  conflictingRawKeys: number;
  entitiesChecked: number;
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * READ-ONLY. Judge the stored account- and campaign-level spend of ONE account
 * against raw_insights. Used by the repair (inside its transaction) and by the
 * integrity monitor (outside any transaction), so both apply the same rule.
 * `sinceDate` bounds the evidence window (inclusive).
 */
export async function collectScaleEvidence(
  db: Reader,
  accountId: string,
  opts: { sinceDate?: Date } = {},
): Promise<ScaleEvidence> {
  const campaigns = await db.campaign.findMany({ where: { adAccountId: accountId }, select: { id: true } });
  const idsByType: Record<(typeof COVERED_ENTITY_TYPES)[number], string[]> = {
    [EntityType.ACCOUNT]: [accountId],
    [EntityType.CAMPAIGN]: campaigns.map((c) => c.id),
  };

  const out: ScaleEvidence = { overscaled: [], verified: 0, unverifiable: 0, conflictingRawKeys: 0, entitiesChecked: 0 };

  for (const entityType of COVERED_ENTITY_TYPES) {
    const ids = idsByType[entityType];
    out.entitiesChecked += ids.length;
    for (const idChunk of chunk(ids, ID_CHUNK)) {
      if (idChunk.length === 0) continue;
      const dateFilter = opts.sinceDate ? { date: { gte: opts.sinceDate } } : {};
      const raws = await db.rawInsight.findMany({
        where: { entityType, entityId: { in: idChunk }, ...dateFilter },
        select: { entityId: true, date: true, rawJson: true },
      });
      if (raws.length === 0) continue;

      // (entity, date) -> every raw spend seen. Disagreement is NOT resolved by
      // guessing which fetch is newer; it is treated as no evidence.
      const spendsByKey = new Map<string, number[]>();
      let minDate = raws[0]!.date, maxDate = raws[0]!.date;
      for (const r of raws) {
        const s = parseMetaSpend(r.rawJson);
        const key = `${r.entityId}|${dayKey(r.date)}`;
        const list = spendsByKey.get(key) ?? [];
        if (s != null) list.push(s);
        spendsByKey.set(key, list);
        if (r.date < minDate) minDate = r.date;
        if (r.date > maxDate) maxDate = r.date;
      }

      const stats = await db.dailyStat.findMany({
        where: { entityType, entityId: { in: idChunk }, date: { gte: minDate, lte: maxDate } },
        select: { id: true, entityId: true, date: true, spend: true, cpc: true, cpm: true, costPerMessage: true, revenueMinor: true },
      });
      const conflicting = new Set<string>();
      for (const s of stats) {
        const key = `${s.entityId}|${dayKey(s.date)}`;
        const seen = spendsByKey.get(key) ?? [];
        let evidence: number | null = null;
        if (seen.length > 0) {
          const spread = Math.max(...seen) - Math.min(...seen);
          if (spread > 1) conflicting.add(key); else evidence = seen[0]!;
        }
        const verdict = judgeSpendScale(Number(s.spend), evidence);
        if (verdict === "VERIFIED") out.verified++;
        else if (verdict === "UNVERIFIABLE") out.unverifiable++;
        else {
          out.overscaled.push({
            statId: s.id, entityType, entityId: s.entityId, date: s.date, storedSpend: s.spend,
            cpc: s.cpc, cpm: s.cpm, costPerMessage: s.costPerMessage, revenueMinor: s.revenueMinor, verdict,
          });
        }
      }
      out.conflictingRawKeys += conflicting.size;
    }
  }
  return out;
}

/** The fields the mapper multiplied by the (wrong) factor, divided back. Ratios (ctr, roas, frequency) are untouched. */
function rescaledFields(row: ScaleEvidenceRow): Prisma.DailyStatUpdateManyMutationInput {
  const data: Prisma.DailyStatUpdateManyMutationInput = {
    spend: BigInt(Math.round(Number(row.storedSpend) / OVERSCALE_DIVISOR)),
  };
  if (row.cpc != null && Number.isFinite(row.cpc)) data.cpc = row.cpc / OVERSCALE_DIVISOR;
  if (row.cpm != null && Number.isFinite(row.cpm)) data.cpm = row.cpm / OVERSCALE_DIVISOR;
  if (row.costPerMessage != null && Number.isFinite(row.costPerMessage)) data.costPerMessage = row.costPerMessage / OVERSCALE_DIVISOR;
  if (Number(row.revenueMinor) > 0) data.revenueMinor = BigInt(Math.round(Number(row.revenueMinor) / OVERSCALE_DIVISOR));
  return data;
}

export type IqdRepairStatus = "applied" | "dry_run" | "not_iqd" | "not_found";

export interface IqdRepairResult {
  status: IqdRepairStatus;
  accountId: string;
  factorBefore: number | null;
  factorAfter: number | null;
  factorChanged: boolean;
  accountRowsRescaled: number;
  campaignRowsRescaled: number;
  /** Rows the evidence proves are ×100 (== rescaled when applied, == would-rescale when dry-run). */
  rowsOverscaled: number;
  rowsVerified: number;
  /** Left intact on purpose. */
  rowsUnverifiable: number;
  conflictingRawKeys: number;
  /** Rows judged over-scaled but changed by someone else before the update — skipped, not divided. */
  rowsSkippedChangedConcurrently: number;
}

export interface IqdRepairOptions {
  /** false = report only, write nothing, take no lock. Default true. */
  apply?: boolean;
  /** TEST SEAM. Awaited after evidence is read and before any write — lets a test play a concurrent writer. */
  afterEvidence?: () => Promise<void>;
}

const emptyResult = (status: IqdRepairStatus, accountId: string): IqdRepairResult => ({
  status, accountId, factorBefore: null, factorAfter: null, factorChanged: false,
  accountRowsRescaled: 0, campaignRowsRescaled: 0, rowsOverscaled: 0, rowsVerified: 0,
  rowsUnverifiable: 0, conflictingRawKeys: 0, rowsSkippedChangedConcurrently: 0,
});

/**
 * Repair ONE IQD account from row-level evidence, atomically.
 * Idempotent: a second run finds the rows VERIFIED and changes nothing.
 * Stranded rows (factor already 1, rows still ×100) are repaired too — the
 * decision rests on the rows, never on the factor flag.
 */
export async function repairIqdAccountScale(
  prisma: PrismaClient,
  accountId: string,
  opts: IqdRepairOptions = {},
): Promise<IqdRepairResult> {
  const apply = opts.apply ?? true;

  if (!apply) {
    const acct = await prisma.adAccount.findUnique({ where: { id: accountId }, select: { currency: true, currencyMinorFactor: true } });
    if (!acct) return emptyResult("not_found", accountId);
    if (acct.currency !== "IQD") return { ...emptyResult("not_iqd", accountId), factorBefore: acct.currencyMinorFactor };
    const ev = await collectScaleEvidence(prisma, accountId);
    return {
      ...emptyResult("dry_run", accountId), factorBefore: acct.currencyMinorFactor, factorAfter: acct.currencyMinorFactor,
      rowsOverscaled: ev.overscaled.length, rowsVerified: ev.verified, rowsUnverifiable: ev.unverifiable, conflictingRawKeys: ev.conflictingRawKeys,
    };
  }

  return prisma.$transaction(async (tx) => {
    // Serialise repairs of this account across every process. Released at commit/rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"adlytic:iqd-scale:" + accountId}, 0))`;

    // Everything below is read AFTER the lock: a waiting repair sees the winner's result.
    const acct = await tx.adAccount.findUnique({ where: { id: accountId }, select: { currency: true, currencyMinorFactor: true } });
    if (!acct) return emptyResult("not_found", accountId);
    if (acct.currency !== "IQD") return { ...emptyResult("not_iqd", accountId), factorBefore: acct.currencyMinorFactor, factorAfter: acct.currencyMinorFactor };

    const ev = await collectScaleEvidence(tx, accountId);
    if (opts.afterEvidence) await opts.afterEvidence();

    let accountRows = 0, campaignRows = 0, skipped = 0;
    for (const row of ev.overscaled) {
      // Optimistic check: only if the spend is still exactly what was judged.
      const r = await tx.dailyStat.updateMany({ where: { id: row.statId, spend: row.storedSpend }, data: rescaledFields(row) });
      if (r.count === 1) { if (row.entityType === EntityType.ACCOUNT) accountRows++; else campaignRows++; }
      else skipped++;
    }

    // The flag LAST: it can only say "repaired" if the rewrite above is part of the same commit.
    const flag = await tx.adAccount.updateMany({ where: { id: accountId, currencyMinorFactor: { not: 1 } }, data: { currencyMinorFactor: 1 } });

    return {
      status: "applied" as const, accountId, factorBefore: acct.currencyMinorFactor, factorAfter: 1, factorChanged: flag.count === 1,
      accountRowsRescaled: accountRows, campaignRowsRescaled: campaignRows, rowsOverscaled: ev.overscaled.length,
      rowsVerified: ev.verified, rowsUnverifiable: ev.unverifiable, conflictingRawKeys: ev.conflictingRawKeys,
      rowsSkippedChangedConcurrently: skipped,
    };
  }, { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS });
}

/**
 * SYNC ONLY. Bring the persisted factor in line with the currency and return
 * the factor sync must use for the rows it writes.
 *
 *  · IQD: run the evidence-based atomic repair. If it fails it rolls back
 *    completely and sync CONTINUES with factor 1 (what the mapper resolves for
 *    IQD regardless of the stored value) — the next sync retries.
 *  · anything else: a single compare-and-set on the factor column; rows are
 *    never rewritten.
 */
export async function reconcileAccountScaleForSync(
  prisma: PrismaClient,
  account: { id: string; currency: string; currencyMinorFactor: number },
): Promise<number> {
  const canonical = currencyMinorFactorFor(account.currency);
  if (account.currency.trim().toUpperCase() === "IQD") {
    try {
      const r = await repairIqdAccountScale(prisma, account.id);
      if (r.rowsOverscaled > 0 || r.factorChanged || r.rowsUnverifiable > 0) {
        console.log(
          `[iqd-repair] sync account=${account.id.slice(0, 8)}… factor ${r.factorBefore}→${r.factorAfter} ` +
          `rescaled=${r.accountRowsRescaled + r.campaignRowsRescaled} verified=${r.rowsVerified} left-intact=${r.rowsUnverifiable}`,
        );
      }
    } catch (err) {
      console.error(
        `[iqd-repair] sync account=${account.id.slice(0, 8)}… FAILED and rolled back; continuing with factor ${canonical}, will retry next sync:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    return canonical;
  }
  if (account.currencyMinorFactor !== canonical) {
    await prisma.adAccount.updateMany({
      where: { id: account.id, currencyMinorFactor: { not: canonical } },
      data: { currencyMinorFactor: canonical },
    });
  }
  return canonical;
}
