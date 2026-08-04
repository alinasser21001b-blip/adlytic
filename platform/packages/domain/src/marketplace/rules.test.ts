/**
 * @blueprint §8 · D06 · D07 · D09 · D11 · D12
 * @owner marketplace-engine
 * @why These are the six quantities the independent review said a build team
 *      would otherwise invent. Each test pins one to the value Blueprint v3
 *      fixed, so a later change is a deliberate product decision rather than a
 *      drift nobody noticed.
 */
import { describe, it, expect } from "vitest";
import {
  windowFor, windowEndsAt, packs, checkLineCount, MAX_REQUEST_LINES,
  route, refusalCounts, honouredBand, REFUSAL_GRACE_MS, HONOURED_MIN_SAMPLE,
  checkAnswer, accept, coverage, type BranchEligibilityFacts,
} from "./rules.js";
import { instant, MINUTE, HOUR, DAY } from "../shared/instant.js";
import { isOk, isErr } from "../shared/result.js";
import { REFUSAL } from "../shared/refusal.js";

describe("D09 — request windows are exactly three values", () => {
  it("now is 20 minutes", () => expect(windowFor("now")).toBe(20 * MINUTE));
  it("today is 4 hours", () => expect(windowFor("today")).toBe(4 * HOUR));
  it("soon is 48 hours, not a week", () => expect(windowFor("soon")).toBe(2 * DAY));
  it("the window end is computed from the send instant, never a device clock", () => {
    const sent = instant(1_000_000);
    expect(windowEndsAt(sent, "now")).toBe(sent + 20 * MINUTE);
  });
});

describe("D07 — the unit of quantity is the pack", () => {
  it("accepts whole packs", () => expect(isOk(packs(3))).toBe(true));
  it("refuses zero", () => expect(isErr(packs(0))).toBe(true));
  it("refuses a fraction — there is no half pack in Phase 0", () => expect(isErr(packs(1.5))).toBe(true));
});

describe("§2 — a request carries one to eight lines", () => {
  it("refuses none", () => expect(isErr(checkLineCount(0))).toBe(true));
  it("accepts the maximum", () => expect(isOk(checkLineCount(MAX_REQUEST_LINES))).toBe(true));
  it("refuses one over", () => {
    const r = checkLineCount(MAX_REQUEST_LINES + 1);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.TOO_MANY_LINES);
  });
});

describe("§8 — routing: five rules, no ranking, and always a reason", () => {
  const eligible: BranchEligibilityFacts = {
    verifiedWithCurrentLicence: true, coversDistrict: true, openNow: true,
    opensWithinWindow: true, paused: false, atCapacity: false,
    marksAnyRequestedItemNotCarried: false,
  };
  it("routes an eligible open branch now", () => {
    expect(route(eligible)).toEqual({ routed: true, notifyAt: "now" });
  });
  it("D09 — a branch opening inside the window is routed, notified at opening", () => {
    expect(route({ ...eligible, openNow: false })).toEqual({ routed: true, notifyAt: "openingTime" });
  });
  it("excludes a branch closed beyond the window, with a reason", () => {
    expect(route({ ...eligible, openNow: false, opensWithinWindow: false }))
      .toEqual({ routed: false, reason: "closed" });
  });
  it("D13 — every exclusion names itself", () => {
    const cases: ReadonlyArray<[Partial<BranchEligibilityFacts>, string]> = [
      [{ verifiedWithCurrentLicence: false }, "not_verified"],
      [{ coversDistrict: false }, "outside_coverage"],
      [{ paused: true }, "paused"],
      [{ atCapacity: true }, "at_capacity"],
      [{ marksAnyRequestedItemNotCarried: true }, "not_carried"],
    ];
    for (const [patch, reason] of cases) {
      const d = route({ ...eligible, ...patch });
      expect(d.routed).toBe(false);
      if (!d.routed) expect(d.reason).toBe(reason);
    }
  });
  it("D12 — the decision carries no score, weight or rank", () => {
    expect(Object.keys(route(eligible))).toEqual(["routed", "notifyAt"]);
  });
});

describe("D11 — honoured rate", () => {
  const t0 = instant(0);
  it("a refusal at 4m59s does not count — the honest 'sold since' case", () => {
    expect(refusalCounts(t0, instant(REFUSAL_GRACE_MS - 1_000))).toBe(false);
  });
  it("a refusal at 5m01s counts", () => {
    expect(refusalCounts(t0, instant(REFUSAL_GRACE_MS + 1_000))).toBe(true);
  });
  it("is hidden below ten reservations", () => {
    expect(honouredBand(HONOURED_MIN_SAMPLE - 1, 0)).toBe("new");
  });
  it("returns a band, never a number", () => {
    expect(honouredBand(20, 0)).toBe("trusted");
    expect(honouredBand(15, 5)).toBe("needs_attention");
  });
});

describe("D08 — an answer must carry a price or a reason", () => {
  it("refuses an available line with no price", () => {
    expect(isErr(checkAnswer({ kind: "available", priceMinor: 0 }))).toBe(true);
  });
  it("refuses a substitution with no note", () => {
    expect(isErr(checkAnswer({ kind: "substitute", priceMinor: 100, itemId: "x", note: "  " }))).toBe(true);
  });
  it("accepts an unavailable line with one of the four reasons", () => {
    expect(isOk(checkAnswer({ kind: "unavailable", reason: "out_of_stock" }))).toBe(true);
  });
});

describe("D06 — accepting a subset creates a child request automatically", () => {
  const lines = ["l1", "l2", "l3"];
  it("splits accepted from unfilled, and the patient re-enters nothing", () => {
    const r = accept(lines, ["l1", "l3"]);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.reservedLineIds).toEqual(["l1", "l3"]);
      expect(r.value.childRequestLineIds).toEqual(["l2"]);
    }
  });
  it("accepting everything leaves no child request", () => {
    const r = accept(lines, lines);
    expect(isOk(r) && r.value.childRequestLineIds).toEqual([]);
  });
  it("refuses an empty acceptance", () => {
    expect(isErr(accept(lines, []))).toBe(true);
  });
  it("refuses a line that is not in the request — §5 rule 3 refusal", () => {
    const r = accept(lines, ["someone-elses-line"]);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.NOT_FOUND_OR_NOT_YOURS);
  });
  it("coverage is a count out of a count, never a percentage", () => {
    expect(coverage(2, 3)).toEqual([2, 3]);
  });
});
