/**
 * V1, V2 and V4 — the hold, the code, and the refusal.
 *
 * @blueprint V1 · V2 · V4 · D39 · §6 Reservation · reservation.confirmed · reservation.refused
 * @owner patient-app
 * @why The clock starts at `held` and nowhere earlier. Blueprint v3 is explicit
 *      that a countdown before anyone has committed stock counts down to a
 *      disappointment — so V1 shows no timer at all, and V2's timer is derived
 *      from the instant the pharmacy actually confirmed. Every transition here
 *      comes from the published machine, so a state it does not contain cannot
 *      be produced.
 */
import { MarketplaceMachines, transition, isErr, isOk, type Instant, type Refusal } from "@dawai/domain";

/** How long a confirmed hold lasts. Fixed by the pharmacy on confirmation and
 *  carried here — never assumed by the client, because a client-side default
 *  would show a countdown the branch never agreed to. */
export type Hold = {
  readonly reservationId: string;
  readonly code: string;
  readonly branchName: string;
  /** Whose hold this is. The delivery leads with «حجزك باسم أم علي», because a
   *  patient often holds medicine for someone else and the counter asks. */
  readonly holderName: string;
  readonly branchPhone: string;
  readonly address: string;
  readonly confirmedAt: Instant;
  readonly expiresAt: Instant;
  readonly totalMinor: number;
  readonly lines: readonly { readonly itemName: string; readonly packs: number; readonly priceMinor: number }[];
};

export type ReservationView =
  /** V1 — the hold was requested and the pharmacy has not answered. No timer:
   *  nothing has been set aside yet. */
  | { readonly kind: "requesting"; readonly branchName: string }
  /** V2 — held. The code, the clock, the address. */
  | { readonly kind: "held"; readonly hold: Hold }
  /** V4 — D39. They confirmed and then could not. */
  | { readonly kind: "refused"; readonly branchName: string; readonly reopened: boolean }
  | { readonly kind: "collected"; readonly hold: Hold }
  | { readonly kind: "expired"; readonly hold: Hold }
  | { readonly kind: "cancelled" };

export const requesting = (branchName: string): ReservationView => ({ kind: "requesting", branchName });

/**
 * The pharmacy answered. Both outcomes go through the published machine, so
 * neither can be reached by assignment.
 */
export function confirmed(
  state: MarketplaceMachines.ReservationState,
  hold: Hold,
): { readonly view: ReservationView; readonly state: MarketplaceMachines.ReservationState } | null {
  const moved = transition(MarketplaceMachines.ReservationMachine, state, "confirm");
  if (!isOk(moved)) return null;
  return { view: { kind: "held", hold }, state: moved.value };
}

/**
 * D39 — the pharmacy confirmed and then could not hold it. The request re-opens
 * automatically, so V4's primary action moves the patient forward rather than
 * asking them to start again.
 */
export function cannotHold(
  state: MarketplaceMachines.ReservationState,
  branchName: string,
  reopened: boolean,
): { readonly view: ReservationView; readonly state: MarketplaceMachines.ReservationState } | null {
  const moved = transition(MarketplaceMachines.ReservationMachine, state, "cannotHold");
  if (!isOk(moved)) return null;
  return { view: { kind: "refused", branchName, reopened }, state: moved.value };
}

/** §4 P14 — the code is verified at the counter, not by the patient's phone. */
export function collected(
  state: MarketplaceMachines.ReservationState,
  hold: Hold,
): { readonly view: ReservationView; readonly state: MarketplaceMachines.ReservationState } | null {
  const moved = transition(MarketplaceMachines.ReservationMachine, state, "verifyCode");
  if (!isOk(moved)) return null;
  return { view: { kind: "collected", hold }, state: moved.value };
}

export function cancel(
  state: MarketplaceMachines.ReservationState,
): { readonly state: MarketplaceMachines.ReservationState } | { readonly refusal: Refusal } {
  const moved = transition(MarketplaceMachines.ReservationMachine, state, "cancel");
  if (isErr(moved)) return { refusal: moved.error };
  return { state: moved.value };
}

/**
 * How long is left on a hold, and how urgent it has become.
 *
 * The bands exist because a bare number cannot be read at a glance by someone
 * walking to a pharmacy. They are presentation only — nothing in the domain
 * changes at a band boundary, and the reservation expires on the instant the
 * pharmacy set, not on a band.
 */
export type Urgency = "comfortable" | "soon" | "last";

export function timeLeft(hold: Hold, now: Instant): {
  readonly ms: number;
  readonly minutes: number;
  readonly fraction: number;
  readonly urgency: Urgency;
  readonly expired: boolean;
} {
  const total = Math.max(1, hold.expiresAt - hold.confirmedAt);
  const ms = Math.max(0, hold.expiresAt - now);
  const minutes = Math.ceil(ms / 60_000);
  const fraction = Math.min(1, ms / total);
  return {
    ms, minutes, fraction,
    urgency: ms === 0 ? "last" : minutes <= 10 ? "last" : fraction <= 0.34 ? "soon" : "comfortable",
    expired: ms === 0,
  };
}

/**
 * How long is left, worded the way a person says it.
 *
 * The first version rendered "120 دقيقة", which is a hesitation moment: a
 * patient has to convert it before they know whether they can walk or must
 * hurry. Hours are how people hold time.
 */
export function describeRemaining(minutes: number): string {
  if (minutes <= 0) return "انتهى الوقت";
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتين" : `${h} ساعات`;
  return m === 0 ? hours : `${hours} و${m} دقيقة`;
}

/**
 * The expiry as a wall-clock time.
 *
 * The delivery states «صالح لحد ٧:٠٠ م» rather than a duration, because a
 * patient walking to a pharmacy thinks in clock time — a duration has to be
 * added to the current time before it means anything.
 */
export function clockTime(at: Instant): string {
  const d = new Date(at);
  const h24 = d.getUTCHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} ${h24 < 12 ? "ص" : "م"}`;
}

/**
 * The code, grouped so it can be read aloud to a pharmacist over the phone.
 * A six-character run read as one word is misheard; in pairs it is not.
 */
export function readableCode(code: string): string {
  return (code.match(/.{1,2}/g) ?? [code]).join(" ");
}

/** V2 is the screen that must never fail (§4 V2). When it is served from cache
 *  the code is still readable and the countdown is labelled as last known —
 *  presenting a cached countdown as live would send someone to a pharmacy for
 *  a hold that had already lapsed. */
export type Freshness =
  | { readonly kind: "live" }
  | { readonly kind: "cached"; readonly asOf: Instant };
