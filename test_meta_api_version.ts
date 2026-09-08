// ════════════════════════════════════════════════════════════════════════
//  test_meta_api_version.ts
//
//  Meta Graph/Marketing API v20.0 retires 2026-09-24. The audit that found
//  this (docs handed to the session, not committed here) also found the
//  Ad Library client on its OWN hard-coded v21.0, independent of
//  META_API_VERSION — so bumping one string would not have bumped both.
//
//  This pins three things: the default actually moved, the Ad Library
//  client no longer drifts from it, and the freshness guard that exists so
//  the NEXT retirement date does not require someone to remember to check
//  Meta's changelog.
//
//  Run: npx tsx test_meta_api_version.ts
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
  config,
  DEFAULT_META_API_VERSION,
  META_API_VERSION_RETIREMENTS,
  META_VERSION_WARNING_WINDOW_DAYS,
  metaApiVersionFreshnessCheck,
} from './src/config';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };
const eq = (a: unknown, b: unknown, m: string) =>
  (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : bad(`${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`));

// ── A. the default actually moved ─────────────────────────────────────────

eq(DEFAULT_META_API_VERSION, 'v26.0', 'DEFAULT_META_API_VERSION is v26.0');
// This process's env carries no META_API_VERSION override (CI never sets
// one), so the live singleton is the real proof the app boots on v26.0.
eq(config.meta.apiVersion, 'v26.0', 'config.meta.apiVersion resolves to v26.0 with no override');
eq(META_API_VERSION_RETIREMENTS['v20.0'], '2026-09-24', 'v20.0 retirement date is on record');

// ── B. the freshness guard — pure, so every branch is directly checkable ──

const RETIRE = Date.parse('2026-09-24');
const day = 86_400_000;

eq(metaApiVersionFreshnessCheck('v26.0', new Date('2026-08-23')), null,
  'the currently-configured version has no retirement date on record — silent, not a fabricated warning');
eq(metaApiVersionFreshnessCheck('v99.0', new Date('2026-08-23')), null,
  'a version this codebase has never configured produces no warning either — absence of data is not evidence of danger');

eq(metaApiVersionFreshnessCheck('v20.0', new Date(RETIRE - 121 * day)), null,
  '121 days out: below the window, silent');
{
  const r = metaApiVersionFreshnessCheck('v20.0', new Date(RETIRE - META_VERSION_WARNING_WINDOW_DAYS * day));
  eq(r?.status, 'warn', 'exactly 120 days out: warns (inclusive boundary)');
  if (r?.detail?.includes('120d')) ok('detail states the day count');
  else bad('detail missing day count');
}
{
  const r = metaApiVersionFreshnessCheck('v20.0', new Date(RETIRE - 1 * day));
  eq(r?.status, 'warn', '1 day out: warns');
  eq(r?.key, 'META_API_VERSION_FRESHNESS', 'warning is keyed for the boot checklist, not a generic config error');
}
{
  // Past retirement must still be 'warn', never 'fail' — 'fail' exits the
  // process at boot (assertConfigOrExit), and Meta's actual post-retirement
  // behavior is degraded, not a proven crash. Turning an unverified guess
  // into a boot-blocking exit would trade a real outage for a guessed one.
  const r = metaApiVersionFreshnessCheck('v20.0', new Date(RETIRE + 30 * day));
  eq(r?.status, 'warn', 'past retirement: still warn, never fail');
  if (r?.detail?.includes('retired')) ok('detail says retired, not just "retires"');
  else bad('detail does not distinguish past-tense');
}

// ── C. the second hard-coded version this audit actually found ───────────

{
  const src = readFileSync('./src/adAssessor/meta-ad-library.ts', 'utf8');
  // The bare digits legitimately appear in a comment explaining the history
  // of this fix; the defect class is the URL construction, not the digits.
  if (!src.includes('v21.0/ads_archive')) ok('meta-ad-library.ts no longer hard-codes v21.0 in the request URL');
  else bad('meta-ad-library.ts still hard-codes v21.0 in the request URL — the audit\'s exact finding');
  if (src.includes('config.meta.apiVersion')) ok('meta-ad-library.ts now reads config.meta.apiVersion — one point of change, not two');
  else bad('meta-ad-library.ts does not read config.meta.apiVersion');
}

{
  const env = readFileSync('./.env.example', 'utf8');
  if (/META_API_VERSION="v26\.0"/.test(env)) ok('.env.example documents the v26.0 default');
  else bad('.env.example still documents an old default');
  if (!/v20\.0/.test(env)) ok('.env.example carries no stale v20.0 reference');
  else bad('.env.example still mentions v20.0');
}

console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES, ${passed} passed`} ════\n`);
process.exit(failed ? 1 : 0);
