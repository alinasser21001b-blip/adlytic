// Quick sanity checks for IQD vs USD minor-unit factors.
import { currencyMinorFactorFor, resolveCurrencyMinorFactor } from "./src/lib/currency";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

console.log("\n── currencyMinorFactorFor ──");
check("IQD → 1", currencyMinorFactorFor("IQD") === 1);
check("USD → 100", currencyMinorFactorFor("USD") === 100);
check("resolve IQD null → 1", resolveCurrencyMinorFactor("IQD", null) === 1);
check("resolve USD 0 → 100", resolveCurrencyMinorFactor("USD", 0) === 100);

console.log("\n── IQD spend round-trip (Meta major → minor → display) ──");
const iqdFactor = currencyMinorFactorFor("IQD");
const iqdMinor = Math.round(1200 * iqdFactor);
check("1200 IQD Meta spend stays 1200 minor", iqdMinor === 1200, iqdMinor);
check("display divides back to 1200", iqdMinor / iqdFactor === 1200);

console.log("\n── USD spend round-trip ──");
const usdFactor = currencyMinorFactorFor("USD");
const usdMinor = Math.round(12.5 * usdFactor);
check("12.50 USD → 1250 cents", usdMinor === 1250, usdMinor);
check("display divides back to 12.5", usdMinor / usdFactor === 12.5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
