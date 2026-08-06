// ════════════════════════════════════════════════════════════════════════
//  src/orchestrator/polling.ts — adaptive backoff for external waits
//
//  Meta emits no reliable webhook for "partner access approved", so the
//  Meta adapter declares supportsEvents = false and the engine polls.
//  Blind fixed-interval polling is the wrong answer twice over: too slow
//  right after the request (when approval is most likely), and pure waste
//  days later — and every wasted Graph call counts against the Marketing
//  API access-tier error/usage budget.
//
//  The curve is dense immediately after the request and decays. Combined
//  with the operator's manual "check now" button, it feels instant without
//  the quota cost of actually being instant.
//
//  Pure functions — no I/O, fully unit-testable.
// ════════════════════════════════════════════════════════════════════════

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Ordered buckets: while elapsed < `until`, wait `every`. */
const BACKOFF_CURVE: ReadonlyArray<{ until: number; every: number }> = [
  { until: 5 * MINUTE, every: 30 * SECOND },  // just requested — approval likely imminent
  { until: 30 * MINUTE, every: 2 * MINUTE },
  { until: 2 * HOUR, every: 5 * MINUTE },
  { until: 24 * HOUR, every: 15 * MINUTE },
  { until: 7 * DAY, every: HOUR },            // long tail — client is slow, not absent
];

/** Beyond this, an unapproved request is treated as abandoned. */
export const WAIT_EXPIRY_MS = 7 * DAY;

/**
 * How long to wait before the next check, given how long we have already
 * been waiting for the external action.
 *
 * Returns null when the wait has exceeded WAIT_EXPIRY_MS — the caller
 * should stop polling and mark the record FAILED (retryable by the
 * operator, since the client can still approve later).
 */
export function nextCheckDelayMs(elapsedMs: number): number | null {
  const elapsed = Math.max(0, elapsedMs);
  for (const bucket of BACKOFF_CURVE) {
    if (elapsed < bucket.until) return bucket.every;
  }
  return null;
}

/**
 * Absolute timestamp for the next check, or null when the wait expired.
 * `waitingSince` is when the current external wait began — not when the
 * record was created, so a re-request restarts the dense phase.
 */
export function nextCheckAt(waitingSince: Date, now: Date = new Date()): Date | null {
  const delay = nextCheckDelayMs(now.getTime() - waitingSince.getTime());
  if (delay === null) return null;
  return new Date(now.getTime() + delay);
}

/** True once the external wait has run past its expiry window. */
export function isWaitExpired(waitingSince: Date, now: Date = new Date()): boolean {
  return now.getTime() - waitingSince.getTime() >= WAIT_EXPIRY_MS;
}
