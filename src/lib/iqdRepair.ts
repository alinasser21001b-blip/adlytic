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

import { EntityType, Prisma, type PrismaClient } from "@prisma/client";
import { currencyMinorFactorFor } from "./currency";

/** Over-scale is exactly ×100 (the schema default factor applied to an IQD major). */
const OVERSCALE_DIVISOR = 100;
const OVERSCALE_TOLERANCE = 0.02;
/** Only the entity levels the old repair covered. Ad-set / ad rows are NOT repaired. */
const COVERED_ENTITY_TYPES = [EntityType.ACCOUNT, EntityType.CAMPAIGN] as const;
const ID_CHUNK = 500;
const TX_TIMEOUT_MS = 60_000;
const TX_MAX_WAIT_MS = 10_000;

// `$queryRaw` because the evidence is ONE number inside a JSON payload: selecting
// raw_json whole would pull the heaviest table in the database into memory.
type Reader = Pick<PrismaClient, "dailyStat" | "campaign" | "$queryRaw">;

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
  /** (entity, date) keys whose raw rows disagree with each other and none matches the stored spend — treated as no evidence. */
  conflictingRawKeys: number;
  entitiesChecked: number;
  /** The same counts for ACCOUNT-level rows only (the headline spend). */
  accountRows: { verified: number; unverifiable: number; overscaled: number };
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

  const out: ScaleEvidence = {
    overscaled: [], verified: 0, unverifiable: 0, conflictingRawKeys: 0, entitiesChecked: 0,
    accountRows: { verified: 0, unverifiable: 0, overscaled: 0 },
  };

  for (const entityType of COVERED_ENTITY_TYPES) {
    const ids = idsByType[entityType];
    out.entitiesChecked += ids.length;
    for (const idChunk of chunk(ids, ID_CHUNK)) {
      if (idChunk.length === 0) continue;
      const since = opts.sinceDate ? Prisma.sql`AND date >= ${opts.sinceDate}` : Prisma.empty;
      const raws = await db.$queryRaw<Array<{ entity_id: string; day: string; spend: string | null }>>`
        SELECT entity_id, to_char(date, 'YYYY-MM-DD') AS day, raw_json->>'spend' AS spend
        FROM raw_insights
        WHERE entity_type = ${entityType}::"EntityType" AND entity_id = ANY(${idChunk}) ${since}`;
      if (raws.length === 0) continue;

      // (entity, date) -> every raw spend seen. sync APPENDS a raw row on every
      // run, so a recent day legitimately has several, with restated values.
      //   · a stored value that equals ANY of them is VERIFIED (Meta reported it) — unless
      //     another of them says it is exactly x100, which withdraws the certificate;
      //   · a stored value is judged OVERSCALED only against raws that all agree:
      //     disagreement is NOT resolved by guessing which fetch is newer.
      const spendsByKey = new Map<string, number[]>();
      let minDay = raws[0]!.day, maxDay = raws[0]!.day;
      for (const r of raws) {
        const s = parseMetaSpend({ spend: r.spend });
        const key = `${r.entity_id}|${r.day}`;
        const list = spendsByKey.get(key) ?? [];
        if (s != null) list.push(s);
        spendsByKey.set(key, list);
        if (r.day < minDay) minDay = r.day;
        if (r.day > maxDay) maxDay = r.day;
      }
      const minDate = new Date(`${minDay}T00:00:00.000Z`);
      const maxDate = new Date(`${maxDay}T00:00:00.000Z`);

      const stats = await db.dailyStat.findMany({
        where: { entityType, entityId: { in: idChunk }, date: { gte: minDate, lte: maxDate } },
        select: { id: true, entityId: true, date: true, spend: true, cpc: true, cpm: true, costPerMessage: true, revenueMinor: true },
      });
      const conflicting = new Set<string>();
      for (const s of stats) {
        const key = `${s.entityId}|${dayKey(s.date)}`;
        const seen = spendsByKey.get(key) ?? [];
        const stored = Number(s.spend);
        let verdict: ScaleVerdict;
        // "Equal to SOME raw of the day" verifies a restated day — unless ANOTHER raw of
        // that day proves the stored value is exactly x100 (e.g. [100000 (older), 1000
        // (newer)] with 100000 stored): then the row is contradicted, not certified. It
        // falls through to the disagreement rule below — unproven, counted, never
        // rewritten, because we do not guess which fetch is the newer one.
        const contradictedAsX100 = seen.some((v) => judgeSpendScale(stored, v) === "OVERSCALED");
        if (!contradictedAsX100 && seen.some((v) => judgeSpendScale(stored, v) === "VERIFIED")) {
          verdict = "VERIFIED";
        } else {
          let evidence: number | null = null;
          if (seen.length > 0) {
            const spread = Math.max(...seen) - Math.min(...seen);
            if (spread > 1) conflicting.add(key); else evidence = seen[0]!;
          }
          verdict = judgeSpendScale(stored, evidence);
        }
        const acct = entityType === EntityType.ACCOUNT ? out.accountRows : null;
        if (verdict === "VERIFIED") { out.verified++; if (acct) acct.verified++; }
        else if (verdict === "UNVERIFIABLE") { out.unverifiable++; if (acct) acct.unverifiable++; }
        else {
          if (acct) acct.overscaled++;
          out.overscaled.push({
            statId: s.id, entityType, entityId: s.entityId, date: s.date, storedSpend: s.spend,
            cpc: s.cpc, cpm: s.cpm, costPerMessage: s.costPerMessage, revenueMinor: s.revenueMinor, verdict,
          });
        }
      }
      out.conflictingRawKeys += conflicting.size;
    }
  }

  // Everything the evidence did not PROVE is unverifiable — including rows with no
  // raw counterpart at all and rows older than the raw coverage. Counting only the
  // rows that happened to fall inside a raw date range would understate it (and say
  // "0" for an account that has no raw_insights whatever).
  const dateFilter = opts.sinceDate ? { date: { gte: opts.sinceDate } } : {};
  let totalRows = 0, totalAccountRows = 0;
  for (const entityType of COVERED_ENTITY_TYPES) {
    for (const idChunk of chunk(idsByType[entityType], ID_CHUNK)) {
      if (idChunk.length === 0) continue;
      const n = await db.dailyStat.count({ where: { entityType, entityId: { in: idChunk }, ...dateFilter } });
      totalRows += n;
      if (entityType === EntityType.ACCOUNT) totalAccountRows += n;
    }
  }
  out.unverifiable = Math.max(0, totalRows - out.verified - out.overscaled.length);
  out.accountRows.unverifiable = Math.max(0, totalAccountRows - out.accountRows.verified - out.accountRows.overscaled);
  return out;
}

/**
 * READ-ONLY. How much of one account's ACCOUNT-level history has ANY raw_insights
 * row for its date. Rows without one cannot be checked against Meta at all —
 * whatever the stored currency factor says. (raw_insights are pruned after
 * RAW_INSIGHTS_RETAIN_DAYS by fetched_at; daily_stats are kept.)
 */
export async function accountHistoryEvidenceCoverage(
  db: Pick<PrismaClient, "$queryRaw">,
  accountId: string,
): Promise<{ accountRows: number; withoutEvidence: number }> {
  const r = await db.$queryRaw<Array<{ total: number; without_evidence: number }>>`
    SELECT count(*)::int AS total,
           (count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM raw_insights r
              WHERE r.entity_type = 'ACCOUNT'::"EntityType" AND r.entity_id = d.entity_id AND r.date = d.date
           )))::int AS without_evidence
    FROM daily_stats d
    WHERE d.entity_type = 'ACCOUNT'::"EntityType" AND d.entity_id = ${accountId}`;
  return { accountRows: Number(r[0]?.total ?? 0), withoutEvidence: Number(r[0]?.without_evidence ?? 0) };
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
