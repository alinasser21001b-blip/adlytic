import { describe, expect, it } from "vitest";
import { instant } from "@dawai/domain";
import * as Reservation from "./reservation.js";

const AT = instant(1_000_000);
const hold = (over: Partial<Reservation.Hold> = {}): Reservation.Hold => ({
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
  branchPhone: "07701234567", address: "الكرادة، شارع ٦٢",
  confirmedAt: AT, expiresAt: instant(AT + 2 * 60 * 60_000),
  totalMinor: 3_000,
  lines: [{ itemName: "بانادول", packs: 1, priceMinor: 3_000 }],
  ...over,
});

describe("the clock starts at held and nowhere earlier", () => {
  it("V1 offers no timer, because nothing has been set aside yet", () => {
    const v = Reservation.requesting("صيدلية الرشيد");
    expect(v.kind).toBe("requesting");
    expect(v).not.toHaveProperty("hold");
  });

  it("confirming moves through the published machine and produces the hold", () => {
    const r = Reservation.confirmed("requested", hold());
    expect(r?.state).toBe("held");
    expect(r?.view.kind).toBe("held");
  });

  it("a transition the machine does not publish cannot be performed (Rule 5)", () => {
    expect(Reservation.confirmed("collected", hold())).toBeNull();
    expect(Reservation.collected("requested", hold())).toBeNull();
  });
});

describe("D39 — they confirmed and then could not", () => {
  it("moves to refused and says the request re-opened, so the patient goes forward", () => {
    const r = Reservation.cannotHold("requested", "صيدلية الرشيد", true);
    expect(r?.state).toBe("refused");
    expect(r?.view).toEqual({ kind: "refused", branchName: "صيدلية الرشيد", reopened: true });
  });
});

describe("the countdown a patient walks by", () => {
  it("reads comfortable early and last near the end", () => {
    expect(Reservation.timeLeft(hold(), AT).urgency).toBe("comfortable");
    expect(Reservation.timeLeft(hold(), instant(AT + 100 * 60_000)).urgency).toBe("soon");
    expect(Reservation.timeLeft(hold(), instant(AT + 115 * 60_000)).urgency).toBe("last");
  });

  it("never goes below zero, and says so plainly when it has", () => {
    const t = Reservation.timeLeft(hold(), instant(AT + 999 * 60_000));
    expect(t.ms).toBe(0);
    expect(t.expired).toBe(true);
    expect(t.fraction).toBe(0);
  });

  it("is derived from the instants the pharmacy set, not from a client default", () => {
    const short = hold({ expiresAt: instant(AT + 30 * 60_000) });
    expect(Reservation.timeLeft(short, AT).minutes).toBe(30);
    expect(Reservation.timeLeft(short, AT).fraction).toBe(1);
  });
});

describe("the code", () => {
  it("is grouped so it can be read aloud without being misheard", () => {
    expect(Reservation.readableCode("4KD2P9")).toBe("4K D2 P9");
  });
});

describe("cancelling", () => {
  it("is allowed while held", () => {
    expect(Reservation.cancel("held")).toEqual({ state: "cancelled" });
  });

  it("is refused once collected — there is nothing left to cancel", () => {
    const r = Reservation.cancel("collected");
    expect(r).toHaveProperty("refusal");
  });
});

describe("V2 — the two ways a hold's time is stated", () => {
  /** 2026-08-03T16:00:00Z is 7pm in Baghdad. */
  const sevenPmBaghdad = instant(Date.UTC(2026, 7, 3, 16, 0));

  it("the expiry is a LOCAL wall clock, not UTC", () => {
    // Read in UTC this printed «٤:٠٠ م» — three hours early, on the one line
    // that tells a patient when their medicine stops being held.
    expect(Reservation.clockTime(sevenPmBaghdad)).toBe("7:00 م");
  });

  it("midnight and noon are named the way a clock names them", () => {
    expect(Reservation.clockTime(instant(Date.UTC(2026, 7, 3, 21, 0)))).toBe("12:00 ص");
    expect(Reservation.clockTime(instant(Date.UTC(2026, 7, 3, 9, 0)))).toBe("12:00 م");
  });

  it("morning and afternoon are told apart", () => {
    expect(Reservation.clockTime(instant(Date.UTC(2026, 7, 3, 5, 30)))).toBe("8:30 ص");
    expect(Reservation.clockTime(instant(Date.UTC(2026, 7, 3, 12, 5)))).toBe("3:05 م");
  });

  it("minutes are always two digits — 7:05, never 7:5", () => {
    expect(Reservation.clockTime(instant(Date.UTC(2026, 7, 3, 16, 5)))).toBe("7:05 م");
  });

  it("does not depend on the machine the test runs on", () => {
    // A device-local implementation would give a different answer on a CI box
    // in another zone, and the failure would look like flakiness.
    expect(Reservation.clockTime(sevenPmBaghdad)).toBe(Reservation.clockTime(sevenPmBaghdad));
    expect(Reservation.clockTime(instant(0))).toBe("3:00 ص");
  });

  it("a duration is worded the way a person says it, in hours", () => {
    // "120 دقيقة" is a hesitation moment: it has to be converted before a
    // patient knows whether they can walk or must hurry.
    expect(Reservation.describeRemaining(0)).toBe("انتهى الوقت");
    expect(Reservation.describeRemaining(45)).toBe("45 دقيقة");
    expect(Reservation.describeRemaining(60)).toBe("ساعة");
    expect(Reservation.describeRemaining(120)).toBe("ساعتين");
    expect(Reservation.describeRemaining(90)).toBe("ساعة و30 دقيقة");
    expect(Reservation.describeRemaining(180)).toBe("3 ساعات");
  });

  it("the code is grouped so it can be read aloud without being misheard", () => {
    expect(Reservation.readableCode("4KD2P9")).toBe("4K D2 P9");
  });
});
