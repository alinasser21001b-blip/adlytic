/**
 * Marketplace business rules — every quantity Blueprint v3 fixed.
 *
 * @blueprint §8 · D06 · D07 · D08 · D09 · D11 · D12 · D14
 * @owner marketplace-engine
 * @why The independent review's central finding was that v1 settled principles
 *      and left every load-bearing quantity undefined, so a build team would
 *      invent six of them. Blueprint v3 fixed each one. This module is where
 *      they live as executable constants — one place, checked by tests, so no
 *      controller ever needs to know what "soon" means.
 * @implements marketplace/rules
 */
import { type Result, ok, err } from "../shared/result.js";
import { type Refusal, refuse, REFUSAL } from "../shared/refusal.js";
import { type Instant, MINUTE, HOUR, DAY, plus, minus } from "../shared/instant.js";

/* ── D09 · Request windows. Exactly three, and no other value exists. ──── */
export const URGENCY = ["now", "today", "soon"] as const;
export type Urgency = (typeof URGENCY)[number];

const WINDOW_MS: Readonly<Record<Urgency, number>> = {
  now: 20 * MINUTE,
  today: 4 * HOUR,
  soon: 2 * DAY, // labelled «خلال يومين», deliberately not "this week"
};

export const windowFor = (u: Urgency): number => WINDOW_MS[u];
export const windowEndsAt = (sentAt: Instant, u: Urgency): Instant => plus(sentAt, WINDOW_MS[u]);

/* ── D07 · Quantity. The unit is the pack, and there is no other unit. ─── */
export type Packs = number & { readonly __brand: "Packs" };

export function packs(n: number): Result<Packs, Refusal> {
  if (!Number.isInteger(n) || n < 1) return err(refuse(REFUSAL.PRICE_REQUIRED, { field: "packs", got: n }));
  return ok(n as Packs);
}

/* ── §2 Request · line limits ─────────────────────────────────────────── */
export const MAX_REQUEST_LINES = 8;

export function checkLineCount(n: number): Result<number, Refusal> {
  if (n < 1) return err(refuse(REFUSAL.NO_LINES));
  if (n > MAX_REQUEST_LINES) return err(refuse(REFUSAL.TOO_MANY_LINES, { max: MAX_REQUEST_LINES, got: n }));
  return ok(n);
}

/* ── §8 · Routing. Five rules, all five required, no ranking, no weight. ─ */
export type BranchEligibilityFacts = {
  readonly verifiedWithCurrentLicence: boolean;
  readonly coversDistrict: boolean;
  readonly openNow: boolean;
  readonly opensWithinWindow: boolean;
  readonly paused: boolean;
  readonly atCapacity: boolean;
  readonly marksAnyRequestedItemNotCarried: boolean;
};

export type RoutingDecision =
  | { readonly routed: true; readonly notifyAt: "now" | "openingTime" }
  | { readonly routed: false; readonly reason: RoutingExclusion };

export type RoutingExclusion =
  | "not_verified" | "outside_coverage" | "closed" | "paused" | "at_capacity" | "not_carried";

/**
 * D12: every eligible branch is asked simultaneously. There is no ranking, no
 * weighting and no paid placement — this function returns a boolean and a
 * notification time, never a score.
 *
 * D13: an excluded branch always gets a reason, because v1 filtered branches
 * out silently and then judged them inactive for not answering.
 */
export function route(f: BranchEligibilityFacts): RoutingDecision {
  if (!f.verifiedWithCurrentLicence) return { routed: false, reason: "not_verified" };
  if (!f.coversDistrict) return { routed: false, reason: "outside_coverage" };
  if (f.marksAnyRequestedItemNotCarried) return { routed: false, reason: "not_carried" };
  if (f.paused) return { routed: false, reason: "paused" };
  if (f.atCapacity) return { routed: false, reason: "at_capacity" };
  if (f.openNow) return { routed: true, notifyAt: "now" };
  // D09: a branch opening inside the window is routed, and its notification is
  // deferred to opening time. This is the one rule that replaced v1's three
  // contradictory answers to the closed-pharmacy case.
  if (f.opensWithinWindow) return { routed: true, notifyAt: "openingTime" };
  return { routed: false, reason: "closed" };
}

/* ── D11 · Honoured rate ──────────────────────────────────────────────── */
export const REFUSAL_GRACE_MS = 5 * MINUTE;
export const HONOURED_MIN_SAMPLE = 10;
export const HONOURED_WINDOW_MS = 60 * DAY;

export type HonouredBand = "trusted" | "new" | "needs_attention";

/**
 * A refusal reported within five minutes of confirming is the honest "sold
 * since" case and does not count. v1 penalised a structurally guaranteed event.
 */
export function refusalCounts(confirmedAt: Instant, refusedAt: Instant): boolean {
  return minus(refusedAt, confirmedAt) > REFUSAL_GRACE_MS;
}

/**
 * Returns a BAND, never a number. A decimal invites an argument about a number
 * instead of about the behaviour, and it is shown to patients.
 */
export function honouredBand(collected: number, countedFailures: number): HonouredBand | null {
  const total = collected + countedFailures;
  if (total < HONOURED_MIN_SAMPLE) return "new";
  const rate = collected / total;
  if (rate >= 0.95) return "trusted";
  return "needs_attention";
}

/* ── D08 · Price ──────────────────────────────────────────────────────── */
export type OfferAnswer =
  | { readonly kind: "available"; readonly priceMinor: number }
  | { readonly kind: "unavailable"; readonly reason: UnavailableReason }
  | { readonly kind: "substitute"; readonly priceMinor: number; readonly itemId: string; readonly note: string };

export const UNAVAILABLE_REASONS = ["out_of_stock", "not_carried", "closing", "cannot_supply"] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export function checkAnswer(a: OfferAnswer): Result<OfferAnswer, Refusal> {
  if (a.kind === "unavailable") {
    if (!UNAVAILABLE_REASONS.includes(a.reason)) return err(refuse(REFUSAL.UNAVAILABLE_REASON_REQUIRED));
    return ok(a);
  }
  if (!Number.isInteger(a.priceMinor) || a.priceMinor <= 0)
    return err(refuse(REFUSAL.PRICE_REQUIRED, { got: a.priceMinor }));
  if (a.kind === "substitute" && a.note.trim() === "")
    return err(refuse(REFUSAL.SUBSTITUTION_REQUIRES_PHARMACIST, { field: "note" }));
  return ok(a);
}

/* ── D06 · Accepting an offer: coverage and the child request ─────────── */
export type AcceptanceOutcome = {
  readonly reservedLineIds: readonly string[];
  /** Lines the accepted offer did not fill. D06: these form a child request
   *  automatically, so the patient never re-enters a line. */
  readonly childRequestLineIds: readonly string[];
};

export function accept(
  allRequestLineIds: readonly string[],
  acceptedLineIds: readonly string[],
): Result<AcceptanceOutcome, Refusal> {
  if (acceptedLineIds.length === 0) return err(refuse(REFUSAL.NOTHING_ACCEPTED));
  const accepted = new Set(acceptedLineIds);
  for (const id of accepted)
    if (!allRequestLineIds.includes(id))
      return err(refuse(REFUSAL.NOT_FOUND_OR_NOT_YOURS, { line: id }));
  return ok({
    reservedLineIds: allRequestLineIds.filter((id) => accepted.has(id)),
    childRequestLineIds: allRequestLineIds.filter((id) => !accepted.has(id)),
  });
}

/** Coverage as the patient sees it: «عندها ٢ من ٣». Never a percentage. */
export function coverage(availableLines: number, requestedLines: number): readonly [number, number] {
  return [availableLines, requestedLines];
}
