/**
 * R9 and R10 — one offer in full, and consenting to a substitution.
 *
 * @blueprint R9 · R10 · D19 · D06 · §4 R10 · §7
 * @owner clinical-engine
 * @why This module exists because of a defect the review registered as TD-5 at
 *      critical: R8 could show a substitution and let a patient accept the
 *      offer containing it, while §4 R10 requires an EXPLICIT acknowledgement
 *      of a different brand. A flag on a row is not consent.
 *
 *      Three rules make it consent rather than a formality. It is never
 *      pre-ticked, so the default is always "not agreed". It is per LINE, not
 *      per offer, because agreeing to one substitution is not agreeing to
 *      another. And refusing does not lose the rest of the order — D06 already
 *      puts unfilled lines into a child request, so a refused substitution
 *      follows the same path as an out-of-stock line rather than forcing the
 *      patient to choose between a brand they did not want and starting again.
 * @implements consent/substitution
 */
import type { Refusal } from "@dawai/domain";

export type Substitution = {
  readonly requestLineId: string;
  /** What the patient asked for. */
  readonly requestedName: string;
  /** What the pharmacy is proposing instead. */
  readonly offeredName: string;
  readonly offeredItemId: string;
  readonly priceMinor: number;
  /** D19 — a substitution may only be proposed by a verified pharmacist, and
   *  the note is theirs. Shown verbatim; the app never paraphrases a clinical
   *  statement. */
  readonly pharmacistNote: string;
};

/** The patient's answer to one proposal. `undecided` is the only possible
 *  starting value: there is no constructor that produces `agreed`. */
export type Decision = "undecided" | "agreed" | "refused";

export type ConsentState = {
  readonly offerId: string;
  readonly decisions: ReadonlyMap<string, Decision>;
  readonly substitutions: readonly Substitution[];
};

/** Every proposal starts undecided. Nothing here can pre-tick a box. */
export function begin(offerId: string, substitutions: readonly Substitution[]): ConsentState {
  return {
    offerId,
    substitutions,
    decisions: new Map(substitutions.map((s) => [s.requestLineId, "undecided" as Decision])),
  };
}

export function decide(state: ConsentState, requestLineId: string, decision: Exclude<Decision, "undecided">): ConsentState {
  if (!state.decisions.has(requestLineId)) return state;
  const next = new Map(state.decisions);
  next.set(requestLineId, decision);
  return { ...state, decisions: next };
}

/** A decision may be changed until the offer is accepted — a patient who
 *  agreed and then read the note again must be able to say no. */
export const decisionFor = (state: ConsentState, requestLineId: string): Decision =>
  state.decisions.get(requestLineId) ?? "undecided";

export const allDecided = (state: ConsentState): boolean =>
  [...state.decisions.values()].every((d) => d !== "undecided");

export const agreedLines = (state: ConsentState): readonly string[] =>
  [...state.decisions.entries()].filter(([, d]) => d === "agreed").map(([id]) => id);

/** D06 — a refused substitution is an unfilled line, so it joins the child
 *  request exactly as an out-of-stock line does. The patient loses nothing by
 *  saying no, which is what makes saying no a real option. */
export const refusedLines = (state: ConsentState): readonly string[] =>
  [...state.decisions.entries()].filter(([, d]) => d === "refused").map(([id]) => id);

/**
 * Which lines this offer will actually reserve, once consent is applied.
 *
 * A line with an undecided substitution is NOT included. Treating undecided as
 * agreement is the exact failure §4 R10 exists to prevent.
 */
export function linesToReserve(
  state: ConsentState,
  offerFilledLineIds: readonly string[],
): readonly string[] {
  const refused = new Set(refusedLines(state));
  const undecided = new Set(
    [...state.decisions.entries()].filter(([, d]) => d === "undecided").map(([id]) => id));
  return offerFilledLineIds.filter((id) => !refused.has(id) && !undecided.has(id));
}

/**
 * May this offer be accepted yet? A refusal here is a product rule, not a
 * transport error, so it carries a domain code the screen words.
 */
export function gate(state: ConsentState): Refusal | null {
  if (!allDecided(state)) return { code: "SUBSTITUTION_NOT_ACKNOWLEDGED" };
  return null;
}

/** What the patient is being asked to compare, in the order they need it: what
 *  they asked for, what is offered instead, and why — the pharmacist's own
 *  words, never summarised. */
export type Comparison = {
  readonly asked: string;
  readonly offered: string;
  readonly note: string;
  readonly priceMinor: number;
  readonly decision: Decision;
};

export function comparison(state: ConsentState, requestLineId: string): Comparison | null {
  const s = state.substitutions.find((x) => x.requestLineId === requestLineId);
  if (!s) return null;
  return {
    asked: s.requestedName,
    offered: s.offeredName,
    note: s.pharmacistNote,
    priceMinor: s.priceMinor,
    decision: decisionFor(state, requestLineId),
  };
}

/** How many decisions are still outstanding, so R9 can say what is left rather
 *  than only refusing to proceed. */
export const outstanding = (state: ConsentState): number =>
  [...state.decisions.values()].filter((d) => d === "undecided").length;
