/**
 * R8 and R9 — the offers, and choosing between them.
 *
 * @blueprint R8 · R9 · D06 · D08 · D11 · D12 · §8 · §6 Offer
 * @owner patient-app
 * @why R8's purpose is "choose, with the reasons visible", and the reasons are
 *      fixed by the Blueprint rather than by a ranking this layer could invent.
 *      D12 says every eligible branch is asked simultaneously and there is no
 *      ranking, no weighting and no paid placement — so this module sorts for
 *      READABILITY and says so, and the sort key is coverage then price, both
 *      of which the patient can see and check. A score would be an opinion the
 *      patient cannot audit, and D11 already replaced a decimal reliability
 *      figure with a band for exactly that reason.
 */
import { Marketplace, isErr, type Instant, type Refusal } from "@dawai/domain";

export type OfferLine =
  | { readonly requestLineId: string; readonly itemName: string; readonly answer: Extract<Marketplace.OfferAnswer, { kind: "available" }> }
  | { readonly requestLineId: string; readonly itemName: string; readonly answer: Extract<Marketplace.OfferAnswer, { kind: "unavailable" }> }
  | {
      readonly requestLineId: string;
      readonly itemName: string;
      readonly answer: Extract<Marketplace.OfferAnswer, { kind: "substitute" }>;
      /** What the substitute is CALLED. The domain carries an itemId and the
       *  pharmacist's note; a patient consenting to a different brand must read
       *  its name, and showing an id would be showing them nothing. */
      readonly substituteName: string;
    };

export type Offer = {
  readonly offerId: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly districtName: string;
  /** Metres, from the district centroid. Presented as a rough distance, never
   *  as a live position — Phase 0 does not track the patient. */
  readonly distanceM: number;
  /** D11 — a band, never a decimal. `null` means too few samples to say. */
  readonly honoured: Marketplace.HonouredBand | null;
  readonly lines: readonly OfferLine[];
  /** §6 Offer. An offer the patient can still accept is `sent`. */
  readonly state: "sent" | "withdrawn" | "expired" | "not_chosen" | "accepted";
  readonly openNow: boolean;
};

export type SubstituteLine = Extract<OfferLine, { readonly substituteName: string }>;

/** A discriminated-union guard, because the discriminant is nested one level
 *  and narrowing it inline stopped working the moment a second variant gained
 *  a field. */
export const isSubstitute = (l: OfferLine): l is SubstituteLine => l.answer.kind === "substitute";

/**
 * The substitution proposals inside an offer, in the shape the consent model
 * needs. Derived here rather than in the reducer, which had begun to build the
 * same list in two places — the second copy is where the two drift.
 */
export function substitutionsOf(offer: Offer): readonly {
  readonly requestLineId: string;
  readonly requestedName: string;
  readonly offeredName: string;
  readonly offeredItemId: string;
  readonly priceMinor: number;
  readonly pharmacistNote: string;
}[] {
  return offer.lines.filter(isSubstitute).map((l) => ({
    requestLineId: l.requestLineId,
    requestedName: l.itemName,
    offeredName: l.substituteName,
    offeredItemId: l.answer.itemId,
    priceMinor: l.answer.priceMinor,
    pharmacistNote: l.answer.note,
  }));
}

/** What the patient reads on a row: what it covers and what it costs. */
export type OfferSummary = {
  readonly offer: Offer;
  /** D06 — «عندها ٢ من ٣». Never a percentage. */
  readonly covers: readonly [number, number];
  readonly complete: boolean;
  /** Total for the lines this offer can actually supply. An offer that fills
   *  two of three lines must not be compared on a total that pretends it
   *  filled all three. */
  readonly totalMinor: number;
  readonly hasSubstitution: boolean;
  /** Lines this offer cannot supply, so R8 can say which rather than only how
   *  many — the patient's question is always "which one is missing". */
  readonly missing: readonly string[];
};

export function summarise(offer: Offer, requestedLineIds: readonly string[]): OfferSummary {
  const available = offer.lines.filter((l) => l.answer.kind !== "unavailable");
  const missing = offer.lines.filter((l) => l.answer.kind === "unavailable").map((l) => l.itemName);
  const totalMinor = available.reduce(
    (sum, l) => sum + (l.answer.kind === "unavailable" ? 0 : l.answer.priceMinor), 0);
  return {
    offer,
    covers: Marketplace.coverage(available.length, requestedLineIds.length),
    complete: available.length === requestedLineIds.length,
    totalMinor,
    hasSubstitution: offer.lines.some((l) => l.answer.kind === "substitute"),
    missing,
  };
}

/**
 * The order the list is READ in — deliberately not a ranking.
 *
 * D12 forbids ranking, weighting and paid placement, and this respects that:
 * the order is derived only from two facts printed on every row, so a patient
 * can check it themselves. Coverage first because an offer that cannot supply
 * the medicine is not cheaper, it is incomplete. Price second. Ties keep
 * arrival order, so nothing is reshuffled while the patient is reading.
 */
export function forReading(summaries: readonly OfferSummary[]): readonly OfferSummary[] {
  return summaries.map((s, i) => ({ s, i })).sort((a, b) => {
    const coverage = b.s.covers[0] - a.s.covers[0];
    if (coverage !== 0) return coverage;
    if (a.s.totalMinor !== b.s.totalMinor) return a.s.totalMinor - b.s.totalMinor;
    return a.i - b.i;
  }).map(({ s }) => s);
}

/** Only an offer still in `sent` may be chosen. §6 Offer makes withdrawal the
 *  correction path for a mistyped binding price, so an offer can leave the
 *  list between render and tap — R8's error state exists for exactly that. */
export const choosable = (o: Offer): boolean => o.state === "sent";

export function refusalFor(o: Offer): Refusal | null {
  switch (o.state) {
    case "sent": return null;
    case "withdrawn": return { code: "OFFER_WITHDRAWN" };
    case "expired": return { code: "OFFER_EXPIRED" };
    case "accepted": return { code: "ALREADY_ACCEPTED" };
    case "not_chosen": return { code: "OFFER_EXPIRED" };
  }
}

/**
 * Accepting. The domain decides what the acceptance covers and whether a child
 * request is created (D06); this only carries the answer.
 */
export type Acceptance = {
  readonly offerId: string;
  readonly outcome: Marketplace.AcceptanceOutcome;
  /** D06 — the lines this offer could not fill become a child request
   *  automatically, so the patient never re-enters a line. */
  readonly createsChildRequest: boolean;
};

export function accept(
  offer: Offer,
  requestedLineIds: readonly string[],
): { readonly ok: true; readonly acceptance: Acceptance } | { readonly ok: false; readonly refusal: Refusal } {
  const stale = refusalFor(offer);
  if (stale) return { ok: false, refusal: stale };

  const filled = offer.lines.filter((l) => l.answer.kind !== "unavailable").map((l) => l.requestLineId);
  const outcome = Marketplace.accept(requestedLineIds, filled);
  if (isErr(outcome)) return { ok: false, refusal: outcome.error };

  return {
    ok: true,
    acceptance: {
      offerId: offer.offerId,
      outcome: outcome.value,
      createsChildRequest: outcome.value.childRequestLineIds.length > 0,
    },
  };
}

/**
 * Prices are IQD, formatted once here so no screen invents a second way to
 * write money.
 *
 * Exact, never rounded. The first version rounded to the nearest thousand and
 * displayed 8,500 as "9 ألف" — a price the patient would not be charged, and
 * on a screen whose whole purpose is comparing prices. It also made the stated
 * ordering unverifiable, because two different totals printed identically.
 */
export const formatPrice = (minor: number): string =>
  `${minor.toLocaleString("en-US")} دينار`;

/** Rough distance, worded the way a person would say it rather than to the
 *  metre — a false precision on a district centroid would be a claim we cannot
 *  honour (§4 F5). */
export function describeDistance(metres: number): string {
  if (metres < 500) return "قريبة منك";
  if (metres < 1500) return "أقل من كيلومتر";
  return `حوالي ${Math.round(metres / 1000)} كم`;
}

/** D11 — the band, worded. Never a number, and «جديدة» is not a criticism. */
export function describeHonoured(band: Marketplace.HonouredBand | null): { readonly says: string; readonly tone: "good" | "neutral" | "caution" } {
  switch (band) {
    case "trusted": return { says: "تلتزم بالحجز", tone: "good" };
    case "needs_attention": return { says: "أحياناً ما تلتزم بالحجز", tone: "caution" };
    case "new": return { says: "جديدة على التطبيق", tone: "neutral" };
    case null: return { says: "جديدة على التطبيق", tone: "neutral" };
  }
}

/** D09 — offers stop being choosable when the request window closes. */
export const windowClosed = (windowEndsAt: Instant | null, now: Instant): boolean =>
  windowEndsAt !== null && now >= windowEndsAt;
