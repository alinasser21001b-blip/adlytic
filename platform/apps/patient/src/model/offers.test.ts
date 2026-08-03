import { describe, expect, it } from "vitest";
import * as Offers from "./offers.js";

const line = (id: string, name: string, answer: Offers.OfferLine["answer"]): Offers.OfferLine =>
  ({ requestLineId: id, itemName: name, answer } as Offers.OfferLine);

const offer = (over: Partial<Offers.Offer> = {}): Offers.Offer => ({
  offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
  distanceM: 800, honoured: "trusted", state: "sent", openNow: true,
  lines: [line("l1", "بانادول", { kind: "available", priceMinor: 3_000 })],
  ...over,
});

describe("what an offer covers", () => {
  it("counts only the lines it can actually supply, and names the ones it cannot", () => {
    const s = Offers.summarise(offer({
      lines: [
        line("l1", "بانادول", { kind: "available", priceMinor: 3_000 }),
        line("l2", "أموكسيسيلين", { kind: "unavailable", reason: "out_of_stock" }),
      ],
    }), ["l1", "l2"]);

    expect(s.covers).toEqual([1, 2]);
    expect(s.complete).toBe(false);
    // «عندها ٢ من ٣», never a percentage.
    expect(s.missing).toEqual(["أموكسيسيلين"]);
  });

  it("totals only what it supplies — a partial offer is not cheaper, it is partial", () => {
    const s = Offers.summarise(offer({
      lines: [
        line("l1", "بانادول", { kind: "available", priceMinor: 3_000 }),
        line("l2", "أموكسيسيلين", { kind: "unavailable", reason: "not_carried" }),
      ],
    }), ["l1", "l2"]);
    expect(s.totalMinor).toBe(3_000);
  });

  it("a substitution counts as covered and is flagged, because it needs consent", () => {
    const s = Offers.summarise(offer({
      lines: [line("l1", "بانادول", { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة" })],
    }), ["l1"]);
    expect(s.complete).toBe(true);
    expect(s.hasSubstitution).toBe(true);
  });
});

describe("reading order is not a ranking (D12)", () => {
  const summaries = (offers: readonly Offers.Offer[]) =>
    Offers.forReading(offers.map((o) => Offers.summarise(o, ["l1", "l2"])));

  const two = (id: string, prices: readonly (number | null)[]) => offer({
    offerId: id,
    lines: prices.map((p, i) => p === null
      ? line(`l${i + 1}`, `دواء ${i + 1}`, { kind: "unavailable", reason: "out_of_stock" })
      : line(`l${i + 1}`, `دواء ${i + 1}`, { kind: "available", priceMinor: p })),
  });

  it("an offer that covers more is read first — incomplete is not cheaper", () => {
    const out = summaries([two("cheap-partial", [1_000, null]), two("full", [9_000, 9_000])]);
    expect(out[0]!.offer.offerId).toBe("full");
  });

  it("equal coverage reads cheapest first", () => {
    const out = summaries([two("dear", [9_000, 9_000]), two("cheap", [4_000, 4_000])]);
    expect(out[0]!.offer.offerId).toBe("cheap");
  });

  it("a tie keeps arrival order, so nothing reshuffles while it is being read", () => {
    const out = summaries([two("first", [5_000, 5_000]), two("second", [5_000, 5_000])]);
    expect(out.map((o) => o.offer.offerId)).toEqual(["first", "second"]);
  });

  it("orders on facts printed on the row and nothing else — no score exists", () => {
    // The honoured band and distance differ wildly; neither moves the order.
    const a = { ...two("a", [5_000, 5_000]), honoured: "needs_attention" as const, distanceM: 50 };
    const b = { ...two("b", [5_000, 5_000]), honoured: "trusted" as const, distanceM: 9_000 };
    expect(summaries([a, b]).map((o) => o.offer.offerId)).toEqual(["a", "b"]);
  });
});

describe("choosing an offer", () => {
  it("reserves the lines it fills and creates a child request for the rest (D06)", () => {
    const r = Offers.accept(offer({
      lines: [
        line("l1", "بانادول", { kind: "available", priceMinor: 3_000 }),
        line("l2", "أموكسيسيلين", { kind: "unavailable", reason: "out_of_stock" }),
      ],
    }), ["l1", "l2"]);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.acceptance.outcome.reservedLineIds).toEqual(["l1"]);
    expect(r.acceptance.outcome.childRequestLineIds).toEqual(["l2"]);
    expect(r.acceptance.createsChildRequest).toBe(true);
  });

  it("a complete offer creates no child request", () => {
    const r = Offers.accept(offer(), ["l1"]);
    expect(r.ok && r.acceptance.createsChildRequest).toBe(false);
  });

  it("an offer withdrawn between render and tap refuses with its own reason", () => {
    const r = Offers.accept(offer({ state: "withdrawn" }), ["l1"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("OFFER_WITHDRAWN");
  });

  it("an expired offer is not choosable and says so", () => {
    expect(Offers.choosable(offer({ state: "expired" }))).toBe(false);
    expect(Offers.refusalFor(offer({ state: "expired" }))?.code).toBe("OFFER_EXPIRED");
  });

  it("an offer that supplies nothing cannot be accepted", () => {
    const r = Offers.accept(offer({
      lines: [line("l1", "بانادول", { kind: "unavailable", reason: "cannot_supply" })],
    }), ["l1"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("NOTHING_ACCEPTED");
  });
});

describe("how facts are worded", () => {
  it("reliability is a band, never a number (D11)", () => {
    expect(Offers.describeHonoured("trusted").says).toBe("تلتزم بالحجز");
    // A new branch is described, not criticised.
    expect(Offers.describeHonoured(null)).toEqual({ says: "جديدة على التطبيق", tone: "neutral" });
    expect(Offers.describeHonoured("needs_attention").tone).toBe("caution");
  });

  it("distance is rough, because the position it comes from is a district centroid", () => {
    expect(Offers.describeDistance(300)).toBe("قريبة منك");
    expect(Offers.describeDistance(900)).toBe("أقل من كيلومتر");
    expect(Offers.describeDistance(4_200)).toBe("حوالي 4 كم");
  });

  it("money is exact — a rounded price is a price the patient will not be charged", () => {
    expect(Offers.formatPrice(3_000)).toBe("3,000 د.ع");
    expect(Offers.formatPrice(8_500)).toBe("8,500 د.ع");
    // Two different totals must never print identically on a screen whose
    // purpose is comparing them.
    expect(Offers.formatPrice(8_500)).not.toBe(Offers.formatPrice(9_000));
  });
});

describe("D09 — a closed window reaches the client as the offer's own state", () => {
  it("every non-`sent` state refuses, so a closed window cannot be accepted", () => {
    // The server closes the window by moving each offer's state; the accept
    // endpoint declares no window error. These four ARE the closed window.
    for (const state of ["withdrawn", "expired", "not_chosen", "accepted"] as const)
      expect(Offers.refusalFor(offer({ state })), state).not.toBeNull();
    expect(Offers.refusalFor(offer({ state: "sent" }))).toBeNull();
  });

  it("accept refuses a closed offer before it looks at the lines", () => {
    // Even a perfectly valid line selection cannot get past a stale offer.
    const r = Offers.accept(offer({ state: "expired" }), ["l1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.code).toBe("OFFER_EXPIRED");
  });

  it("a not_chosen offer reads as expired to the patient, not as a rejection", () => {
    // «انتهى وقت هذا العرض» — the window closed, which is not the same as the
    // pharmacy having refused them.
    expect(Offers.refusalFor(offer({ state: "not_chosen" }))?.code).toBe("OFFER_EXPIRED");
  });
});

describe("D19 — a substitution carries its author across to consent", () => {
  /** A real substitute line, not a cast: the type requires substituteName,
   *  substituteLatinName and proposedBy, and a fixture that omits them tests a
   *  shape the product cannot produce. */
  const sub = (): Offers.OfferLine => ({
    requestLineId: "l2", itemName: "بانادول", latinName: "Panadol",
    answer: { kind: "substitute", priceMinor: 2_500, itemId: "x1", note: "نفس المادة الفعالة" },
    substituteName: "سيتامول", substituteLatinName: "Cetamol",
    proposedBy: { name: "د. أحمد", licenceVerified: true, branchName: "صيدلية الرشيد" },
  });

  it("recognises a substitution through the nested discriminant", () => {
    // Narrowing `l.answer.kind` inline stopped working the moment a second
    // variant gained a field, which is why the guard exists.
    expect(Offers.isSubstitute(sub())).toBe(true);
    expect(Offers.isSubstitute(line("l1", "بانادول", { kind: "available", priceMinor: 3_000 }))).toBe(false);
    expect(Offers.isSubstitute(line("l3", "دواء", { kind: "unavailable", reason: "out_of_stock" }))).toBe(false);
  });

  it("derives only the substituted lines, in the shape consent needs", () => {
    const o = offer({ lines: [
      line("l1", "بانادول", { kind: "available", priceMinor: 3_000 }),
      sub(),
      line("l3", "دواء", { kind: "unavailable", reason: "out_of_stock" }),
    ] });
    const subs = Offers.substitutionsOf(o);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.requestLineId).toBe("l2");
    expect(subs[0]!.requestedName).toBe("بانادول");
    expect(subs[0]!.offeredName).toBe("سيتامول");
  });

  it("carries the pharmacist's note VERBATIM — the app never paraphrases a clinical statement", () => {
    const subs = Offers.substitutionsOf(offer({ lines: [sub()] }));
    expect(subs[0]!.pharmacistNote).toBe("نفس المادة الفعالة");
  });

  it("carries the author through — a clinical claim with no author cannot be weighed", () => {
    // D19: the substitution is proposed by a named pharmacist whose licence
    // status the patient can see. Dropping it here would strip the one thing
    // R9 needs to show.
    const subs = Offers.substitutionsOf(offer({ lines: [sub()] }));
    expect(subs[0]!.proposedBy).toEqual({ name: "د. أحمد", licenceVerified: true, branchName: "صيدلية الرشيد" });
  });

  it("an offer with no substitution yields none", () => {
    expect(Offers.substitutionsOf(offer())).toEqual([]);
  });
});
