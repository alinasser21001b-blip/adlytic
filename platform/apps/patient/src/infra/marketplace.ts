/**
 * MarketplacePort over the declared acceptance contract.
 *
 * @blueprint §4 R8 · §4 R9/R10 · D06 · D39 · POST /v1/offers/{id}/accept
 * @owner marketplace-engine
 * @why This is the most consequential call the patient app makes: it turns a
 *      comparison into a commitment, and a pharmacy sets medicine aside on the
 *      strength of it. Everything downstream of it was built — V1's request,
 *      V2's code and clock, V4's refusal, the machine that moves between them
 *      — and nothing performed the call, so `chooseOffer` computed which lines
 *      the patient had agreed to and then dropped them on the floor. A patient
 *      who chose a pharmacy watched V1 forever.
 *
 *      Every declared response gets a variant, including the two 409s, which
 *      are the same status and different events: a pharmacy took the offer
 *      back, or the patient took too long. R8's error state names which, and a
 *      port that collapsed them would make that impossible.
 */
import { instant } from "@dawai/domain";
import type { Http } from "./http.js";
import type { AcceptResult, Fetched, MarketplacePort } from "../ports.js";
import type { Hold } from "../model/reservation.js";

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The hold, as V2 must be able to draw it.
 *
 * V2 is the screen Blueprint v3 says must never fail — it is what a patient
 * holds up at a counter — and every field here is on it. A reservation missing
 * its code is not a reservation the patient can collect, and a missing expiry
 * would leave the countdown either absent or counting from nothing. Anything
 * incomplete is refused rather than half-drawn, because a code that does not
 * work at the counter is worse than being told the hold did not go through.
 */
function holdOf(v: unknown): Hold | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!isString(r["reservationId"]) || !isString(r["code"]) || !isString(r["branchName"])) return null;
  if (!isString(r["holderName"]) || !isString(r["branchPhone"]) || !isString(r["address"])) return null;
  if (!isNumber(r["confirmedAt"]) || !isNumber(r["expiresAt"]) || !isNumber(r["totalMinor"])) return null;
  if (!Array.isArray(r["lines"])) return null;

  const lines: { itemName: string; packs: number; priceMinor: number }[] = [];
  for (const raw of r["lines"]) {
    if (typeof raw !== "object" || raw === null) return null;
    const l = raw as Record<string, unknown>;
    // A line dropped here would be medicine the patient paid for and does not
    // see listed, so the whole hold is refused rather than quietly shortened.
    if (!isString(l["itemName"]) || !isNumber(l["packs"]) || !isNumber(l["priceMinor"])) return null;
    lines.push({ itemName: l["itemName"], packs: l["packs"], priceMinor: l["priceMinor"] });
  }

  return {
    reservationId: r["reservationId"], code: r["code"], branchName: r["branchName"],
    holderName: r["holderName"], branchPhone: r["branchPhone"], address: r["address"],
    confirmedAt: instant(r["confirmedAt"]), expiresAt: instant(r["expiresAt"]),
    totalMinor: r["totalMinor"], lines,
  };
}

/** The `error` field the contract fixes for each refusal. Read as a string and
 *  matched exactly — a status alone cannot tell the two 409s apart. */
const errorOf = (body: unknown): string =>
  typeof body === "object" && body !== null && isString((body as Record<string, unknown>)["error"])
    ? (body as Record<string, string>)["error"]!
    : "";

export function makeMarketplace(http: Http): MarketplacePort {
  return {
    async accept(offerId, acceptedLineIds, substitutionAcknowledged, idempotencyKey, signal): Promise<Fetched<AcceptResult>> {
      const res = await http.post(
        `/v1/offers/${encodeURIComponent(offerId)}/accept`,
        { acceptedLineIds: [...acceptedLineIds], substitutionAcknowledged },
        { idempotencyKey, ...(signal === undefined ? {} : { signal }) },
      );

      const body = (res.body ?? {}) as Record<string, unknown>;
      const error = errorOf(res.body);

      /**
       * A reservation in the body IS the answer, whatever the status.
       *
       * 409 is three different things on this endpoint: `offer_withdrawn`,
       * `offer_expired`, and a REPLAY — the contract's third rule says a
       * repeated state-changing call returns the original result, and the
       * transport classifies every 409 as a duplicate. Reading the status
       * alone cannot tell them apart, so the body decides: a hold means a hold
       * happened, and only its absence makes this a refusal.
       *
       * The order matters and it was wrong the other way round: checking
       * `duplicate` first turned a withdrawn offer into an unreadable
       * reservation, so R8 would have shown a transport failure where D39's
       * two named outcomes belong.
       */
      const hold = holdOf(body["reservation"]);
      if (hold) {
        const child = body["childRequestId"];
        return { kind: "fresh", value: { kind: "held", hold, childRequestId: isString(child) ? child : null } };
      }

      // A success with a body we cannot read is worse than a failure: the hold
      // exists at the pharmacy and the patient has no code for it. Saying so
      // is the only honest answer available.
      if (res.outcome.kind === "accepted" && error === "")
        return { kind: "failed", outcome: { kind: "permanent", reason: "unreadable_reservation" } };
      // The declared refusals, each named. A refusal the contract does not
      // list is a transport failure, not a fifth outcome invented here.
      if (error === "offer_withdrawn") return { kind: "fresh", value: { kind: "withdrawn" } };
      if (error === "offer_expired") return { kind: "fresh", value: { kind: "expired" } };
      if (error === "substitution_not_acknowledged") return { kind: "fresh", value: { kind: "substitutionNotAcknowledged" } };
      if (error === "not_found_or_not_yours") return { kind: "fresh", value: { kind: "gone" } };

      return { kind: "failed", outcome: res.outcome };
    },
  };
}
