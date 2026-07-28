import { describe, expect, it } from "vitest";
import { getMedicine } from "../data/medicines";
import { createAvailabilityBroadcast } from "./demand";
import {
  createConsentRecord,
  encryptPrescriptionAsset,
  markPrescriptionForDeletion,
  PrescriptionAccessAuditLedger,
  validatePrescriptionAsset,
  verifyAuditChain,
  withdrawConsent,
} from "./prescription";

const grantedAt = "2026-07-28T10:00:00.000Z";

function consent() {
  return createConsentRecord({
    id: "consent-test",
    anonymousSessionId: "anonymous-test",
    grantedAt,
  });
}

describe("prescription privacy boundary", () => {
  it("requires active consent and stores AES-256-GCM ciphertext (AC-02, AC-03)", async () => {
    const original = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]);
    const activeConsent = consent();
    const envelope = await encryptPrescriptionAsset({
      asset: {
        name: "rx.png",
        mimeType: "image/png",
        bytes: original,
      },
      consent: activeConsent,
      stagedAt: grantedAt,
      envelopeId: "envelope-test",
      prescriptionId: "prescription-test",
    });

    expect(envelope.algorithm).toBe("AES-256-GCM");
    expect(envelope.iv).toHaveLength(12);
    expect(envelope.authTag).toHaveLength(16);
    expect([...envelope.ciphertext]).not.toEqual([...original]);

    await expect(
      encryptPrescriptionAsset({
        asset: { name: "rx.png", mimeType: "image/png", bytes: original },
        consent: withdrawConsent(activeConsent, "2026-07-28T10:01:00.000Z"),
        stagedAt: grantedAt,
      }),
    ).rejects.toThrow("ACTIVE_CONSENT_REQUIRED");
  });

  it("rejects unsupported and oversized files", () => {
    expect(() =>
      validatePrescriptionAsset({
        name: "rx.svg",
        mimeType: "image/svg+xml",
        bytes: new Uint8Array([1]),
      }),
    ).toThrow("UNSUPPORTED_PRESCRIPTION_TYPE");

    expect(() =>
      validatePrescriptionAsset(
        {
          name: "rx.png",
          mimeType: "image/png",
          bytes: new Uint8Array(11),
        },
        10,
      ),
    ).toThrow("PRESCRIPTION_FILE_TOO_LARGE");
  });

  it("broadcasts only an allowlisted anonymized payload (AC-04)", async () => {
    const medicine = getMedicine("IQ-MED-AMX-500-CAP-20");
    expect(medicine).toBeDefined();
    if (!medicine) return;

    const activeConsent = consent();
    const envelope = await encryptPrescriptionAsset({
      asset: {
        name: "rx.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      consent: activeConsent,
      stagedAt: grantedAt,
      envelopeId: "envelope-test",
      prescriptionId: "prescription-test",
    });
    const result = createAvailabilityBroadcast({
      requestId: "request-test",
      medicine,
      coarseDistrict: "المنصور",
      createdAt: grantedAt,
      consent: activeConsent,
      prescriptionEnvelope: envelope,
      medicalNote: "ملاحظة سرية لا يجوز بثها",
    });

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.broadcast).toEqual({
        requestId: "request-test",
        canonicalId: medicine.canonicalId,
        coarseDistrict: "المنصور",
        requestClass: "PRESCRIPTION_VERIFIED",
        createdAt: grantedAt,
      });
      expect(JSON.stringify(result.broadcast)).not.toContain("سرية");
      expect(JSON.stringify(result.broadcast)).not.toContain("ciphertext");
    }
  });

  it("blocks controlled and unknown classifications from public broadcast (AC-06)", () => {
    const controlled = getMedicine("IQ-MED-DIA-5-TAB-20");
    expect(controlled).toBeDefined();
    if (!controlled) return;

    expect(
      createAvailabilityBroadcast({
        requestId: "request-controlled",
        medicine: controlled,
        coarseDistrict: "المنصور",
        createdAt: grantedAt,
      }),
    ).toEqual({ kind: "blocked", reason: "CONTROLLED_OR_UNKNOWN" });

    expect(
      createAvailabilityBroadcast({
        requestId: "request-unknown",
        medicine: { ...controlled, prescriptionClass: "UNKNOWN" },
        coarseDistrict: "المنصور",
        createdAt: grantedAt,
      }),
    ).toEqual({ kind: "blocked", reason: "CONTROLLED_OR_UNKNOWN" });
  });

  it("marks encrypted material for deletion exactly 24 hours after outcome", async () => {
    const envelope = await encryptPrescriptionAsset({
      asset: {
        name: "rx.webp",
        mimeType: "image/webp",
        bytes: new Uint8Array([1, 2, 3]),
      },
      consent: consent(),
      stagedAt: grantedAt,
    });
    const marked = markPrescriptionForDeletion(
      envelope,
      "2026-07-28T11:00:00.000Z",
      "CANCELLED",
    );

    expect(marked.retention).toEqual({
      status: "MARKED_FOR_DELETION",
      deleteAt: "2026-07-29T11:00:00.000Z",
      reason: "CANCELLED",
    });
  });

  it("allows only the accepted verified pharmacist and hash-links every access", async () => {
    const ledger = new PrescriptionAccessAuditLedger();
    const principal = {
      pharmacistId: "pharmacist-1",
      pharmacyId: "pharmacy-accepted",
      role: "VERIFIED_PHARMACIST" as const,
      licenseStatus: "VERIFIED" as const,
    };

    await expect(
      ledger.grantAccess({
        prescriptionId: "rx-1",
        acceptedPharmacyId: "pharmacy-other",
        principal,
        reason: "مطابقة الوصفة",
        accessedAt: grantedAt,
      }),
    ).rejects.toThrow("ACCEPTED_PHARMACY_ONLY");

    await ledger.grantAccess({
      id: "audit-1",
      prescriptionId: "rx-1",
      acceptedPharmacyId: principal.pharmacyId,
      principal,
      reason: "مطابقة الوصفة",
      accessedAt: grantedAt,
    });
    await ledger.grantAccess({
      id: "audit-2",
      prescriptionId: "rx-1",
      acceptedPharmacyId: principal.pharmacyId,
      principal,
      reason: "إعادة فتح مدققة",
      accessedAt: "2026-07-28T10:02:00.000Z",
    });

    const entries = ledger.list();
    expect(entries).toHaveLength(2);
    expect(entries[1].previousHash).toBe(entries[0].entryHash);
    await expect(verifyAuditChain(entries)).resolves.toBe(true);
  });
});

