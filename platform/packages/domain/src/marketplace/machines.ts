/**
 * The published marketplace state machines, transcribed edge by edge.
 *
 * @blueprint §6 Request · §6 Offer · §6 Reservation
 * @owner marketplace-engine
 * @why Rule 5: every state transition must come from the published state
 *      machine. These tables ARE the diagrams in Blueprint v3 §6 — each edge
 *      carries its own reference so a reviewer can check one arrow without
 *      reading the file. A transition absent from these tables cannot be
 *      performed, because `transition()` is the only way to move.
 * @implements marketplace/machines
 */
import { defineMachine } from "../shared/machine.js";

/* ── Request — §6 Request ─────────────────────────────────────────────── */
export type RequestState =
  | "draft" | "queued" | "broadcast" | "answered"
  | "unanswered" | "accepted" | "partially_filled" | "closed";

export type RequestEvent =
  | "send" | "connectionReturned" | "cancelFromOutbox" | "offerArrived"
  | "windowElapsed" | "widen" | "abandon" | "acceptOffer"
  | "allLinesReserved" | "childCreated";

export const RequestMachine = defineMachine<RequestState, RequestEvent>({
  name: "Request",
  bp: "§6 Request",
  initial: ["draft"],
  terminal: ["closed"],
  transitions: [
    { from: "draft", on: "send", to: "queued", bp: "§6 Request · D27 sent while offline" },
    { from: "draft", on: "connectionReturned", to: "broadcast", bp: "§6 Request · sent" },
    { from: "queued", on: "connectionReturned", to: "broadcast", bp: "§6 Request" },
    { from: "queued", on: "cancelFromOutbox", to: "draft", bp: "§6 Request · D27" },
    { from: "broadcast", on: "offerArrived", to: "answered", bp: "§6 Request" },
    { from: "broadcast", on: "windowElapsed", to: "unanswered", bp: "§6 Request · D09" },
    { from: "answered", on: "acceptOffer", to: "accepted", bp: "§6 Request" },
    { from: "answered", on: "windowElapsed", to: "unanswered", bp: "§6 Request · offers expired" },
    { from: "unanswered", on: "widen", to: "broadcast", bp: "§6 Request · §4 R11" },
    { from: "unanswered", on: "abandon", to: "closed", bp: "§6 Request" },
    { from: "accepted", on: "childCreated", to: "partially_filled", bp: "§6 Request · D06" },
    { from: "accepted", on: "allLinesReserved", to: "closed", bp: "§6 Request" },
    // D06: the child request re-broadcasts so the patient re-enters nothing.
    { from: "partially_filled", on: "widen", to: "broadcast", bp: "§6 Request · D06 child request" },
    { from: "partially_filled", on: "abandon", to: "closed", bp: "§6 Request" },
  ],
});

/* ── Offer — §6 Offer ─────────────────────────────────────────────────── */
export type OfferState =
  | "composing" | "sent" | "withdrawn" | "expired" | "not_chosen" | "accepted" | "abandoned";

export type OfferEvent = "send" | "leave" | "withdraw" | "windowElapsed" | "otherChosen" | "accept";

export const OfferMachine = defineMachine<OfferState, OfferEvent>({
  name: "Offer",
  bp: "§6 Offer",
  initial: ["composing"],
  terminal: ["withdrawn", "expired", "not_chosen", "accepted", "abandoned"],
  transitions: [
    { from: "composing", on: "send", to: "sent", bp: "§6 Offer" },
    { from: "composing", on: "leave", to: "abandoned", bp: "§6 Offer" },
    // D08: withdrawal is the correction path for a mistyped binding price, and
    // it exists ONLY before acceptance. After acceptance the price binds.
    { from: "sent", on: "withdraw", to: "withdrawn", bp: "§6 Offer · D08" },
    { from: "sent", on: "windowElapsed", to: "expired", bp: "§6 Offer" },
    { from: "sent", on: "otherChosen", to: "not_chosen", bp: "§6 Offer" },
    { from: "sent", on: "accept", to: "accepted", bp: "§6 Offer" },
  ],
});

/* ── Reservation — §6 Reservation ─────────────────────────────────────── */
export type ReservationState =
  | "requested" | "held" | "refused" | "collected" | "expired" | "cancelled";

export type ReservationEvent = "confirm" | "cannotHold" | "verifyCode" | "windowElapsed" | "cancel";

export const ReservationMachine = defineMachine<ReservationState, ReservationEvent>({
  name: "Reservation",
  bp: "§6 Reservation",
  initial: ["requested"],
  terminal: ["refused", "collected", "expired", "cancelled"],
  transitions: [
    // The clock starts HERE and nowhere earlier. A countdown before anyone has
    // committed stock counts down to a disappointment.
    { from: "requested", on: "confirm", to: "held", bp: "§6 Reservation · clock starts at held" },
    { from: "requested", on: "cannotHold", to: "refused", bp: "§6 Reservation · D39" },
    { from: "requested", on: "cancel", to: "cancelled", bp: "§4 V5 · patient cancels while confirming" },
    { from: "held", on: "verifyCode", to: "collected", bp: "§6 Reservation · §4 P14" },
    { from: "held", on: "windowElapsed", to: "expired", bp: "§6 Reservation" },
    { from: "held", on: "cancel", to: "cancelled", bp: "§4 V5" },
  ],
});
