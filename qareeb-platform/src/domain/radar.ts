import type {
  DemandSignalEvent,
  HoldRecord,
  PharmacyPriceConfirmation,
  RadarEvent,
} from "./contracts";
import {
  recordDemandSignal,
  type DemandState,
} from "./demand";

export type RadarStatus =
  | "AWAITING_REQUEST"
  | "BROADCAST"
  | "REVIEWING"
  | "ALL_DECLINED"
  | "PHARMACY_CONFIRMED"
  | "PRESENTATION_MATCHED"
  | "HOLD_ACTIVE"
  | "HOLD_EXPIRED"
  | "TIMED_OUT"
  | "DISPENSED";

export interface RadarState {
  requestId: string;
  canonicalId: string;
  anonymousCohort: string;
  district: string;
  requiresPrescriptionAccess: boolean;
  verifiedPharmacyIds: readonly string[];
  status: RadarStatus;
  demand: DemandState;
  events: readonly RadarEvent[];
  licensedRecipients: number | null;
  reviewingPharmacyIds: readonly string[];
  declinedPharmacyIds: readonly string[];
  confirmation: PharmacyPriceConfirmation | null;
  prescriptionAccessAuditId: string | null;
  matchedPharmacyId: string | null;
  hold: HoldRecord | null;
}

export function createRadarState(input: {
  requestId: string;
  canonicalId: string;
  anonymousCohort: string;
  district: string;
  requiresPrescriptionAccess: boolean;
  verifiedPharmacyIds: readonly string[];
  demand: DemandState;
}): RadarState {
  if (input.demand.currentStage !== "S1") {
    throw new Error("RADAR_REQUIRES_S1_DEMAND");
  }
  if (
    input.verifiedPharmacyIds.length === 0 ||
    new Set(input.verifiedPharmacyIds).size !== input.verifiedPharmacyIds.length
  ) {
    throw new Error("VERIFIED_PHARMACY_RECIPIENTS_REQUIRED");
  }

  return {
    ...input,
    status: "AWAITING_REQUEST",
    events: [],
    licensedRecipients: null,
    reviewingPharmacyIds: [],
    declinedPharmacyIds: [],
    confirmation: null,
    prescriptionAccessAuditId: null,
    matchedPharmacyId: null,
    hold: null,
  };
}

function eventTime(event: RadarEvent): number {
  const value = new Date(event.at).getTime();
  if (!Number.isFinite(value)) {
    throw new Error("INVALID_EVENT_TIMESTAMP");
  }
  return value;
}

function ensureChronological(
  events: readonly RadarEvent[],
  event: RadarEvent,
): void {
  const previous = events.at(-1);
  if (previous && eventTime(event) < eventTime(previous)) {
    throw new Error("OUT_OF_ORDER_EVENT_TIMESTAMP");
  }
}

function appendDemand(
  state: RadarState,
  stage: "S2" | "S3" | "S4" | "S5",
  event: RadarEvent,
): DemandState {
  return recordDemandSignal(state.demand, stage, {
    id: `demand-${state.requestId}-${stage}-${state.demand.events.length + 1}`,
    anonymousCohort: state.anonymousCohort,
    requestId: state.requestId,
    district: state.district,
    canonicalId: state.canonicalId,
    occurredAt: event.at,
  });
}

function appendEvent(state: RadarState, event: RadarEvent): readonly RadarEvent[] {
  return [...state.events, Object.freeze({ ...event })];
}

function assertRequestActive(state: RadarState): void {
  if (
    state.status === "TIMED_OUT" ||
    state.status === "HOLD_EXPIRED" ||
    state.status === "DISPENSED"
  ) {
    throw new Error("REQUEST_IS_TERMINAL");
  }
}

export function applyRadarEvent(
  state: RadarState,
  event: RadarEvent,
): RadarState {
  ensureChronological(state.events, event);

  switch (event.type) {
    case "RequestCreated": {
      if (
        event.requestId !== state.requestId ||
        state.events.some((item) => item.type === "RequestCreated")
      ) {
        throw new Error("INVALID_REQUEST_CREATED");
      }

      return { ...state, events: appendEvent(state, event) };
    }

    case "BroadcastDispatched": {
      assertRequestActive(state);
      if (
        !state.events.some((item) => item.type === "RequestCreated") ||
        state.licensedRecipients !== null ||
        !Number.isInteger(event.licensedRecipients) ||
        event.licensedRecipients < 1 ||
        event.licensedRecipients > state.verifiedPharmacyIds.length
      ) {
        throw new Error("INVALID_BROADCAST_EVENT");
      }

      return {
        ...state,
        status: "BROADCAST",
        demand: appendDemand(state, "S2", event),
        licensedRecipients: event.licensedRecipients,
        events: appendEvent(state, event),
      };
    }

    case "PharmacyReviewing": {
      assertRequestActive(state);
      if (
        state.demand.currentStage !== "S2" ||
        state.licensedRecipients === null ||
        !state.verifiedPharmacyIds.includes(event.pharmacyId) ||
        state.declinedPharmacyIds.includes(event.pharmacyId) ||
        state.reviewingPharmacyIds.includes(event.pharmacyId)
      ) {
        throw new Error("INVALID_PHARMACY_REVIEW");
      }

      return {
        ...state,
        status: "REVIEWING",
        reviewingPharmacyIds: [...state.reviewingPharmacyIds, event.pharmacyId],
        events: appendEvent(state, event),
      };
    }

    case "PharmacyDeclined": {
      assertRequestActive(state);
      if (
        !state.reviewingPharmacyIds.includes(event.pharmacyId) ||
        state.declinedPharmacyIds.includes(event.pharmacyId) ||
        state.confirmation
      ) {
        throw new Error("INVALID_PHARMACY_DECLINE");
      }

      const declinedPharmacyIds = [
        ...state.declinedPharmacyIds,
        event.pharmacyId,
      ];
      const allDeclined =
        state.licensedRecipients !== null &&
        declinedPharmacyIds.length >= state.licensedRecipients;

      return {
        ...state,
        status: allDeclined ? "ALL_DECLINED" : "BROADCAST",
        declinedPharmacyIds,
        events: appendEvent(state, event),
      };
    }

    case "PharmacyConfirmed": {
      assertRequestActive(state);
      const { confirmation } = event;
      const confirmedAt = new Date(confirmation.confirmedAt).getTime();
      if (
        state.demand.currentStage !== "S2" ||
        state.confirmation ||
        !state.verifiedPharmacyIds.includes(confirmation.pharmacyId) ||
        confirmation.canonicalId !== state.canonicalId ||
        !state.reviewingPharmacyIds.includes(confirmation.pharmacyId) ||
        state.declinedPharmacyIds.includes(confirmation.pharmacyId) ||
        !Number.isFinite(confirmation.amountIqd) ||
        confirmation.amountIqd <= 0 ||
        !Number.isFinite(confirmedAt) ||
        confirmedAt > eventTime(event)
      ) {
        throw new Error("INVALID_PHARMACY_CONFIRMATION");
      }

      return {
        ...state,
        status: "PHARMACY_CONFIRMED",
        confirmation: { ...confirmation },
        events: appendEvent(state, event),
      };
    }

    case "PrescriptionAccessGranted": {
      assertRequestActive(state);
      if (
        !state.requiresPrescriptionAccess ||
        !state.confirmation ||
        event.pharmacyId !== state.confirmation.pharmacyId ||
        state.prescriptionAccessAuditId ||
        !event.auditId
      ) {
        throw new Error("INVALID_PRESCRIPTION_ACCESS");
      }

      return {
        ...state,
        prescriptionAccessAuditId: event.auditId,
        events: appendEvent(state, event),
      };
    }

    case "PrescriptionMatched": {
      assertRequestActive(state);
      if (
        state.demand.currentStage !== "S2" ||
        !state.confirmation ||
        event.pharmacyId !== state.confirmation.pharmacyId ||
        event.canonicalId !== state.canonicalId ||
        state.matchedPharmacyId ||
        (state.requiresPrescriptionAccess && !state.prescriptionAccessAuditId)
      ) {
        throw new Error("INVALID_PRESCRIPTION_MATCH");
      }

      return {
        ...state,
        status: "PRESENTATION_MATCHED",
        demand: appendDemand(state, "S3", event),
        matchedPharmacyId: event.pharmacyId,
        events: appendEvent(state, event),
      };
    }

    case "HoldActivated": {
      assertRequestActive(state);
      const expiresAt = new Date(event.expiresAt).getTime();
      if (
        state.demand.currentStage !== "S3" ||
        !state.confirmation ||
        state.matchedPharmacyId !== state.confirmation.pharmacyId ||
        state.hold ||
        !event.reference.trim() ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= eventTime(event)
      ) {
        throw new Error("INVALID_HOLD_ACTIVATION");
      }

      const hold: HoldRecord = {
        requestId: state.requestId,
        pharmacyId: state.confirmation.pharmacyId,
        canonicalId: state.canonicalId,
        reference: event.reference,
        amountIqd: state.confirmation.amountIqd,
        priceConfirmedAt: state.confirmation.confirmedAt,
        activatedAt: event.at,
        expiresAt: event.expiresAt,
        status: "ACTIVE",
      };

      return {
        ...state,
        status: "HOLD_ACTIVE",
        demand: appendDemand(state, "S4", event),
        hold,
        events: appendEvent(state, event),
      };
    }

    case "HoldExpired": {
      if (
        !state.hold ||
        state.hold.status !== "ACTIVE" ||
        event.reference !== state.hold.reference ||
        eventTime(event) < new Date(state.hold.expiresAt).getTime()
      ) {
        throw new Error("INVALID_HOLD_EXPIRY");
      }

      return {
        ...state,
        status: "HOLD_EXPIRED",
        hold: { ...state.hold, status: "EXPIRED" },
        events: appendEvent(state, event),
      };
    }

    case "RequestTimedOut": {
      assertRequestActive(state);
      if (
        event.requestId !== state.requestId ||
        state.demand.currentStage !== "S2" ||
        state.confirmation
      ) {
        throw new Error("INVALID_REQUEST_TIMEOUT");
      }

      return {
        ...state,
        status: "TIMED_OUT",
        events: appendEvent(state, event),
      };
    }

    case "DispensingConfirmed": {
      if (
        !state.hold ||
        state.hold.status !== "ACTIVE" ||
        event.reference !== state.hold.reference ||
        eventTime(event) >= new Date(state.hold.expiresAt).getTime()
      ) {
        throw new Error("INVALID_DISPENSING_CONFIRMATION");
      }

      return {
        ...state,
        status: "DISPENSED",
        demand: appendDemand(state, "S5", event),
        hold: { ...state.hold, status: "DISPENSED" },
        events: appendEvent(state, event),
      };
    }
  }
}

export function demandSignalTrail(
  state: RadarState,
): readonly DemandSignalEvent[] {
  return state.demand.events;
}

