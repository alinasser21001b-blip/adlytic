// ════════════════════════════════════════════════════════════════════════
//  src/lib/spendScaleRule.ts — the evidence rule for IQD spend scale. PURE.
//
//  One rule, shared by every reader that has to ask "is this stored spend what
//  Meta said?": the repair (src/lib/iqdRepair.ts, which may rewrite) and the
//  read-only spend-evidence gate (src/lib/spendEvidence.ts, which never writes).
//  Keeping it here, with no Prisma and no I/O, is what stops the two from
//  drifting: a day is VERIFIED / OVERSCALED / UNVERIFIABLE by exactly the same
//  code whether the question comes from the repair or from a recommendation.
//
//  The stored currency factor is NOT evidence and does not appear here.
// ════════════════════════════════════════════════════════════════════════

/** Over-scale is exactly ×100 (the schema default factor applied to an IQD major). */
export const OVERSCALE_DIVISOR = 100;
export const OVERSCALE_TOLERANCE = 0.02;

export type ScaleVerdict = 'OVERSCALED' | 'VERIFIED' | 'UNVERIFIABLE';

/** Raw Meta `spend` (account-currency MAJOR units) from a raw_insights payload, or null. */
export function parseMetaSpend(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const v = (rawJson as Record<string, unknown>)['spend'];
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Pure. For an IQD account (canonical factor 1) is the stored minor spend what
 * raw Meta says (VERIFIED), exactly 100× that (OVERSCALED), or neither
 * (UNVERIFIABLE)? Missing or invalid evidence is UNVERIFIABLE — never a guess.
 */
export function judgeSpendScale(storedMinor: number, rawMetaSpendMajor: number | null): ScaleVerdict {
  if (rawMetaSpendMajor == null || !Number.isFinite(rawMetaSpendMajor) || rawMetaSpendMajor < 0) return 'UNVERIFIABLE';
  if (!Number.isFinite(storedMinor) || storedMinor < 0) return 'UNVERIFIABLE';
  const expected = Math.round(rawMetaSpendMajor); // IQD factor is 1
  if (Math.abs(storedMinor - expected) <= 1) return 'VERIFIED';
  if (rawMetaSpendMajor > 0 && Math.abs(storedMinor / (rawMetaSpendMajor * OVERSCALE_DIVISOR) - 1) < OVERSCALE_TOLERANCE) {
    return 'OVERSCALED';
  }
  return 'UNVERIFIABLE';
}

/**
 * Pure. Judge ONE stored daily value against EVERY raw spend seen for that
 * (entity, day). Sync APPENDS a raw row on every run, so a recent day
 * legitimately carries several, with restated values:
 *
 *   · a stored value equal to ANY of them is VERIFIED (Meta reported it) —
 *     unless another of them says it is exactly ×100, which withdraws the
 *     certificate (the row is then contradicted, not certified);
 *   · a stored value is judged OVERSCALED only against raws that all agree:
 *     disagreement (spread > 1) is NOT resolved by guessing which fetch is
 *     newer — it is `conflicting`, and the verdict is UNVERIFIABLE.
 */
export function judgeDayAgainstRaws(storedMinor: number, seenRawSpends: number[]): { verdict: ScaleVerdict; conflicting: boolean } {
  const contradictedAsX100 = seenRawSpends.some((v) => judgeSpendScale(storedMinor, v) === 'OVERSCALED');
  if (!contradictedAsX100 && seenRawSpends.some((v) => judgeSpendScale(storedMinor, v) === 'VERIFIED')) {
    return { verdict: 'VERIFIED', conflicting: false };
  }
  let evidence: number | null = null;
  let conflicting = false;
  if (seenRawSpends.length > 0) {
    const spread = Math.max(...seenRawSpends) - Math.min(...seenRawSpends);
    if (spread > 1) conflicting = true; else evidence = seenRawSpends[0]!;
  }
  return { verdict: judgeSpendScale(storedMinor, evidence), conflicting };
}
