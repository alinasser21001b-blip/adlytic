/**
 * F1 and F2 — finding a catalogue item, as a state machine.
 *
 * @blueprint F1 · F2 · search.unmatched · GET /v1/catalogue/search
 * @owner patient-app
 * @why F2's purpose in Blueprint v3 §4 is "find a catalogue item the way people
 *      actually type", and its declared states are loading, empty, error and
 *      offline. Every one of them is a distinct value here rather than a set of
 *      booleans, because `loading && error && stale` is representable with
 *      booleans and each combination is a screen somebody has to reason about.
 *      Rule 4 applies throughout: this module decides what is DISPLAYED, and
 *      the one clinical question it asks — may this item be requested at all —
 *      it asks the domain.
 */
import { Clinical, isErr, type RefusalCode } from "@dawai/domain";
import { toWesternDigits } from "@dawai/design";
import type { CatalogueHit, Fetched, SearchResponse } from "../ports.js";

/**
 * How the user's typing becomes a query.
 *
 * This is input handling, not matching: the catalogue service decides what
 * matches. It exists because an Iraqi patient types the same medicine six
 * ways — with and without tatweel, with أ إ آ for ا, with ى for ي, with ة for
 * ه, and with either numeral system — and sending those through unchanged
 * turns a present medicine into "not in our list", which is the single
 * cheapest way to lose someone on their first search.
 */
export function normaliseQuery(raw: string): string {
  // Digits fold through @dawai/design so this normaliser and the render-time
  // one cannot disagree about what «٥» is.
  return toWesternDigits(raw)
    .replace(/[ـ]/g, "")                       // tatweel, a decoration
    .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ → ا
    .replace(/ى/g, "ي")                   // ى → ي
    .replace(/ة/g, "ه")                   // ة → ه
    .replace(/[ً-ْ]/g, "")                // harakat
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Why an item cannot be added, decided by the domain and carried to the row so
 * the list can say so before the tap rather than after it.
 */
export type HitAvailability =
  | { readonly requestable: true; readonly needsPrescription: boolean }
  | { readonly requestable: false; readonly refusal: RefusalCode };

/**
 * D42 and D18, asked of the clinical gate. The gate is asked with
 * `hasPrescriptionImage: true` deliberately: at search time the question is
 * "could this ever be requested", and answering "no" to a prescription item a
 * patient is holding the paper for would be wrong.
 */
export function availability(hit: CatalogueHit): HitAvailability {
  const gate = Clinical.gateRequestLine(
    { requestable: hit.requestable, requiresPrescription: hit.requiresPrescription, isControlled: hit.isControlled },
    true,
  );
  if (isErr(gate)) return { requestable: false, refusal: gate.error.code };
  return { requestable: true, needsPrescription: hit.requiresPrescription };
}

export type SearchState =
  /** Nothing typed. F1's empty state teaches; it is not a failure. */
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly query: string }
  | { readonly kind: "results"; readonly query: string; readonly hits: readonly CatalogueHit[]; readonly at: number }
  /** §13.1 — the catalogue is incomplete, not the patient wrong. */
  | { readonly kind: "empty"; readonly query: string }
  | { readonly kind: "error"; readonly query: string; readonly reason: string }
  /** Cached rows, labelled with their age. Never presented as live. */
  | { readonly kind: "offline"; readonly query: string; readonly hits: readonly CatalogueHit[]; readonly cachedAt: number };

export const idle = (): SearchState => ({ kind: "idle" });

/**
 * The user typed. An emptied box returns to idle rather than searching for the
 * empty string — F1's teaching state is the right thing to show, and a query
 * of "" would otherwise return the whole catalogue.
 */
export function typed(raw: string): SearchState {
  const query = normaliseQuery(raw);
  return query === "" ? { kind: "idle" } : { kind: "loading", query };
}

/**
 * A response arrived. Late responses are dropped by query rather than by a
 * sequence number: on a slow connection a stale response for a previous query
 * overwrites the current one, and the user watches their results change under
 * their thumb.
 */
export function resolved(state: SearchState, query: string, r: Fetched<SearchResponse>): SearchState {
  if (state.kind !== "loading" || state.query !== query) return state;
  switch (r.kind) {
    case "fresh":
      return r.value.hits.length === 0
        ? { kind: "empty", query }
        : { kind: "results", query, hits: r.value.hits, at: r.value.at };
    case "cached":
      return r.value.hits.length === 0
        ? { kind: "empty", query }
        : { kind: "offline", query, hits: r.value.hits, cachedAt: r.cachedAt };
    case "failed":
      return { kind: "error", query, reason: r.outcome.kind === "transient" || r.outcome.kind === "permanent" ? r.outcome.reason : "unknown" };
  }
}

/**
 * `search.unmatched` feeds catalogue growth (§13.1), so it is emitted for a
 * genuine miss and never for a failure — counting a dropped connection as a
 * missing medicine would send the catalogue team after items that exist.
 */
export function shouldReportUnmatched(state: SearchState): boolean {
  return state.kind === "empty";
}

/** Whether the screen is showing something the user must be told is not live. */
export function isStale(state: SearchState): state is Extract<SearchState, { kind: "offline" }> {
  return state.kind === "offline";
}
