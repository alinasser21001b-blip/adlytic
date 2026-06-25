/**
 * Minor-unit factor for storing Meta monetary fields in DailyStat / Campaign rows.
 *
 * Meta Graph API returns `spend`, `cpc`, `cpm` in account-currency **major** units
 * (e.g. "12.50" USD, "1200" IQD). We persist "minor" units by multiplying major
 * values by this factor during insightMapper / sync.
 *
 * `daily_budget` / `lifetime_budget` are already in the account's smallest billable
 * unit (cents for USD, whole IQD for IQD) — stored as-is without an extra multiply.
 */
export function currencyMinorFactorFor(currency: string): number {
  const code = String(currency ?? "").trim().toUpperCase();
  // IQD has no practical subunit in Meta billing — 1 IQD minor = 1 IQD major.
  if (code === "IQD") return 1;
  return 100;
}

/** Resolve factor from DB row, falling back to currency when unset/invalid.
 *  Zero-decimal currencies (IQD) always return 1 — the schema default of 100
 *  must never win over the currency code. */
export function resolveCurrencyMinorFactor(
  currency: string,
  storedFactor: number | null | undefined,
): number {
  const canonical = currencyMinorFactorFor(currency);
  if (canonical === 1) return 1;
  if (storedFactor != null && storedFactor > 0) return storedFactor;
  return canonical;
}

/** True when the persisted factor disagrees with the currency's canonical factor. */
export function currencyFactorNeedsHeal(currency: string, storedFactor: number): boolean {
  return currencyMinorFactorFor(currency) !== storedFactor;
}
