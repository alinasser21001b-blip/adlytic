// Unit test for the CSV export (pure functions — no DB needed).
// Run: npx tsx test_csv_export.ts
import {
  campaignsToCsv,
  insightsToCsv,
  fmtMoneyMinor,
  type CsvAccount,
} from './src/services/reports/csvExport';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

console.log('CSV export — money formatting');
assert(fmtMoneyMinor(1000, 100) === '10.00', '1000 cents @factor100 → "10.00"');
assert(fmtMoneyMinor(1000, 1) === '1000', '1000 units @factor1 (IQD) → "1000"');
assert(fmtMoneyMinor(null, 100) === '', 'null budget → empty cell');

console.log('CSV export — campaigns');
const usd: CsvAccount = { currency: 'USD', currencyMinorFactor: 100 };
const campCsv = campaignsToCsv(
  [
    { name: 'حملة, تجريبية', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudget: 500, lifetimeBudget: null, createdAt: '2026-07-01T00:00:00Z' },
    { name: 'Winter', status: 'PAUSED', objective: 'MESSAGES', dailyBudget: null, lifetimeBudget: 100000, createdAt: new Date('2026-06-15T00:00:00Z') },
  ],
  usd,
);
assert(campCsv.charCodeAt(0) === 0xfeff, 'starts with UTF-8 BOM (Excel/Arabic safe)');
assert(campCsv.includes('نشطة'), 'ACTIVE → نشطة');
assert(campCsv.includes('مبيعات'), 'OUTCOME_SALES → مبيعات');
assert(campCsv.includes('"حملة, تجريبية"'), 'comma in name is quoted per RFC-4180');
assert(campCsv.includes('5.00'), 'daily budget 500 cents → 5.00');
assert(campCsv.includes('1000.00'), 'lifetime budget 100000 cents → 1000.00');
assert(campCsv.split('\r\n').length >= 3, 'header + 2 rows, CRLF line endings');

console.log('CSV export — insights (IQD, factor 1)');
const iqd: CsvAccount = { currency: 'IQD', currencyMinorFactor: 1 };
const insCsv = insightsToCsv(
  [
    { date: '2026-07-02', spend: 3000, impressions: 12000, reach: 8000, clicks: 240, ctr: 2.0, cpm: 250, messages: 15, purchases: 3 },
    { date: '2026-07-01', spend: 1000, impressions: 5000, reach: 4000, clicks: 100, ctr: 2.0, cpm: 200, messages: 5, purchases: 1 },
  ],
  iqd,
);
const insLines = insCsv.replace(/^﻿/, '').trim().split('\r\n');
assert(insCsv.includes('الإنفاق (IQD)'), 'header carries the account currency');
assert(insLines[1]!.startsWith('2026-07-01'), 'rows sorted oldest → newest');
assert(insCsv.includes('3000') && !insCsv.includes('30.00'), 'IQD spend is whole-unit (no /100)');

console.log('CSV export — insights CPM is major units (USD factor 100)');
const usdIns = insightsToCsv(
  [
    // Meta CPM $3.21 is stored as 321 minor units — CSV must export 3.21, not 321.
    { date: '2026-06-21', spend: 2202, impressions: 6850, reach: 5000, clicks: 80, ctr: 1.17, cpm: 321.3, messages: 12, purchases: 0 },
  ],
  usd,
);
assert(usdIns.includes('3.21'), 'CPM 321.3 minor → 3.21 major in CSV');
assert(!/,321(?:\.|,|\r|$)/.test(usdIns.replace('3.21', '')), 'raw minor CPM 321 must not appear as a cell');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
