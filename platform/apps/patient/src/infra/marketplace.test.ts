/**
 * @blueprint §4 R8 · §4 R9/R10 · D06 · D39 · POST /v1/offers/{id}/accept
 * @owner marketplace-engine
 * @why This is the call that turns a comparison into a commitment: a pharmacy
 *      sets medicine aside on the strength of it and a patient walks to a
 *      counter expecting it. Two things must hold no matter what the server
 *      says — the two 409s stay distinguishable, because they are different
 *      events to the person reading the screen, and a reservation that cannot
 *      be drawn in full is never half-drawn, because a code that does not work
 *      at the counter is worse than being told the hold did not go through.
 */
import { describe, expect, it } from "vitest";
import { makeMarketplace } from "./marketplace.js";
import { makeHttp, type Fetch } from "./http.js";

const reply = (status: number, body: unknown): Fetch =>
  (async () => ({ status, text: async () => JSON.stringify(body) })) as never;

const accept = (status: number, body: unknown) =>
  makeMarketplace(makeHttp("https://api", reply(status, body))).accept("o1", ["l1"], false, "key-1");

const RESERVATION = {
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
  branchPhone: "07701234567", address: "الكرادة، شارع ٦٢", confirmedAt: 1_000, expiresAt: 5_000,
  totalMinor: 9_000, lines: [{ itemName: "بانادول", packs: 1, priceMinor: 9_000 }],
};

describe("a hold the patient can actually collect", () => {
  it("a 201 becomes a hold with everything V2 draws", async () => {
    const got = await accept(201, { reservation: RESERVATION });
    if (got.kind !== "fresh" || got.value.kind !== "held") throw new Error("expected a hold");
    expect(got.value.hold.code).toBe("4KD2P9");
    expect(got.value.hold.expiresAt).toBe(5_000);
    expect(got.value.hold.lines).toHaveLength(1);
    expect(got.value.childRequestId).toBeNull();
  });

  it("a child request is carried when D06 created one", async () => {
    // A refused substitution goes to a child request, and the patient is owed
    // the fact that the rest of their order is still being looked for.
    const got = await accept(201, { reservation: RESERVATION, childRequestId: "req-2" });
    if (got.kind !== "fresh" || got.value.kind !== "held") throw new Error("expected a hold");
    expect(got.value.childRequestId).toBe("req-2");
  });

  it("a reservation with no code is refused, not shown", async () => {
    // V2 is the screen Blueprint v3 says must never fail. A hold with no code
    // is a screen that sends someone to a counter with nothing to say.
    const { code: _drop, ...codeless } = RESERVATION;
    const got = await accept(201, { reservation: codeless });
    expect(got.kind).toBe("failed");
  });

  it("a reservation with no expiry is refused", async () => {
    // The countdown is the patient's whole sense of how long they have. From
    // nothing it either vanishes or counts from zero.
    const { expiresAt: _drop, ...forever } = RESERVATION;
    const got = await accept(201, { reservation: forever });
    expect(got.kind).toBe("failed");
  });

  it("a line missing its price takes the whole hold with it", async () => {
    // Dropping the line would show a patient a total they cannot reconcile
    // with the items listed under it — at a counter, holding the difference.
    const got = await accept(201, { reservation: { ...RESERVATION, lines: [{ itemName: "بانادول", packs: 1 }] } });
    expect(got.kind).toBe("failed");
  });
});

describe("every declared refusal stays itself", () => {
  it("withdrawn and expired are not the same 409", async () => {
    // Same status, different events: a pharmacy took the offer back, or the
    // patient took too long. R8 names which, and it cannot if the port does
    // not keep them apart.
    const withdrawn = await accept(409, { error: "offer_withdrawn" });
    const expired = await accept(409, { error: "offer_expired" });
    expect(withdrawn.kind === "fresh" && withdrawn.value.kind).toBe("withdrawn");
    expect(expired.kind === "fresh" && expired.value.kind).toBe("expired");
  });

  it("an unacknowledged substitution is its own answer (§4 R10)", async () => {
    const got = await accept(400, { error: "substitution_not_acknowledged" });
    expect(got.kind === "fresh" && got.value.kind).toBe("substitutionNotAcknowledged");
  });

  it("a 404 says only that it is not there for you", async () => {
    // §2 of the API rules: a missing offer and a forbidden one answer
    // identically, so no lookup becomes an identity oracle. The port cannot
    // and must not distinguish them.
    const got = await accept(404, { error: "not_found_or_not_yours" });
    expect(got.kind === "fresh" && got.value.kind).toBe("gone");
  });

  it("a refusal the contract does not list is a transport failure, not a fifth outcome", async () => {
    const got = await accept(409, { error: "branch_on_fire" });
    expect(got.kind).toBe("failed");
  });

  it("a dropped connection is a failure, never a refusal", async () => {
    // D39's V4 is a pharmacy saying no. Telling a patient their pharmacy
    // declined because the network dropped would invent a rejection.
    const got = await accept(503, {});
    expect(got.kind).toBe("failed");
  });

  it("a replay returns the original hold rather than reading as an error", async () => {
    // The contract's third rule: replaying a state-changing call returns the
    // original result. Treating the duplicate as a failure is how a patient is
    // told the hold failed on the retry that actually worked.
    const got = await accept(409, { reservation: RESERVATION });
    expect(got.kind === "fresh" && got.value.kind).toBe("held");
  });
});
