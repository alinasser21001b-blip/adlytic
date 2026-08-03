/**
 * @blueprint §4 R7 · §6 Offer · D06 · D11 · D19 · GET /v1/requests/{id}
 * @owner marketplace-engine
 * @why An offer is the one thing in this product a patient AGREES to: a price
 *      they will pay, a pharmacy they will walk to, and sometimes a different
 *      medicine than the one they asked for. Every field the app cannot read
 *      is a field a screen would print as «undefined» or silently treat as
 *      absent, and the catalogue port has already shown what that costs — a
 *      row missing `isControlled` was gated as allowed.
 */
import { describe, expect, it } from "vitest";
import { makeRequests } from "./requests.js";
import { makeHttp, type Fetch } from "./http.js";

const reply = (status: number, body: unknown): Fetch =>
  (async () => ({ status, text: async () => JSON.stringify(body) })) as never;

const port = (status: number, body: unknown) => makeRequests(makeHttp("https://api", reply(status, body)));

const line = (over: Record<string, unknown> = {}) => ({
  requestLineId: "l1", itemName: "بانادول", latinName: "Panadol",
  answer: { kind: "available", priceMinor: 3_000 }, ...over,
});

const offer = (over: Record<string, unknown> = {}) => ({
  offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
  distanceM: 800, honoured: "trusted", state: "sent", openNow: true, lines: [line()], ...over,
});

const read = (status: number, body: unknown) => port(status, body).read("req-1");

describe("the responders breakdown, as the contract states it", () => {
  it("carries asked, replied and thinking", async () => {
    const got = await read(200, { responders: { asked: 5, replied: 2, thinking: 3 }, offers: [] });
    expect(got.kind).toBe("fresh");
    if (got.kind !== "fresh") return;
    expect(got.value.responders).toEqual({ asked: 5, replied: 2, thinking: 3 });
  });

  it("a missing count is zero, never NaN", async () => {
    // R7 renders these. `undefined - 0` printed as NaN is a number a patient
    // reads on a screen built to reduce their anxiety.
    const got = await read(200, { offers: [] });
    expect(got.kind).toBe("fresh");
    if (got.kind !== "fresh") return;
    expect(got.value.responders).toEqual({ asked: 0, replied: 0, thinking: 0 });
  });

  it("a failed read is a failure, not an empty list of offers", async () => {
    // Answering `fresh` with zero offers would tell a patient that nobody
    // replied, which is a different and much worse statement than "we could
    // not check".
    const got = await read(503, {});
    expect(got.kind).toBe("failed");
  });
});

describe("an offer the app cannot read is not shown", () => {
  it("a complete offer arrives intact", async () => {
    const got = await read(200, { responders: {}, offers: [offer()] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(1);
    expect(got.value.offers[0]!.branchName).toBe("صيدلية الرشيد");
  });

  it("an absent honoured band becomes the null D11 defines", async () => {
    // D11 gives three bands and null for too-few-samples. Absent and null mean
    // the same thing, and nothing downstream should have to know both shapes.
    const { honoured: _drop, ...noBand } = offer();
    const got = await read(200, { responders: {}, offers: [noBand] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers[0]!.honoured).toBeNull();
  });

  it("an invented honoured band is refused", async () => {
    // D11 replaced a decimal score with three bands precisely so a patient
    // reads a claim the platform stands behind. A fourth band is not one.
    const got = await read(200, { responders: {}, offers: [offer({ honoured: "excellent" })] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("a substitute with no name is dropped, not rendered", async () => {
    // R9 asks the patient to consent to a DIFFERENT medicine by name. Without
    // one the screen would ask them to agree to «undefined».
    const nameless = offer({
      lines: [line({
        answer: { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة الفعالة" },
        substituteLatinName: "Cetamol",
        proposedBy: { name: "د. أحمد", licenceVerified: true, branchName: "صيدلية الرشيد" },
      })],
    });
    const got = await read(200, { responders: {}, offers: [nameless] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("a substitute with no author is dropped (D19)", async () => {
    // A substitution may only be proposed by a verified pharmacist, and a
    // clinical claim with no author is one a patient cannot weigh.
    const anonymous = offer({
      lines: [line({
        answer: { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة" },
        substituteName: "سيتامول", substituteLatinName: "Cetamol",
      })],
    });
    const got = await read(200, { responders: {}, offers: [anonymous] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("an author whose licence status is missing is dropped, not assumed unverified", async () => {
    // Absent is not false. The screen may only say «صيدلي مُجاز» when the
    // record says so — and may not quietly downgrade an author it cannot read.
    const unknownLicence = offer({
      lines: [line({
        answer: { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة" },
        substituteName: "سيتامول", substituteLatinName: "Cetamol",
        proposedBy: { name: "د. أحمد", branchName: "صيدلية الرشيد" },
      })],
    });
    const got = await read(200, { responders: {}, offers: [unknownLicence] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("an available line with no price is dropped", async () => {
    const free = offer({ lines: [line({ answer: { kind: "available" } })] });
    const got = await read(200, { responders: {}, offers: [free] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("an offer in a state §6 does not define is dropped", async () => {
    // `choosable` reads this to decide whether the patient may still accept.
    // A state nobody defined would be neither choosable nor withdrawn.
    const got = await read(200, { responders: {}, offers: [offer({ state: "pondering" })] });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toHaveLength(0);
  });

  it("one unreadable offer does not take the readable ones with it", async () => {
    const got = await read(200, {
      responders: {},
      offers: [offer({ offerId: "bad", state: "pondering" }), offer({ offerId: "good" })],
    });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers.map((o) => o.offerId)).toEqual(["good"]);
  });

  it("offers that are not an array are no offers, not a crash", async () => {
    const got = await read(200, { responders: {}, offers: "soon" });
    if (got.kind !== "fresh") throw new Error("expected fresh");
    expect(got.value.offers).toEqual([]);
  });
});
