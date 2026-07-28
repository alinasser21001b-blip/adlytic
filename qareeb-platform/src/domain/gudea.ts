import type {
  GudeaLookupResult,
  GudeaProviderAdapter,
} from "./contracts";

export const GUDEA_UNAVAILABLE_MESSAGE =
  "تعذر التحقق من التسعير/الهوية الحكومية حالياً";

export class DemoGudeaAdapter implements GudeaProviderAdapter {
  readonly #unavailableIds: ReadonlySet<string>;
  readonly #prices: Readonly<Record<string, number>>;

  constructor(input: {
    prices: Readonly<Record<string, number>>;
    unavailableIds?: ReadonlySet<string>;
  }) {
    this.#prices = input.prices;
    this.#unavailableIds = input.unavailableIds ?? new Set();
  }

  async lookup(canonicalId: string): Promise<GudeaLookupResult> {
    await Promise.resolve();

    if (this.#unavailableIds.has(canonicalId)) {
      return { status: "unavailable", reason: "DEMO_ADAPTER_UNAVAILABLE" };
    }

    const officialPriceIqd = this.#prices[canonicalId];
    if (officialPriceIqd === undefined) {
      return { status: "unavailable", reason: "NO_REFERENCE_RECORD" };
    }

    return {
      status: "verified",
      officialPriceIqd,
      verifiedAt: new Date().toISOString(),
      canonicalId,
    };
  }
}

export async function safeGudeaLookup(
  adapter: GudeaProviderAdapter,
  canonicalId: string,
): Promise<GudeaLookupResult> {
  try {
    const result = await adapter.lookup(canonicalId);

    if (
      result.status === "verified" &&
      result.canonicalId !== undefined &&
      result.canonicalId !== canonicalId
    ) {
      return {
        status: "unavailable",
        reason: "PRESENTATION_IDENTITY_MISMATCH",
      };
    }

    return result;
  } catch {
    return { status: "unavailable", reason: "ADAPTER_ERROR" };
  }
}

