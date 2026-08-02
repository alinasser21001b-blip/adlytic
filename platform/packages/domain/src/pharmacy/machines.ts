/**
 * The published pharmacy state machines, transcribed edge by edge.
 *
 * @blueprint §6 Verification · §6 Branch eligibility
 * @owner pharmacy-service
 * @why Rule 5. The verification machine encodes the rule that a lapsed licence
 *      stops routing but never cancels a live reservation (§6) — the kind of
 *      thing that gets lost the first time someone writes a cleanup job.
 * @implements pharmacy/machines
 */
import { defineMachine } from "../shared/machine.js";

/* ── Verification — §6 Verification ───────────────────────────────────── */
export type VerificationState =
  | "drafting" | "submitted" | "info_requested" | "rejected"
  | "verified" | "expiring" | "lapsed" | "suspended" | "closed";

export type VerificationEvent =
  | "submit" | "requestInfo" | "resubmit" | "reject" | "appeal" | "approve"
  | "sixtyDaysToExpiry" | "renew" | "expiryReached" | "suspend" | "reinstate" | "close";

export const VerificationMachine = defineMachine<VerificationState, VerificationEvent>({
  name: "Verification",
  bp: "§6 Verification",
  initial: ["drafting"],
  terminal: ["closed"],
  transitions: [
    { from: "drafting", on: "submit", to: "submitted", bp: "§6 · §4 PA7" },
    { from: "submitted", on: "requestInfo", to: "info_requested", bp: "§6 · §4 PA9" },
    { from: "info_requested", on: "resubmit", to: "submitted", bp: "§6 · §4 PA9" },
    { from: "submitted", on: "reject", to: "rejected", bp: "§6 · reason and appeal path" },
    { from: "rejected", on: "appeal", to: "submitted", bp: "§6" },
    { from: "submitted", on: "approve", to: "verified", bp: "§6 · D10 operator sets the map point" },
    { from: "verified", on: "sixtyDaysToExpiry", to: "expiring", bp: "§6 · warnings at 60/30/7" },
    { from: "expiring", on: "renew", to: "verified", bp: "§6" },
    // Lapsing stops ROUTING. It does not cancel a live reservation — those are
    // honoured. That distinction lives here so no cleanup job can forget it.
    { from: "expiring", on: "expiryReached", to: "lapsed", bp: "§6 · routing stops, live reservations honoured" },
    { from: "lapsed", on: "renew", to: "verified", bp: "§6" },
    { from: "verified", on: "suspend", to: "suspended", bp: "§4 O6" },
    { from: "suspended", on: "reinstate", to: "verified", bp: "§4 O6" },
    { from: "verified", on: "close", to: "closed", bp: "D15 · §4 P28" },
    { from: "lapsed", on: "close", to: "closed", bp: "§6" },
    { from: "rejected", on: "close", to: "closed", bp: "§6 · applicant withdraws" },
    { from: "drafting", on: "close", to: "closed", bp: "§6 · applicant abandons" },
    { from: "info_requested", on: "close", to: "closed", bp: "§6 · applicant abandons" },
    { from: "suspended", on: "close", to: "closed", bp: "§6" },
    { from: "expiring", on: "suspend", to: "suspended", bp: "§4 O6" },
  ],
});

/* ── Branch eligibility — §6 Branch eligibility ───────────────────────── */
export type EligibilityState = "receiving" | "closed" | "paused" | "at_capacity" | "ineligible";

export type EligibilityEvent =
  | "outsideHours" | "openingTimeReached" | "pause" | "resume"
  | "capacityReached" | "reservationResolved" | "licenceOrSuspension" | "resolved";

export const EligibilityMachine = defineMachine<EligibilityState, EligibilityEvent>({
  name: "BranchEligibility",
  bp: "§6 Branch eligibility",
  // D13: a branch is never silently filtered out. Every non-receiving state
  // names itself on the branch home, which is why they are states and not a
  // predicate evaluated inside the router.
  initial: ["receiving"],
  terminal: [],
  transitions: [
    { from: "receiving", on: "outsideHours", to: "closed", bp: "§6 · §8 routing rule 3" },
    { from: "closed", on: "openingTimeReached", to: "receiving", bp: "§6 · D09" },
    { from: "receiving", on: "pause", to: "paused", bp: "§6 · §4 P21" },
    { from: "paused", on: "resume", to: "receiving", bp: "§6" },
    { from: "receiving", on: "capacityReached", to: "at_capacity", bp: "§6 · §8 routing rule 4" },
    { from: "at_capacity", on: "reservationResolved", to: "receiving", bp: "§6" },
    { from: "receiving", on: "licenceOrSuspension", to: "ineligible", bp: "§6 · §8 routing rule 1" },
    { from: "ineligible", on: "resolved", to: "receiving", bp: "§6" },
    { from: "closed", on: "licenceOrSuspension", to: "ineligible", bp: "§6" },
    { from: "paused", on: "licenceOrSuspension", to: "ineligible", bp: "§6" },
    { from: "at_capacity", on: "licenceOrSuspension", to: "ineligible", bp: "§6" },
  ],
});
