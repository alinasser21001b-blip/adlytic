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
