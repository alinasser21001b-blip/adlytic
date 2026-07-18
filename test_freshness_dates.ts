/**
 * Data-freshness date contract — every "today"/window boundary follows the
 * AD ACCOUNT's reporting calendar, never UTC's.
 *
 * The bug class this pins: at 00:26 Asia/Baghdad the UTC clock still reads
 * the previous day (21:26). Any window or time_range built from UTC asks for
 * the wrong day for up to 3 hours after the account's midnight, so "today"
 * data neither gets requested from Meta nor shown in charts.
 *
 * Run: npx tsx test_freshness_dates.ts
 */
import assert from 'node:assert/strict';
import {
  getAccountLocalDateString,
  accountLocalTodayFloor,
  accountLocalDateFloor,
} from './src/lib/campaignSpending';
import { MetaClient } from './src/services/metaClient';

// 21:30 UTC on July 18 = 00:30 July 19 in Baghdad (UTC+3).
const midnightGap = new Date('2026-07-18T21:30:00Z');

// ── Local-day helpers ────────────────────────────────────────────────────

assert.equal(getAccountLocalDateString('Asia/Baghdad', midnightGap), '2026-07-19');
assert.equal(getAccountLocalDateString('UTC', midnightGap), '2026-07-18');
// US account at the same instant is still on the 18th (17:30 in New York).
assert.equal(getAccountLocalDateString('America/New_York', midnightGap), '2026-07-18');
// Invalid timezone falls back to UTC instead of throwing.
assert.equal(getAccountLocalDateString('Not/AZone', midnightGap), '2026-07-18');

assert.equal(accountLocalTodayFloor('Asia/Baghdad', midnightGap).toISOString(), '2026-07-19T00:00:00.000Z');
assert.equal(accountLocalDateFloor('Asia/Baghdad', 0, midnightGap).toISOString(), '2026-07-19T00:00:00.000Z');
assert.equal(accountLocalDateFloor('Asia/Baghdad', 7, midnightGap).toISOString(), '2026-07-12T00:00:00.000Z');
assert.equal(accountLocalDateFloor('UTC', 7, midnightGap).toISOString(), '2026-07-11T00:00:00.000Z');

// ── MetaClient time_range — the actual request contract ──────────────────

async function capturedTimeRange(timezone: string | undefined): Promise<{ since: string; until: string }> {
  let captured = '';
  const fetchImpl = (async (url: RequestInfo | URL) => {
    captured = String(url);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaClient({ apiVersion: 'v21.0', accessToken: 'test', fetchImpl, timezone });
  await client.getInsights({
    externalId: 'act_1',
    level: 'account',
    since: new Date(midnightGap.getTime() - 28 * 864e5),
    until: midnightGap,
  });
  const params = new URL(captured).searchParams;
  return JSON.parse(params.get('time_range')!);
}

async function main() {
  // Baghdad account at 00:30 local: until MUST be the just-started local day.
  const baghdad = await capturedTimeRange('Asia/Baghdad');
  assert.equal(baghdad.until, '2026-07-19');
  assert.equal(baghdad.since, '2026-06-21');

  // No timezone configured → UTC behavior (backward compatible).
  const utc = await capturedTimeRange(undefined);
  assert.equal(utc.until, '2026-07-18');

  console.log('✅ test_freshness_dates: all assertions passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
