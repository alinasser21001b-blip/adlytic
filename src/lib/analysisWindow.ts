// ════════════════════════════════════════════════════════════════════════
//  src/lib/analysisWindow.ts
//
//  THE analysis window — current 7 days vs the prior 7, lagged 2 days for
//  Meta's attribution backfill.
//
//  This arithmetic used to live inline in buildEntityFunnel and again in the
//  Brain Observatory. Two copies of a date calculation is survivable while
//  they only label things. It stops being survivable once a Meta PERIOD FACT
//  is stored keyed by the span: a period row is matched on an EXACT
//  (entity, since, until) tuple, so a one-day drift between the writer's idea
//  of the window and the reader's turns every lookup into a miss — and a miss
//  reports UNKNOWN. The feature would switch itself off silently and look
//  like Meta had stopped answering.
//
//  So the window is computed in exactly one place and imported everywhere.
//  This file must keep ZERO imports; a test asserts that.
// ════════════════════════════════════════════════════════════════════════

/** Days withheld from the end so Meta's attribution has settled. */
export const LAG_DAYS = 2;
/** Length of each comparison window. */
export const WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export interface AnalysisWindows {
  /** First day of the current window (inclusive). */
  currentSince: Date;
  /** Last day of the current window (inclusive). */
  currentUntil: Date;
  priorSince: Date;
  priorUntil: Date;
}

/** UTC midnight for a date — windows are whole days, never instants. */
function floorUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolve both comparison windows.
 *
 * @param now injectable so a test can pin the clock; production passes nothing.
 */
export function resolveAnalysisWindows(now: number = Date.now()): AnalysisWindows {
  const currentUntil = floorUtc(new Date(now - LAG_DAYS * DAY_MS));
  const currentSince = new Date(currentUntil.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  const priorUntil = new Date(currentSince.getTime() - DAY_MS);
  const priorSince = new Date(priorUntil.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  return { currentSince, currentUntil, priorSince, priorUntil };
}

/** `YYYY-MM-DD` — the form Meta's `time_range` and a `@db.Date` both want. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
