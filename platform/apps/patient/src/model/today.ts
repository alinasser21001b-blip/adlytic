/**
 * S1 — what Today has to say, decided before anything draws it.
 *
 * @blueprint S1 · §22 · V2 · V8 · §6 Reservation
 * @owner patient-app
 * @why Blueprint v3 gives S1 five states — empty, quiet, loading, offline,
 *      stale — and §22 makes the first two DIFFERENT screens with opposite
 *      meanings: a brand-new account must be TAUGHT, and a well-managed patient
 *      on an ordinary day must be REASSURED. Choosing between them at render
 *      time out of two booleans is how a product ends up telling somebody whose
 *      record simply failed to load that everything is fine.
 *
 *      So Today is one closed union: every arrangement a screen can be asked to
 *      draw is a value somebody named, and the combinations nobody wants —
 *      "loading and also empty", "offline and also fresh" — are unwritable
 *      rather than merely unlikely.
 */
import type { Instant } from "@dawai/domain";

import type { Hold, ReservationView } from "./reservation.js";

/**
 * Today, resolved.
 *
 * The order is the order the screen answers S1's question in — "what is
 * happening right now": something is happening, nothing is, or we do not yet
 * know.
 */
export type Today =
  /** The record has not arrived. §22 requires a skeleton shaped like what is
   *  coming, so this carries nothing: the shape belongs to the treatment. */
  | { readonly kind: "loading" }
  /**
   * A hold is live — the one thing on this screen that needs the patient
   * today. The code itself stays on V2: two places holding the same code is
   * one place too many to keep honest, and V2 is the screen Blueprint v3 says
   * must never fail.
   */
  | { readonly kind: "held"; readonly hold: Hold }
  /**
   * A hold has been asked for and the pharmacy has not answered.
   *
   * NOT reachable in this build: V1 declares `back: none` because a hold
   * request is in flight, so a patient cannot leave it for Today while it is
   * pending. It exists because `fromReservation` is total over
   * `ReservationView`, and the only alternatives were to call a hold in flight
   * "nothing needs your attention" or to leave the union open — a lie or a
   * hole. It becomes reachable the moment a notification can land while the
   * app is elsewhere (TD-21).
   */
  | { readonly kind: "pending"; readonly branchName: string }
  /**
   * §22's QUIET empty: this account has a record and nothing in it needs
   * attention. Reassurance, not absence — which is why it carries no action.
   */
  | { readonly kind: "quiet" }
  /**
   * §22's TEACHING empty: a brand-new account with nothing yet. The
   * highest-attention moment in the product, and the only empty that acts.
   */
  | { readonly kind: "new" }
  /**
   * From cache, with the moment it was true. A hold still renders — S1's
   * offline rule is "active reservations and history from cache, age-labelled"
   * — and `hold: null` is the honest answer when the cache holds no hold
   * rather than a claim that there is none.
   */
  | { readonly kind: "cached"; readonly hold: Hold | null; readonly asOf: Instant }
  /**
   * The refresh failed and whatever was already on screen stayed there. S1's
   * declared error says «ما ضاع اللي كتبته» in so many words — `workPreserved`
   * — so the failure may not take the hold away with it.
   */
  | { readonly kind: "failed"; readonly hold: Hold | null };

export const loading = (): Today => ({ kind: "loading" });
export const quiet = (): Today => ({ kind: "quiet" });
export const brandNew = (): Today => ({ kind: "new" });
export const cached = (hold: Hold | null, asOf: Instant): Today => ({ kind: "cached", hold, asOf });
export const failed = (hold: Hold | null): Today => ({ kind: "failed", hold });

/**
 * Today, from the one record this build actually holds.
 *
 * A reservation is the whole of it. The Blueprint gives S1 dispense history as
 * well, and there is no port that reads it — so an account whose only history
 * is a collection from a previous launch is indistinguishable here from an
 * account that has never done anything, and this answers `new`. That is the
 * SAFE error of the two: being taught something you already know costs a
 * patient nothing, and being told «كل شي تمام» while a hold we failed to load
 * expires costs them their medicine. Registered as TD-27 rather than hidden
 * behind a plausible guess.
 */
export function fromReservation(reservation: ReservationView | null): Today {
  if (reservation === null) return brandNew();
  switch (reservation.kind) {
    case "held": return { kind: "held", hold: reservation.hold };
    case "requesting": return { kind: "pending", branchName: reservation.branchName };
    // Collected, expired, refused and cancelled are all a record with nothing
    // live in it. D39 already re-opened the request behind a refusal and V4
    // said so; repeating it here would be Today claiming a job that screen has.
    case "collected":
    case "expired":
    case "refused":
    case "cancelled":
      return quiet();
  }
}

/**
 * The hold Today is still showing, whatever else is true of the screen.
 *
 * Offline and failed both keep it — that is what "age-labelled" and
 * "workPreserved" mean — so every renderer would otherwise repeat the same
 * three-branch match to find out whether to draw the card.
 */
export function holdOf(today: Today): Hold | null {
  switch (today.kind) {
    case "held": return today.hold;
    case "cached":
    case "failed": return today.hold;
    case "loading":
    case "pending":
    case "quiet":
    case "new": return null;
  }
}
