// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  computeDaysOfCover,
  computeSkuTrust,
  REORDER_THRESHOLD_DAYS,
  SKU_TRUST_THRESHOLD,
} from "../services/clinical";

const DAY = 86_400_000;

describe("days-of-cover honesty gates", () => {
  const now = new Date("2026-08-01T09:00:00.000Z");

  it("suppresses prediction before a full dispense cycle exists", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s1",
      medicineName: "Amlodipine 5mg",
      quantityDispensed: null,
      dosesPerDay: 1,
      dispensedAt: null,
      takenCount: 0,
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressed).toBe(true);
    expect(cover.suppressionReason).toBe("NO_DISPENSE_CYCLE");
    expect(cover.daysRemaining).toBeNull();
  });

  it("suppresses when confirmed intake exceeds what was dispensed", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s2",
      medicineName: "Metformin 500mg",
      quantityDispensed: 30,
      dosesPerDay: 2,
      dispensedAt: new Date(now.getTime() - 10 * DAY),
      takenCount: 44, // patient has stock we don't know about
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressed).toBe(true);
    expect(cover.suppressionReason).toBe("CONFLICTING_DATA");
  });

  it("stays silent while a reorder nudge is snoozed", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s3",
      medicineName: "Glucophage",
      quantityDispensed: 30,
      dosesPerDay: 1,
      dispensedAt: new Date(now.getTime() - 26 * DAY),
      takenCount: 26,
      snoozedUntil: new Date(now.getTime() + 5 * DAY),
      now,
    });
    expect(cover.suppressed).toBe(true);
    expect(cover.suppressionReason).toBe("SNOOZED");
  });

  it("predicts run-out from confirmed intake and flags the reorder window", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s4",
      medicineName: "Amlodipine 5mg",
      quantityDispensed: 30,
      dosesPerDay: 1,
      dispensedAt: new Date(now.getTime() - 26 * DAY),
      takenCount: 26,
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressed).toBe(false);
    expect(cover.daysRemaining).toBe(4);
    expect(cover.daysRemaining! <= REORDER_THRESHOLD_DAYS).toBe(true);
    expect(cover.runsOutOn).not.toBeNull();
  });

  it("never returns a negative days-remaining once a pack is exhausted", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s5",
      medicineName: "Amlodipine 5mg",
      quantityDispensed: 30,
      dosesPerDay: 1,
      dispensedAt: new Date(now.getTime() - 60 * DAY),
      takenCount: 30,
      snoozedUntil: null,
      now,
    });
    expect(cover.daysRemaining).toBe(0);
    expect(cover.suppressed).toBe(false);
  });
});

describe("SKU trust gates passive-inventory forecasting", () => {
  const now = new Date("2026-08-01T09:00:00.000Z");

  it("keeps a freshly-tracked SKU below the forecast threshold", () => {
    const score = computeSkuTrust({
      movementCount: 3,
      lastCountedAt: null,
      lastVariance: 0,
      now,
    });
    expect(score).toBeLessThan(SKU_TRUST_THRESHOLD);
  });

  it("clears the threshold after dense movement plus a recent spot-count", () => {
    const score = computeSkuTrust({
      movementCount: 45,
      lastCountedAt: new Date(now.getTime() - 3 * DAY),
      lastVariance: 0,
      now,
    });
    expect(score).toBeGreaterThanOrEqual(SKU_TRUST_THRESHOLD);
  });

  it("drops a SKU out of forecasting after a large unexplained variance", () => {
    const score = computeSkuTrust({
      movementCount: 45,
      lastCountedAt: new Date(now.getTime() - 3 * DAY),
      lastVariance: 25,
      now,
    });
    expect(score).toBeLessThan(SKU_TRUST_THRESHOLD);
  });

  it("stays within [0,1] under adversarial inputs", () => {
    expect(
      computeSkuTrust({ movementCount: 10_000, lastCountedAt: now, lastVariance: 0, now }),
    ).toBeLessThanOrEqual(1);
    expect(
      computeSkuTrust({ movementCount: 0, lastCountedAt: null, lastVariance: 9_999, now }),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("regressions found by adversarial review", () => {
  const now = new Date("2026-08-01T09:00:00.000Z");

  it("does not assume one unit per dose (multi-tablet regimens)", () => {
    // 30 tablets, 2 tablets twice daily = 4 units/day => ~7 days, not 15.
    const cover = computeDaysOfCover({
      scheduleId: "s-mt",
      medicineName: "Augmentin 625mg",
      quantityDispensed: 30,
      dosesPerDay: 2,
      unitsPerDose: 2,
      dispensedAt: new Date(now.getTime() - 1 * DAY),
      takenCount: 2,
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressed).toBe(false);
    expect(cover.daysRemaining).toBe(6);
  });

  it("stays backward compatible when unitsPerDose is omitted", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s-compat",
      medicineName: "Amlodipine 5mg",
      quantityDispensed: 30,
      dosesPerDay: 1,
      dispensedAt: new Date(now.getTime() - 26 * DAY),
      takenCount: 26,
      snoozedUntil: null,
      now,
    });
    expect(cover.daysRemaining).toBe(4);
  });

  it("treats a future dispense timestamp as corrupt, not as zero elapsed", () => {
    const cover = computeDaysOfCover({
      scheduleId: "s-future",
      medicineName: "X",
      quantityDispensed: 30,
      dosesPerDay: 1,
      dispensedAt: new Date(now.getTime() + 5 * DAY),
      takenCount: 0,
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressed).toBe(true);
    expect(cover.suppressionReason).toBe("CONFLICTING_DATA");
  });

  it("rejects a zero or negative unitsPerDose rather than dividing by it", () => {
    for (const unitsPerDose of [0, -1]) {
      const cover = computeDaysOfCover({
        scheduleId: "s-bad",
        medicineName: "X",
        quantityDispensed: 30,
        dosesPerDay: 1,
        unitsPerDose,
        dispensedAt: new Date(now.getTime() - DAY),
        takenCount: 0,
        snoozedUntil: null,
        now,
      });
      expect(cover.suppressed).toBe(true);
      expect(cover.suppressionReason).toBe("INVALID_FREQUENCY");
    }
  });

  it("detects conflict in unit terms, not dose terms", () => {
    // 10 confirmed doses x 2 units = 20 units vs a 15-unit pack: conflicting,
    // even though takenCount (10) is below quantityDispensed (15).
    const cover = computeDaysOfCover({
      scheduleId: "s-units",
      medicineName: "X",
      quantityDispensed: 15,
      dosesPerDay: 2,
      unitsPerDose: 2,
      dispensedAt: new Date(now.getTime() - 5 * DAY),
      takenCount: 10,
      snoozedUntil: null,
      now,
    });
    expect(cover.suppressionReason).toBe("CONFLICTING_DATA");
  });

  it("keeps a matching reconciliation as the strongest trust signal", () => {
    // variance 0 from a real COUNT must outrank never-counted.
    const counted = computeSkuTrust({
      movementCount: 45,
      lastCountedAt: new Date(now.getTime() - DAY),
      lastVariance: 0,
      now,
    });
    const neverCounted = computeSkuTrust({
      movementCount: 45,
      lastCountedAt: null,
      lastVariance: 0,
      now,
    });
    expect(counted).toBeGreaterThan(neverCounted);
    expect(neverCounted).toBeLessThan(SKU_TRUST_THRESHOLD);
  });
});
