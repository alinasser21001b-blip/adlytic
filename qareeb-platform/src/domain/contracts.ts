export type DemandStage = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";

export type PrescriptionClass = "OTC" | "RX" | "CONTROLLED" | "UNKNOWN";

export interface MedicinePresentation {
  canonicalId: string;
  brandName: string;
  scientificName: string;
  strength: string;
  dosageForm: string;
  route: string;
  releaseMechanism: string;
  packSize: string;
  prescriptionClass: PrescriptionClass;
  aliases: readonly string[];
  barcode?: string;
  reportedPriceIqd?: number;
  reportedPriceAt?: string;
}

export interface AvailabilityBroadcast {
  requestId: string;
  canonicalId: string;
  coarseDistrict: string;
  requestClass: "OTC" | "PRESCRIPTION_VERIFIED";
  createdAt: string;
}

export interface PharmacyPriceConfirmation {
  pharmacyId: string;
  pharmacyName: string;
  canonicalId: string;
  amountIqd: number;
  confirmedAt: string;
}

export interface ConsentRecord {
  id: string;
  anonymousSessionId: string;
  version: string;
  purpose: string;
  recipients: string;
  retention: string;
  withdrawal: string;
  grantedAt: string;
  withdrawnAt: string | null;
}

export interface PrescriptionAsset {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface EncryptedPrescriptionEnvelope {
  id: string;
  prescriptionId: string;
  ciphertext: Uint8Array;
  encryptedDataKey: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  algorithm: "AES-256-GCM";
  consentId: string;
  stagedAt: string;
  retention:
    | { status: "PENDING_HOLD_OUTCOME" }
    | { status: "MARKED_FOR_DELETION"; deleteAt: string; reason: "HOLD_EXPIRED" | "CANCELLED" };
}

export interface PharmacistPrincipal {
  pharmacistId: string;
  pharmacyId: string;
  role: "VERIFIED_PHARMACIST" | "PHARMACY_STAFF" | "PATIENT";
  licenseStatus: "VERIFIED" | "EXPIRED" | "UNKNOWN";
}

export interface PrescriptionAccessAuditEvent {
  id: string;
  prescriptionId: string;
  pharmacistId: string;
  pharmacyId: string;
  reason: string;
  accessedAt: string;
  previousHash: string;
  entryHash: string;
}

export interface HoldRecord {
  requestId: string;
  pharmacyId: string;
  canonicalId: string;
  reference: string;
  amountIqd: number;
  priceConfirmedAt: string;
  activatedAt: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "DISPENSED";
}

export type RadarEvent =
  | { type: "RequestCreated"; at: string; requestId: string }
  | { type: "BroadcastDispatched"; at: string; licensedRecipients: number }
  | { type: "PharmacyReviewing"; at: string; pharmacyId: string }
  | { type: "PharmacyDeclined"; at: string; pharmacyId: string }
  | { type: "PharmacyConfirmed"; at: string; confirmation: PharmacyPriceConfirmation }
  | { type: "PrescriptionAccessGranted"; at: string; pharmacyId: string; auditId: string }
  | { type: "PrescriptionMatched"; at: string; pharmacyId: string; canonicalId: string }
  | { type: "HoldActivated"; at: string; reference: string; expiresAt: string }
  | { type: "HoldExpired"; at: string; reference: string }
  | { type: "RequestTimedOut"; at: string; requestId: string }
  | { type: "DispensingConfirmed"; at: string; reference: string };

export interface DemandSignalEvent {
  id: string;
  anonymousCohort: string;
  requestId: string | null;
  stage: DemandStage;
  district: string;
  canonicalId: string | null;
  occurredAt: string;
}

export type GudeaLookupResult =
  | {
      status: "verified";
      officialPriceIqd: number;
      verifiedAt: string;
      canonicalId?: string;
    }
  | { status: "unavailable"; reason: string };

export interface GudeaProviderAdapter {
  lookup(canonicalId: string): Promise<GudeaLookupResult>;
}

