// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/lib/currency.ts
//
//  Client-side currency helpers for the dashboard. Exported as a JS
//  string that gets interpolated inside the page's IIFE `<script>` block.
//
//  Depends on: `state.currency` and `state.minorFactor` (from data/state.ts).
//  Provides:   fmtCurrencyMinor(v), fmtCurrencyMajor(n),
//              hydrateCurrencyState(dashData, wsData), sumMinor(rows)
// ════════════════════════════════════════════════════════════════════════

export const currencyHelpersJs = `
  // Convert a BigInt-or-Number minor-unit value to a human currency string
  // honouring the connected ad-account's currency + minorFactor.
  function fmtCurrencyMinor(minorVal) {
    if (minorVal == null || isNaN(Number(minorVal))) return '—';
    var major = Number(minorVal) / state.minorFactor;
    if (state.minorFactor === 1) major = Math.round(major);
    return major.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: state.minorFactor === 1 ? 0 : 2, maximumFractionDigits: state.minorFactor === 1 ? 0 : 2 }) + ' ' + state.currency;
  }
  function fmtCurrencyMajor(n) {
    if (n == null || isNaN(n)) return '—';
    if (state.minorFactor === 1) {
      return Math.round(Number(n)).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + state.currency;
    }
    return Number(n).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + state.currency;
  }
  // Prefer dashboard DTO (authoritative) then workspace adAccounts for currency state.
  function hydrateCurrencyState(dashData, wsData) {
    var currency = null;
    var factor = null;
    if (dashData && dashData.workspace) {
      if (dashData.workspace.currency) currency = dashData.workspace.currency;
      if (dashData.workspace.currencyMinorFactor != null) {
        factor = Number(dashData.workspace.currencyMinorFactor);
      }
    }
    if (wsData && Array.isArray(wsData.adAccounts) && wsData.adAccounts.length > 0) {
      var primary = wsData.adAccounts[0];
      if (!currency && primary.currency) currency = primary.currency;
      if (factor == null && primary.currencyMinorFactor != null) {
        factor = Number(primary.currencyMinorFactor);
      }
    }
    if (currency) state.currency = currency;
    // IQD has no minor unit — never divide by a stale factor=100 from DB.
    if (currency === 'IQD') state.minorFactor = 1;
    else if (factor != null && factor > 0) state.minorFactor = factor;
  }
  // Sum BigInt-or-Number spend over an insights slice (already in minor units).
  function sumMinor(rows) {
    var s = 0;
    for (var i = 0; i < rows.length; i++) s += Number(rows[i].spend) || 0;
    return s;
  }
`;
