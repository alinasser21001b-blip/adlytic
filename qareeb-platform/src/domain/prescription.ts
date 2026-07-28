import type {
  ConsentRecord,
  EncryptedPrescriptionEnvelope,
  PharmacistPrincipal,
  PrescriptionAccessAuditEvent,
  PrescriptionAsset,
} from "./contracts";

export const MAX_PRESCRIPTION_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_PRESCRIPTION_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CONSENT_VERSION = "qareeb-demo-consent-v1";

export const CONSENT_TERMS = {
  purpose: "مطابقة الوصفة مع العرض الدوائي المطلوب وتأكيد الحجز المؤقت فقط.",
  recipients:
    "لا تُرسل الوصفة إلى شبكة الصيدليات؛ يصل إليها مؤقتاً صيدلي موثّق في الصيدلية التي قبلت الطلب فقط.",
  retention:
    "تُعلّم الوصفة والملاحظة للحذف بعد 24 ساعة من انتهاء الحجز أو إلغائه.",
  withdrawal:
    "يمكنك سحب الموافقة قبل إرسال طلب التوفر، وعندها تُلغى المادة المهيّأة.",
} as const;

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("ENCRYPTION_UNAVAILABLE");
  }
  return globalThis.crypto;
}

function randomId(prefix: string): string {
  const cryptoApi = requireCrypto();
  if (typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${value}`;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createConsentRecord(input: {
  anonymousSessionId: string;
  grantedAt: string;
  id?: string;
}): ConsentRecord {
  return {
    id: input.id ?? randomId("consent"),
    anonymousSessionId: input.anonymousSessionId,
    version: CONSENT_VERSION,
    purpose: CONSENT_TERMS.purpose,
    recipients: CONSENT_TERMS.recipients,
    retention: CONSENT_TERMS.retention,
    withdrawal: CONSENT_TERMS.withdrawal,
    grantedAt: input.grantedAt,
    withdrawnAt: null,
  };
}

export function withdrawConsent(
  consent: ConsentRecord,
  withdrawnAt: string,
): ConsentRecord {
  if (consent.withdrawnAt) {
    throw new Error("CONSENT_ALREADY_WITHDRAWN");
  }

  return { ...consent, withdrawnAt };
}

export function validatePrescriptionAsset(
  asset: PrescriptionAsset,
  maxBytes = MAX_PRESCRIPTION_BYTES,
): void {
  if (
    !SUPPORTED_PRESCRIPTION_TYPES.includes(
      asset.mimeType as (typeof SUPPORTED_PRESCRIPTION_TYPES)[number],
    )
  ) {
    throw new Error("UNSUPPORTED_PRESCRIPTION_TYPE");
  }

  if (asset.bytes.byteLength === 0) {
    throw new Error("EMPTY_PRESCRIPTION_FILE");
  }

  if (asset.bytes.byteLength > maxBytes) {
    throw new Error("PRESCRIPTION_FILE_TOO_LARGE");
  }
}

export async function encryptPrescriptionAsset(input: {
  asset: PrescriptionAsset;
  consent: ConsentRecord;
  stagedAt: string;
  envelopeId?: string;
  prescriptionId?: string;
  maxBytes?: number;
}): Promise<EncryptedPrescriptionEnvelope> {
  if (input.consent.withdrawnAt) {
    throw new Error("ACTIVE_CONSENT_REQUIRED");
  }

  validatePrescriptionAsset(
    input.asset,
    input.maxBytes ?? MAX_PRESCRIPTION_BYTES,
  );

  const cryptoApi = requireCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const dataKey = await cryptoApi.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const demoWrappingKey = await cryptoApi.subtle.generateKey(
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey"],
  );

  const encryptedDataKey = new Uint8Array(
    await cryptoApi.subtle.wrapKey("raw", dataKey, demoWrappingKey, "AES-KW"),
  );
  const ciphertextWithTag = new Uint8Array(
    await cryptoApi.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: exactArrayBuffer(iv),
        tagLength: 128,
      },
      dataKey,
      exactArrayBuffer(input.asset.bytes),
    ),
  );

  const tagOffset = ciphertextWithTag.byteLength - 16;
  if (tagOffset <= 0) {
    throw new Error("ENCRYPTION_FAILED");
  }

  return {
    id: input.envelopeId ?? randomId("envelope"),
    prescriptionId: input.prescriptionId ?? randomId("prescription"),
    ciphertext: ciphertextWithTag.slice(0, tagOffset),
    authTag: ciphertextWithTag.slice(tagOffset),
    encryptedDataKey,
    iv,
    algorithm: "AES-256-GCM",
    consentId: input.consent.id,
    stagedAt: input.stagedAt,
    retention: { status: "PENDING_HOLD_OUTCOME" },
  };
}

export function markPrescriptionForDeletion(
  envelope: EncryptedPrescriptionEnvelope,
  outcomeAt: string,
  reason: "HOLD_EXPIRED" | "CANCELLED",
): EncryptedPrescriptionEnvelope {
  const outcomeTime = new Date(outcomeAt).getTime();
  if (!Number.isFinite(outcomeTime)) {
    throw new Error("INVALID_RETENTION_TIMESTAMP");
  }

  return {
    ...envelope,
    retention: {
      status: "MARKED_FOR_DELETION",
      deleteAt: new Date(outcomeTime + 24 * 60 * 60 * 1_000).toISOString(),
      reason,
    },
  };
}

async function hashAuditPayload(
  event: Omit<PrescriptionAccessAuditEvent, "entryHash">,
): Promise<string> {
  const serialized = JSON.stringify([
    event.id,
    event.prescriptionId,
    event.pharmacistId,
    event.pharmacyId,
    event.reason,
    event.accessedAt,
    event.previousHash,
  ]);
  const digest = await requireCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return toHex(new Uint8Array(digest));
}

export class PrescriptionAccessAuditLedger {
  readonly #entries: PrescriptionAccessAuditEvent[] = [];

  list(): readonly PrescriptionAccessAuditEvent[] {
    return this.#entries.map((entry) => Object.freeze({ ...entry }));
  }

  async grantAccess(input: {
    prescriptionId: string;
    acceptedPharmacyId: string;
    principal: PharmacistPrincipal;
    reason: string;
    accessedAt: string;
    id?: string;
  }): Promise<PrescriptionAccessAuditEvent> {
    if (
      input.principal.role !== "VERIFIED_PHARMACIST" ||
      input.principal.licenseStatus !== "VERIFIED"
    ) {
      throw new Error("VERIFIED_PHARMACIST_REQUIRED");
    }

    if (input.principal.pharmacyId !== input.acceptedPharmacyId) {
      throw new Error("ACCEPTED_PHARMACY_ONLY");
    }

    const previousHash =
      this.#entries.at(-1)?.entryHash ?? "0".repeat(64);
    const eventWithoutHash = {
      id: input.id ?? randomId("audit"),
      prescriptionId: input.prescriptionId,
      pharmacistId: input.principal.pharmacistId,
      pharmacyId: input.principal.pharmacyId,
      reason: input.reason,
      accessedAt: input.accessedAt,
      previousHash,
    };
    const event: PrescriptionAccessAuditEvent = Object.freeze({
      ...eventWithoutHash,
      entryHash: await hashAuditPayload(eventWithoutHash),
    });

    this.#entries.push(event);
    return event;
  }
}

export async function verifyAuditChain(
  entries: readonly PrescriptionAccessAuditEvent[],
): Promise<boolean> {
  let previousHash = "0".repeat(64);

  for (const entry of entries) {
    if (entry.previousHash !== previousHash) {
      return false;
    }

    const expectedHash = await hashAuditPayload({
      id: entry.id,
      prescriptionId: entry.prescriptionId,
      pharmacistId: entry.pharmacistId,
      pharmacyId: entry.pharmacyId,
      reason: entry.reason,
      accessedAt: entry.accessedAt,
      previousHash: entry.previousHash,
    });
    if (entry.entryHash !== expectedHash) {
      return false;
    }

    previousHash = entry.entryHash;
  }

  return true;
}

