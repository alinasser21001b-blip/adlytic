import { describe, expect, it } from "vitest";
import type { GudeaProviderAdapter } from "./contracts";
import {
  DemoGudeaAdapter,
  GUDEA_UNAVAILABLE_MESSAGE,
  safeGudeaLookup,
} from "./gudea";

describe("Gudea provider boundary", () => {
  it("returns a verified official reference independently of pharmacy price", async () => {
    const adapter = new DemoGudeaAdapter({
      prices: { "medicine-1": 6_000 },
    });

    await expect(safeGudeaLookup(adapter, "medicine-1")).resolves.toMatchObject({
      status: "verified",
      officialPriceIqd: 6_000,
      canonicalId: "medicine-1",
    });
  });

  it("fails open for the patient journey on unavailable, thrown, or mismatched data (AC-08)", async () => {
    const unavailable = new DemoGudeaAdapter({
      prices: {},
      unavailableIds: new Set(["medicine-1"]),
    });
    const throwing: GudeaProviderAdapter = {
      lookup: async () => {
        throw new Error("network unavailable");
      },
    };
    const mismatched: GudeaProviderAdapter = {
      lookup: async () => ({
        status: "verified",
        officialPriceIqd: 10,
        verifiedAt: "2026-07-28T10:00:00.000Z",
        canonicalId: "medicine-other",
      }),
    };

    await expect(safeGudeaLookup(unavailable, "medicine-1")).resolves.toMatchObject({
      status: "unavailable",
    });
    await expect(safeGudeaLookup(throwing, "medicine-1")).resolves.toEqual({
      status: "unavailable",
      reason: "ADAPTER_ERROR",
    });
    await expect(safeGudeaLookup(mismatched, "medicine-1")).resolves.toEqual({
      status: "unavailable",
      reason: "PRESENTATION_IDENTITY_MISMATCH",
    });
    expect(GUDEA_UNAVAILABLE_MESSAGE).toBe(
      "تعذر التحقق من التسعير/الهوية الحكومية حالياً",
    );
  });
});

