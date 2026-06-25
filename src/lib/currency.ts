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

/** Resolve factor from DB row, falling back to currency when unset/invalid. */
export function resolveCurrencyMinorFactor(
  currency: string,
  storedFactor: number | null | undefined,
): number {
  if (storedFactor != null && storedFactor > 0) return storedFactor;
  return currencyMinorFactorFor(currency);
}
