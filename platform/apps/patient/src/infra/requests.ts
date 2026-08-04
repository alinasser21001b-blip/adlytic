/**
 * RequestsPort over the declared read contract.
 *
 * @blueprint §4 R7 · §6 Offer · D06 · D11 · D19 · GET /v1/requests/{id}
 * @owner marketplace-engine
 * @why R7's whole job is to make a wait legible, and until this existed the
 *      wait was not a wait: the request was sent, pharmacies answered, and the
 *      app never asked. `offerArrived` had been in the intent union since the
 *      first slice with nothing in the product able to produce it, so R7
 *      counted zero offers forever and R8 could not be reached at all.
 *
 *      Not cached, deliberately. F2 caches search because a catalogue is the
 *      same tomorrow; an offer is a live commitment with a price and a state,
 *      and showing a stale one would tell a patient a pharmacy is holding
 *      something it has withdrawn. A failed read is a failed read.
 */
import { Marketplace } from "@dawai/domain";
import type { Http } from "./http.js";
import type { Fetched, RequestsPort, RequestView } from "../ports.js";
import type { Offer, OfferLine, ProposedBy } from "../model/offers.js";

const isString = (v: unknown): v is string => typeof v === "string";

/**
 * An answer the app is allowed to SHOW, and to act on.
 *
 * The same reasoning as the catalogue's row guard, and for a sharper reason: a
 * line's answer drives consent. `substitutionsOf` reads `answer.kind ===
 * "substitute"` to decide which questions R9 must ask, and `choosable` and
 * `summarise` read prices to decide what a patient is agreeing to pay. A line
 * whose answer we cannot read is a line we cannot present honestly, and a
 * substitute missing its name would put «undefined» where the name of a
 * medicine a patient is consenting to should be.
 *
 * Dropped rather than guessed. An offer that loses a line is visibly partial —
 * R8 already draws coverage as «يغطي ٢ من ٣» — whereas an offer with an
 * unreadable line silently misrepresents what is being promised.
 */
const isAnswer = (v: unknown): v is Marketplace.OfferAnswer => {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  switch (a["kind"]) {
    case "available": return typeof a["priceMinor"] === "number";
    case "unavailable": return isString(a["reason"]);
    case "substitute": return typeof a["priceMinor"] === "number" && isString(a["itemId"]);
    default: return false;
  }
};

const isProposedBy = (v: unknown): v is ProposedBy => {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  // D19 — a substitution may only be proposed by a verified pharmacist, and
  // the screen may only say «صيدلي مُجاز» when the record says so. An absent
  // flag is not `false`; it is a line whose authority we cannot report.
  return isString(p["name"]) && typeof p["licenceVerified"] === "boolean" && isString(p["branchName"]);
};

const isLine = (v: unknown): v is OfferLine => {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  if (!isString(l["requestLineId"]) || !isString(l["itemName"]) || !isString(l["latinName"])) return false;
  if (!isAnswer(l["answer"])) return false;
  if ((l["answer"] as Marketplace.OfferAnswer).kind !== "substitute") return true;
  return isString(l["substituteName"]) && isString(l["substituteLatinName"]) && isProposedBy(l["proposedBy"]);
};

const BANDS: readonly string[] = ["trusted", "new", "needs_attention"];
const STATES: readonly string[] = ["sent", "withdrawn", "expired", "not_chosen", "accepted"];

/**
 * An offer with everything R8 compares on.
 *
 * `honoured` is the one field allowed to be absent, because the contract says
 * so: D11 gives it three bands and `null` when there are too few samples to
 * say. Absent and null mean the same thing and the screen draws neither band
 * nor claim. Every other field is a thing a patient reads before choosing.
 */
const isOffer = (v: unknown): v is Offer => {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const honoured = o["honoured"];
  return isString(o["offerId"])
    && isString(o["branchId"])
    && isString(o["branchName"])
    && isString(o["districtName"])
    && typeof o["distanceM"] === "number"
    && (honoured === null || honoured === undefined || (isString(honoured) && BANDS.includes(honoured)))
    && isString(o["state"]) && STATES.includes(o["state"])
    && typeof o["openNow"] === "boolean"
    && Array.isArray(o["lines"]) && o["lines"].every(isLine);
};

/** Absent `honoured` becomes the explicit null D11 defines, so nothing
 *  downstream has to distinguish "no band" from "field missing". */
const normalise = (o: Offer): Offer => ({ ...o, honoured: o.honoured ?? null });

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function makeRequests(http: Http): RequestsPort {
  return {
    async read(requestId, signal): Promise<Fetched<RequestView>> {
      const res = await http.get(`/v1/requests/${encodeURIComponent(requestId)}`, signal);
      if (res.outcome.kind !== "accepted") return { kind: "failed", outcome: res.outcome };

      const body = (res.body ?? {}) as Record<string, unknown>;
      const responders = (body["responders"] ?? {}) as Record<string, unknown>;
      return {
        kind: "fresh",
        value: {
          requestId,
          responders: {
            asked: count(responders["asked"]),
            replied: count(responders["replied"]),
            thinking: count(responders["thinking"]),
          },
          offers: Array.isArray(body["offers"]) ? body["offers"].filter(isOffer).map(normalise) : [],
        },
      };
    },
  };
}
