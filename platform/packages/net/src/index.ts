/**
 * @dawai/net — retry policy.
 *
 * @blueprint §21 · D27 · §8
 * @owner platform-foundation
 * @why A retry that duplicates a write is worse than a failure the user can
 *      see. Every state-changing call carries an idempotency key, so the retry
 *      question is only "how long do we wait" — and on a bad connection the
 *      answer must not hammer a network that is already struggling.
 * @implements net/retry
 */

export type Outcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "duplicate" }
  /** Worth retrying: a timeout, a 5xx, a lost connection. */
  | { readonly kind: "transient"; readonly reason: string }
  /** Not worth retrying: the server understood and refused. */
  | { readonly kind: "permanent"; readonly reason: string };

export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

/** Deliberately patient. Iraqi mobile data returns in bursts, and a tight loop
 *  spends the user's battery and data allowance to no purpose. */
export const DEFAULT_POLICY: RetryPolicy = { maxAttempts: 6, baseDelayMs: 1_000, maxDelayMs: 60_000 };

/**
 * Exponential backoff with full jitter. Jitter matters here specifically: when
 * a cell tower returns, every queued device retries at once, and identical
 * backoff turns a recovery into a thundering herd.
 *
 * `random` is a parameter so the schedule is deterministic under test — the
 * same reason the domain never calls Math.random.
 */
export function delayFor(attempt: number, p: RetryPolicy, random: () => number): number {
  const ceiling = Math.min(p.maxDelayMs, p.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(ceiling * random());
}

export function shouldRetry(o: Outcome, attempt: number, p: RetryPolicy): boolean {
  if (o.kind !== "transient") return false;
  return attempt < p.maxAttempts;
}

/**
 * When the policy is exhausted the item stops retrying and becomes visible to
 * the user, with a reason and a manual retry. It is never dropped: silently
 * abandoning a queued request is exactly the failure the outbox exists to
 * prevent.
 */
export function exhausted(attempt: number, p: RetryPolicy): boolean {
  return attempt >= p.maxAttempts;
}

/** Classification the caller applies to a transport result. Kept here so every
 *  caller classifies identically — a 409 treated as an error in one place and
 *  a success in another is how a duplicate becomes a user-visible failure. */
export function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return { kind: "accepted" };
  if (status === 409) return { kind: "duplicate" };
  if (status === 408 || status === 425 || status === 429) return { kind: "transient", reason: `status ${status}` };
  if (status >= 500) return { kind: "transient", reason: `status ${status}` };
  return { kind: "permanent", reason: `status ${status}` };
}
