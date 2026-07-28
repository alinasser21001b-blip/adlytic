import { describe, expect, it } from "vitest";
import {
  createDemandState,
  recordDemandSignal,
  type DemandState,
} from "./demand";
import {
  applyRadarEvent,
  createRadarState,
  type RadarState,
} from "./radar";

const requestId = "request-radar";
const canonicalId = "IQ-MED-BRU-400-TAB-30";

function demandAtS1(): DemandState {
  let demand = createDemandState();
  demand = recordDemandSignal(demand, "S0", {
    id: "demand-s0",
    anonymousCohort: "demo-cohort",
    requestId: null,
    district: "المنصور",
    canonicalId: null,
    occurredAt: "2026-07-28T10:00:00.000Z",
  });
  return recordDemandSignal(demand, "S1", {
    id: "demand-s1",
    anonymousCohort: "demo-cohort",
    requestId: null,
    district: "المنصور",
    canonicalId,
    occurredAt: "2026-07-28T10:00:01.000Z",
  });
}

function freshRadar(): RadarState {
  return createRadarState({
    requestId,
    canonicalId,
    anonymousCohort: "demo-cohort",
    district: "المنصور",
    requiresPrescriptionAccess: false,
    verifiedPharmacyIds: ["pharmacy-1", "pharmacy-2"],
    demand: demandAtS1(),
  });
}

function throughMatch(): RadarState {
  let state = freshRadar();
  state = applyRadarEvent(state, {
    type: "RequestCreated",
    at: "2026-07-28T10:00:02.000Z",
    requestId,
  });
  state = applyRadarEvent(state, {
    type: "BroadcastDispatched",
    at: "2026-07-28T10:00:03.000Z",
    licensedRecipients: 2,
  });
  state = applyRadarEvent(state, {
    type: "PharmacyReviewing",
    at: "2026-07-28T10:00:04.000Z",
    pharmacyId: "pharmacy-1",
  });
  state = applyRadarEvent(state, {
    type: "PharmacyConfirmed",
    at: "2026-07-28T10:00:05.000Z",
    confirmation: {
      pharmacyId: "pharmacy-1",
      pharmacyName: "صيدلية تجريبية",
      canonicalId,
      amountIqd: 7_000,
      confirmedAt: "2026-07-28T10:00:05.000Z",
    },
  });
  return applyRadarEvent(state, {
    type: "PrescriptionMatched",
    at: "2026-07-28T10:00:06.000Z",
    pharmacyId: "pharmacy-1",
    canonicalId,
  });
}

describe("guarded demand and radar state machine", () => {
  it("does not infer or skip demand stages (AC-05)", () => {
    const empty = createDemandState();
    expect(() =>
      recordDemandSignal(empty, "S2", {
        id: "bad",
        anonymousCohort: "demo",
        requestId,
        district: "المنصور",
        canonicalId,
        occurredAt: "2026-07-28T10:00:00.000Z",
      }),
    ).toThrow("INVALID_DEMAND_TRANSITION:NONE->S2");

    const state = throughMatch();
    expect(state.demand.events.map((event) => event.stage)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
    ]);
  });

  it("does not change radar claims when no event arrives (AC-07)", () => {
    const state = freshRadar();
    const later = structuredClone(state);

    expect(later).toEqual(state);
    expect(state.status).toBe("AWAITING_REQUEST");
    expect(state.reviewingPharmacyIds).toHaveLength(0);
    expect(state.hold).toBeNull();
  });

  it("never starts a hold while a pharmacy is merely reviewing (AC-09)", () => {
    let state = freshRadar();
    state = applyRadarEvent(state, {
      type: "RequestCreated",
      at: "2026-07-28T10:00:02.000Z",
      requestId,
    });
    state = applyRadarEvent(state, {
      type: "BroadcastDispatched",
      at: "2026-07-28T10:00:03.000Z",
      licensedRecipients: 1,
    });
    expect(() =>
      applyRadarEvent(state, {
        type: "PharmacyReviewing",
        at: "2026-07-28T10:00:03.500Z",
        pharmacyId: "pharmacy-unverified",
      }),
    ).toThrow("INVALID_PHARMACY_REVIEW");
    state = applyRadarEvent(state, {
      type: "PharmacyReviewing",
      at: "2026-07-28T10:00:04.000Z",
      pharmacyId: "pharmacy-1",
    });

    expect(state.status).toBe("REVIEWING");
    expect(state.hold).toBeNull();
    expect(() =>
      applyRadarEvent(state, {
        type: "HoldActivated",
        at: "2026-07-28T10:00:05.000Z",
        reference: "QRB-BAD",
        expiresAt: "2026-07-28T10:10:05.000Z",
      }),
    ).toThrow("INVALID_HOLD_ACTIVATION");
  });

  it("activates only a matched hold, then expires without an active claim (AC-10, AC-11)", () => {
    let state = throughMatch();
    state = applyRadarEvent(state, {
      type: "HoldActivated",
      at: "2026-07-28T10:00:07.000Z",
      reference: "QRB-123456",
      expiresAt: "2026-07-28T10:10:07.000Z",
    });

    expect(state.status).toBe("HOLD_ACTIVE");
    expect(state.hold).toMatchObject({
      reference: "QRB-123456",
      status: "ACTIVE",
      amountIqd: 7_000,
    });
    expect(state.demand.currentStage).toBe("S4");

    state = applyRadarEvent(state, {
      type: "HoldExpired",
      at: "2026-07-28T10:10:07.000Z",
      reference: "QRB-123456",
    });
    expect(state.status).toBe("HOLD_EXPIRED");
    expect(state.hold?.status).toBe("EXPIRED");
  });

  it("derives all-declined only from emitted recipient and decline events", () => {
    let state = freshRadar();
    state = applyRadarEvent(state, {
      type: "RequestCreated",
      at: "2026-07-28T10:00:02.000Z",
      requestId,
    });
    state = applyRadarEvent(state, {
      type: "BroadcastDispatched",
      at: "2026-07-28T10:00:03.000Z",
      licensedRecipients: 2,
    });

    for (const [index, pharmacyId] of ["pharmacy-1", "pharmacy-2"].entries()) {
      state = applyRadarEvent(state, {
        type: "PharmacyReviewing",
        at: `2026-07-28T10:00:0${4 + index * 2}.000Z`,
        pharmacyId,
      });
      state = applyRadarEvent(state, {
        type: "PharmacyDeclined",
        at: `2026-07-28T10:00:0${5 + index * 2}.000Z`,
        pharmacyId,
      });
    }

    expect(state.status).toBe("ALL_DECLINED");
    expect(state.declinedPharmacyIds).toHaveLength(2);
  });
});

