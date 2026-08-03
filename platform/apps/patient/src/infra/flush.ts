/**
 * The outbox, actually delivered.
 *
 * @blueprint §21 · D27 · net/retry · POST /v1/requests
 * @owner patient-app
 * @why Everything about delivery already existed as policy with no engine:
 *      the outbox knew its states, the retry policy knew its delays, and
 *      `classify` knew what a status means. This walks the ready items through
 *      all three. It is the only place the three meet, so "a queued request is
 *      eventually sent, exactly once, and never silently dropped" is one
 *      function's contract instead of a property smeared across the app.
 *
 *      Per-subject ordering is preserved by construction: items are taken in
 *      queue order and a subject's next item is not attempted while an earlier
 *      one is still retriable. Unrelated subjects do not block each other —
 *      a stuck request for the father must not strand the child's.
 */
import { delayFor, shouldRetry, DEFAULT_POLICY, type RetryPolicy } from "@dawai/net";
import {
  readyToSend, markSending, markAccepted, markDuplicate, markRejected, requeue,
  type Outbox, type OutboxItem,
} from "@dawai/offline";
import type { Http } from "./http.js";

export type FlushDeps = {
  readonly http: Http;
  readonly policy?: RetryPolicy;
  /** Injected for the same reason the domain refuses Math.random: a delivery
   *  schedule must be reproducible under test. */
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Called after every state change so the store can persist and the UI can
   *  show R13 truthfully while the flush is still running. */
  readonly onChange: (outbox: Outbox) => void;
  /**
   * The live outbox, read back before each item is attempted.
   *
   * `onChange` only pushes OUT. Without a way back IN, a flush works from the
   * private copy it started with, and a user who cancels a queued request on
   * R13 mid-flush watches it send anyway — the code even claimed to re-read
   * "the live outbox" while re-reading its own snapshot. Optional so a caller
   * with no live store (the tests, a one-shot flush) is unaffected.
   */
  readonly current?: () => Outbox;
};

/**
 * One flush at a time, per outbox.
 *
 * Two concurrent flushes both see an item as `queued`, both mark it sending,
 * and both POST it. The idempotency key means the server keeps one write, but
 * the second reply lands on an item the first already resolved and the later
 * `onChange` snapshot overwrites the earlier — so the store's outbox goes
 * backwards. A single lane is the only shape where "exactly once" is a
 * property rather than a hope.
 */
let inFlight: Promise<Outbox> | null = null;

/**
 * Deliver everything that is ready. Returns the final outbox.
 *
 * One item at a time, in order. Parallel delivery would be faster and wrong:
 * the outbox's ordering promise is per subject, and the simplest correct
 * implementation of "never overtake" is "one lane".
 */
export function flush(outbox: Outbox, deps: FlushDeps): Promise<Outbox> {
  // Callers fire this on connectivity changes, app open and manual retry —
  // all three can arrive together. Joining the run already in progress is
  // right: its job is to deliver everything ready, which includes anything
  // enqueued a moment ago.
  if (inFlight) return inFlight;
  inFlight = run(outbox, deps).finally(() => { inFlight = null; });
  return inFlight;
}

/** Exposed for tests: a suite must be able to start from a known lane. */
export const resetFlushLane = (): void => { inFlight = null; };

async function run(outbox: Outbox, deps: FlushDeps): Promise<Outbox> {
  const policy = deps.policy ?? DEFAULT_POLICY;
  let current = outbox;
  /** Subjects whose head-of-line item gave up this run. Later items for the
   *  same subject must wait for it, or writes overtake each other. */
  const blocked = new Set<string>();

  for (const head of readyToSend(current)) {
    if (blocked.has(head.subjectId)) continue;

    // Read the LIVE outbox, not this run's copy. A cancellation that happened
    // while the previous item was in flight has to be seen here or the user's
    // "cancel" does nothing but move a label.
    if (deps.current) current = merge(current, deps.current());

    const item = current.items.find((i) => i.id === head.id);
    if (!item || item.state !== "queued") continue;

    current = markSending(current, item.id);
    deps.onChange(current);
    current = await deliver(current, item, deps, policy);
    deps.onChange(current);

    const after = current.items.find((i) => i.id === item.id);
    if (after && (after.state === "queued" || after.state === "rejected")) blocked.add(item.subjectId);
  }
  return current;
}

/**
 * The live outbox wins on membership; this run wins on the item it is holding.
 *
 * Both statements matter. The store may have enqueued or cancelled since this
 * run began, so its item set is authoritative — but the store has not seen the
 * attempt counter this run just incremented, so for the item being delivered
 * the in-flight copy is newer. Taking one side wholesale loses one or the
 * other.
 */
function merge(mine: Outbox, live: Outbox): Outbox {
  return {
    items: live.items.map((theirs) => {
      const ours = mine.items.find((i) => i.id === theirs.id);
      // A terminal decision the store made — cancelled — always wins.
      if (!ours || theirs.state === "cancelled") return theirs;
      return ours.attempts > theirs.attempts ? ours : theirs;
    }),
  };
}

async function deliver(outbox: Outbox, item: OutboxItem, deps: FlushDeps, policy: RetryPolicy): Promise<Outbox> {
  // `operation` is "POST /v1/requests" — the declared route, stored in domain
  // terms at enqueue. Split here rather than re-derived, so the outbox row a
  // user reads and the call that is made cannot disagree.
  const [method, path] = item.operation.split(" ", 2);
  if (method !== "POST" || !path) return markRejected(outbox, item.id, `unsupported operation: ${item.operation}`);

  for (let attempt = 1; ; attempt += 1) {
    const res = await deps.http.post(path, item.payload, { idempotencyKey: item.idempotencyKey });

    if (res.outcome.kind === "accepted") return markAccepted(outbox, item.id);
    // A duplicate IS success: the earlier attempt landed. Treating it as an
    // error is how a patient gets told their sent request failed.
    if (res.outcome.kind === "duplicate") return markDuplicate(outbox, item.id);
    if (res.outcome.kind === "permanent") return markRejected(outbox, item.id, res.outcome.reason);

    if (!shouldRetry(res.outcome, attempt, policy)) {
      // Exhausted. Back to queued — visible on R13 with its attempt count,
      // never dropped. The next flush (connectivity change, app open, manual
      // retry) picks it up again.
      return requeue(markRejected(outbox, item.id, res.outcome.reason), item.id);
    }
    await deps.sleep(delayFor(attempt, policy, deps.random));
  }
}
