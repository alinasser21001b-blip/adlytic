// Credit policy shared by Worker and UI. The server is the only authority;
// the client uses these constants for wording only.

export const FREE_POLICY_VERSION = "free-2-plus-1-per-24h-cap-2@1";
export const FREE_CAP = 2;
export const FREE_ON_ACTIVATION = 2;
export const FREE_REFILL_MS = 86_400_000;

/** Server catalog. Prices are integers in IQD; nothing else is accepted. */
export const PRICE_VERSION = "iqd-500@1";
export const UNIT_PRICE_IQD = 500;
export const CATALOG = [
  { productId: "check_1", units: 1, priceIQD: 500 },
  { productId: "check_5", units: 5, priceIQD: 2500 },
  { productId: "check_10", units: 10, priceIQD: 5000 },
] as const;
export type ProductId = (typeof CATALOG)[number]["productId"];

/**
 * A single 500 IQD payment is not offered by default: ZainCash's published
 * minimum gateway fee is 500 IQD on a Small Projects wallet (150 IQD on a
 * Merchant wallet), which would consume the whole price. See UNIT_ECONOMICS.md.
 */
export const SINGLE_UNIT_PURCHASE_DEFAULT = false;

export interface CatalogEntry {
  productId: ProductId;
  units: number;
  priceIQD: number;
  unitPriceIQD: number;
  available: boolean;
  noteAr?: string;
}

export interface CatalogView {
  priceVersion: string;
  unitPriceIQD: number;
  paymentsEnabled: boolean;
  provider: "zaincash";
  products: CatalogEntry[];
}

export interface OrderView {
  orderId: string;
  status: "created" | "pending" | "paid" | "failed" | "expired";
  productId: string;
  units: number;
  amountIQD: number;
  createdAt: string;
}

export interface Balance {
  serverNow: string;
  freeAvailable: number;
  freeHeld: number;
  paidAvailable: number;
  nextRefillAt: string | null;
  unitPriceIQD: number;
  priceVersion: string;
  policyVersion: string;
}

/**
 * Reference model of the free bucket (used by tests to check the SQL):
 * apply every refill tick since `anchor` with the current hold count, never
 * exceeding FREE_CAP − held, and advance the anchor even when full.
 */
export function refreshFree(available: number, anchor: number, held: number, now: number, refillMs = FREE_REFILL_MS) {
  const ticks = Math.max(0, Math.floor((now - anchor) / refillMs));
  return { available: Math.min(FREE_CAP - held, available + ticks), anchor: anchor + ticks * refillMs };
}
