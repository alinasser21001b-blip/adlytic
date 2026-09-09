/**
 * What Today is allowed to say, and what it must never say.
 *
 * The rule under test is §22's: the two empties are opposite screens, and the
 * expensive mistake is reaching the reassuring one by accident. «كل شي تمام —
 * ما عندك شي يحتاج انتباهك هسه» in front of a patient whose hold we simply
 * failed to load is the app telling them to stay home while their medicine
 * goes back on the shelf.
 */
import { describe, expect, it } from "vitest";
import { instant } from "@dawai/domain";

import type { Hold, ReservationView } from "./reservation.js";
import * as Today from "./today.js";

const AT = 1_000_000;

const hold = (over: Partial<Hold> = {}): Hold => ({
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
  branchPhone: "07701234567", address: "الكرادة",
  confirmedAt: instant(AT), expiresAt: instant(AT + 2 * 60 * 60_000),
  totalMinor: 9_000, lines: [{ itemName: "بانادول", packs: 1, priceMinor: 4_000 }],
  ...over,
});

describe("Today, from the record", () => {
  it("teaches when there is nothing at all — never reassures", () => {
    expect(Today.fromReservation(null)).toEqual({ kind: "new" });
  });

  it("shows a live hold, and shows the hold itself rather than a summary of one", () => {
    const h = hold();
    expect(Today.fromReservation({ kind: "held", hold: h })).toEqual({ kind: "held", hold: h });
    expect(Today.holdOf(Today.fromReservation({ kind: "held", hold: h }))).toBe(h);
  });

  it("a hold still being asked for is not «nothing needs you»", () => {
    // V1 declares back: none, so this is not reachable in this build — which
    // is exactly why it is asserted: the cheap way to make the union total was
    // to fold it into `quiet`, and that would be Today reporting a hold in
    // flight as a calm day.
    const t = Today.fromReservation({ kind: "requesting", branchName: "صيدلية الرشيد" });
    expect(t).toEqual({ kind: "pending", branchName: "صيدلية الرشيد" });
  });

  it("a record with nothing live in it is the QUIET empty, not the teaching one", () => {
    const finished: readonly ReservationView[] = [
      { kind: "collected", hold: hold() },
      { kind: "expired", hold: hold() },
      { kind: "refused", branchName: "صيدلية الرشيد", reopened: true },
      { kind: "cancelled" },
    ];
    for (const r of finished) expect(Today.fromReservation(r)).toEqual({ kind: "quiet" });
  });

  it("neither empty carries a hold, so no state can draw a card it does not have", () => {
    expect(Today.holdOf(Today.brandNew())).toBeNull();
    expect(Today.holdOf(Today.quiet())).toBeNull();
    expect(Today.holdOf(Today.loading())).toBeNull();
  });
});

describe("a failure never takes the hold away with it", () => {
  it("offline keeps the hold and remembers when it was true", () => {
    const t = Today.cached(hold(), instant(AT));
    expect(Today.holdOf(t)).not.toBeNull();
    expect(t).toMatchObject({ kind: "cached", asOf: AT });
  });

  it("a failed refresh keeps whatever was already on screen (§23 workPreserved)", () => {
    expect(Today.holdOf(Today.failed(hold()))).not.toBeNull();
  });

  it("and says so honestly when the cache genuinely holds nothing", () => {
    // `hold: null` is "we have no hold cached", which is a different claim
    // from "you have no hold" — the screen draws the banner and no card.
    expect(Today.holdOf(Today.cached(null, instant(AT)))).toBeNull();
    expect(Today.holdOf(Today.failed(null))).toBeNull();
  });
});
