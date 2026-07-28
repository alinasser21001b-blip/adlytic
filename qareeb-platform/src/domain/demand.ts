import type {
  AvailabilityBroadcast,
  ConsentRecord,
  DemandSignalEvent,
  DemandStage,
  EncryptedPrescriptionEnvelope,
  MedicinePresentation,
} from "./contracts";

const NEXT_STAGE: Readonly<Record<DemandStage, DemandStage | null>> = {
  S0: "S1",
  S1: "S2",
  S2: "S3",
  S3: "S4",
  S4: "S5",
  S5: null,
};

export interface DemandState {
  currentStage: DemandStage | null;
  events: readonly DemandSignalEvent[];
}

export interface DemandSignalInput {
  id: string;
  anonymousCohort: string;
  requestId: string | null;
  district: string;
  canonicalId: string | null;
  occurredAt: string;
}

export function createDemandState(): DemandState {
  return { currentStage: null, events: [] };
}

export function recordDemandSignal(
  state: DemandState,
  stage: DemandStage,
  input: DemandSignalInput,
): DemandState {
  const expectedStage =
    state.currentStage === null ? "S0" : NEXT_STAGE[state.currentStage];

  if (stage !== expectedStage) {
    throw new Error(
      `INVALID_DEMAND_TRANSITION:${state.currentStage ?? "NONE"}->${stage}`,
    );
  }

  if (stage !== "S0" && !input.canonicalId) {
    throw new Error("CANONICAL_MEDICINE_REQUIRED");
  }

  if (["S2", "S3", "S4", "S5"].includes(stage) && !input.requestId) {
    throw new Error("REQUEST_ID_REQUIRED");
  }

  const event: DemandSignalEvent = {
    id: input.id,
    anonymousCohort: input.anonymousCohort,
    requestId: input.requestId,
    stage,
    district: input.district,
    canonicalId: input.canonicalId,
    occurredAt: input.occurredAt,
  };

  return {
    currentStage: stage,
    events: [...state.events, event],
  };
}

export type BroadcastResult =
  | { kind: "created"; broadcast: AvailabilityBroadcast }
  | { kind: "blocked"; reason: "CONTROLLED_OR_UNKNOWN" };

export interface CreateBroadcastInput {
  requestId: string;
  medicine: MedicinePresentation;
  coarseDistrict: string;
  createdAt: string;
  consent?: ConsentRecord;
  prescriptionEnvelope?: EncryptedPrescriptionEnvelope;
  medicalNote?: string;
}

export function createAvailabilityBroadcast(
  input: CreateBroadcastInput,
): BroadcastResult {
  const { medicine } = input;

  if (
    medicine.prescriptionClass === "CONTROLLED" ||
    medicine.prescriptionClass === "UNKNOWN"
  ) {
    return { kind: "blocked", reason: "CONTROLLED_OR_UNKNOWN" };
  }

  if (medicine.prescriptionClass === "RX") {
    if (
      !input.consent ||
      input.consent.withdrawnAt ||
      !input.prescriptionEnvelope ||
      input.prescriptionEnvelope.consentId !== input.consent.id
    ) {
      throw new Error("VERIFIED_PRESCRIPTION_REQUIRED");
    }
  }

  // This explicit allowlist is the privacy boundary. Medical notes and
  // prescription bytes are accepted by the use-case input but never copied.
  const broadcast: AvailabilityBroadcast = {
    requestId: input.requestId,
    canonicalId: medicine.canonicalId,
    coarseDistrict: input.coarseDistrict,
    requestClass:
      medicine.prescriptionClass === "OTC" ? "OTC" : "PRESCRIPTION_VERIFIED",
    createdAt: input.createdAt,
  };

  return { kind: "created", broadcast };
}

