/**
 * R6 — sending the request, online or not.
 *
 * @blueprint R6 · R7 · R13 · D27 · D09 · §6 Request · POST /v1/requests · request.broadcast
 * @owner patient-app
 * @why D27 is the rule this module exists to make unbreakable: a queued request
 *      is NEVER presented as sent. That is not a copy decision — it is a
 *      structural one, so sending returns the request's state from the
 *      published machine (`queued` or `broadcast`) rather than a boolean, and
 *      the screen renders whichever it is given. The outbox owns delivery; this
 *      owns the transition and the words are the outbox's `describe`.
 */
import { MarketplaceMachines, Marketplace, transition, isErr, isOk, type Refusal, type Instant } from "@dawai/domain";
import { enqueue, type Outbox } from "@dawai/offline";
import { submission, type Draft } from "./draft.js";
import type { Environment, RequestSubmission } from "../ports.js";

export type Sent = {
  /** From the published machine, never assigned directly. `queued` means the
   *  outbox holds it; `broadcast` means it went. */
  readonly state: MarketplaceMachines.RequestState;
  readonly outbox: Outbox;
  /** The stable key that makes the replay exactly-once. Also the client's
   *  handle on the request until the server answers with a real id. */
  readonly idempotencyKey: string;
  readonly submission: RequestSubmission;
  /** D09 — when the window closes, computed from the urgency the patient
   *  chose. Null while queued: the window starts when the request is actually
   *  broadcast, and a countdown on an unsent request counts down to nothing. */
  readonly windowEndsAt: Instant | null;
};

/**
 * Put the draft in the outbox and move the request.
 *
 * Both paths enqueue. Sending directly and queueing only on failure produces
 * two delivery routes with two sets of bugs, and the second one is exercised
 * only on the worst connections — where it matters most and is tested least.
 */
export function send(
  draft: Draft,
  outbox: Outbox,
  env: Environment,
  sentAt: Instant,
): { readonly ok: true; readonly sent: Sent } | { readonly ok: false; readonly refusal: Refusal } {
  const built = submission(draft);
  if (built.refusal || built.value === null)
    return { ok: false, refusal: built.refusal ?? { code: "NO_LINES" } };

  const idempotencyKey = env.newId();
  const online = env.online();

  // §6 Request: draft --send--> queued, and draft --connectionReturned-->
  // broadcast. `transition` is the only way to move, so a state this machine
  // does not publish cannot be produced here.
  const moved = transition(
    MarketplaceMachines.RequestMachine,
    "draft",
    online ? "connectionReturned" : "send",
  );
  if (isErr(moved)) return { ok: false, refusal: moved.error };

  const queued = enqueue(outbox, {
    id: env.newId(),
    operation: "POST /v1/requests",
    // D27 — the words a screen may use come from the outbox's `describe`.
    // This label says what the item IS, not what happened to it.
    label: describeRequest(draft),
    payload: built.value as unknown as Readonly<Record<string, unknown>>,
    idempotencyKey,
    queuedAt: env.now(),
    subjectId: draft.subjectId,
  });

  return {
    ok: true,
    sent: {
      state: moved.value,
      outbox: queued,
      idempotencyKey,
      submission: built.value,
      windowEndsAt: moved.value === "broadcast"
        ? Marketplace.windowEndsAt(sentAt, draft.urgency)
        : null,
    },
  };
}

/**
 * What the patient reads in the outbox list on R13. It names the medicine,
 * because "طلب" tells someone with four pending items nothing.
 */
export function describeRequest(draft: Draft): string {
  const first = draft.lines[0];
  if (!first) return "طلب دواء";
  return draft.lines.length === 1
    ? `طلب ${first.name}`
    : `طلب ${first.name} و${draft.lines.length - 1} غيره`;
}

/**
 * The connection came back and the outbox delivered. R7 may now show a live
 * window; before this, it may not.
 */
export function delivered(
  state: MarketplaceMachines.RequestState,
  urgency: Marketplace.Urgency,
  broadcastAt: Instant,
): { readonly state: MarketplaceMachines.RequestState; readonly windowEndsAt: Instant } | null {
  const moved = transition(MarketplaceMachines.RequestMachine, state, "connectionReturned");
  if (!isOk(moved)) return null;
  return { state: moved.value, windowEndsAt: Marketplace.windowEndsAt(broadcastAt, urgency) };
}

/**
 * How much of the window is left, as a fraction and as milliseconds. Returns
 * null while queued — R7 must not show a countdown for a request that has not
 * been asked of anybody.
 */
export function remaining(
  windowEndsAt: Instant | null,
  urgency: Marketplace.Urgency,
  now: Instant,
): { readonly ms: number; readonly fraction: number } | null {
  if (windowEndsAt === null) return null;
  const ms = Math.max(0, windowEndsAt - now);
  return { ms, fraction: Math.min(1, Math.max(0, ms / Marketplace.windowFor(urgency))) };
}
