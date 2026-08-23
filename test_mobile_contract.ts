// ════════════════════════════════════════════════════════════════════════
//  test_mobile_contract.ts — Project Alpha's mobile client stays honest
//  about what it renders and stays in sync with what the server declares.
//
//  Scope, deliberately: STATIC assertions only, no server boot, no
//  database, no network — matching every other suite in `test:all` (see
//  test.yml's own comment: "the full suite passes with DATABASE_URL...
//  stripped from the environment"). The live journey (register → connect
//  Meta → dashboard → campaigns → why → password-change revocation) that
//  proved this contract during Alpha was run by hand against a local
//  Postgres + Redis and is recorded in docs/alpha/ALPHA_LAUNCH.md, not
//  wired into CI — this repository's CI contract has no database to give
//  it.
//
//  What this DOES check, mechanically, so the next drift fails a build
//  instead of a customer's screen:
//    1. mobile/app.json's URL scheme matches the server-owned constant the
//       Meta OAuth return depends on (src/lib/mobileClient.ts).
//    2. mobile's theme tokens are a byte-exact mirror of the web's
//       (src/ui/tokens.ts) — see mobile/src/theme/tokens.ts's own header.
//    3. the mobile app source contains no re-derivation of canonical
//       metrics/thresholds — the ALPHA launch invariants
//       (MOBILE_REDERIVES_* = NO) as a grep, not a promise.
//    4. bundle identifier / app identity fields are internally consistent.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

const MOBILE_DIR = 'mobile';

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): void {
  if (!existsSync(MOBILE_DIR)) {
    bad(`${MOBILE_DIR}/ does not exist — Project Alpha's client is missing`);
    report();
    return;
  }

  const appJson = readJson(`${MOBILE_DIR}/app.json`).expo;
  const mobileClientSrc = readFileSync('src/lib/mobileClient.ts', 'utf8');

  // ── 1. The Meta OAuth return scheme ─────────────────────────────────────
  console.log('\n── 1. app scheme matches the server-owned OAuth return constant ──');
  {
    const m = mobileClientSrc.match(/export const MOBILE_APP_SCHEME = '([^']+)'/);
    if (!m) {
      bad('src/lib/mobileClient.ts no longer exports MOBILE_APP_SCHEME as a string literal');
    } else if (appJson.scheme === m[1]) {
      ok(`mobile/app.json scheme ("${appJson.scheme}") matches MOBILE_APP_SCHEME`);
    } else {
      bad(`mobile/app.json scheme ("${appJson.scheme}") != MOBILE_APP_SCHEME ("${m[1]}") — `
        + 'the Meta OAuth return (ASWebAuthenticationSession) would never close');
    }
    // The config.ts constant mirrors the same literal — belt-and-suspenders,
    // since it is what MetaConnectScreen actually imports at runtime.
    const cfgSrc = readFileSync(`${MOBILE_DIR}/src/api/config.ts`, 'utf8');
    const cfgM = cfgSrc.match(/export const APP_SCHEME = '([^']+)'/);
    if (cfgM && m && cfgM[1] === m[1]) ok('mobile/src/api/config.ts APP_SCHEME matches MOBILE_APP_SCHEME');
    else if (cfgM) bad(`mobile/src/api/config.ts APP_SCHEME ("${cfgM[1]}") != server MOBILE_APP_SCHEME`);
  }

  // ── 2. Theme tokens mirror src/ui/tokens.ts byte-for-byte ───────────────
  console.log('\n── 2. mobile theme is a byte-exact mirror of src/ui/tokens.ts ──');
  {
    const web = readFileSync('src/ui/tokens.ts', 'utf8');
    const mob = readFileSync(`${MOBILE_DIR}/src/theme/tokens.ts`, 'utf8');
    // Pull every `key: '#HEXVALUE'` pair out of the web tokens file's named
    // export blocks, then assert the same key/value pair appears in the
    // mobile mirror. Values only — comments and ordering may differ.
    const HEX = /(\w+):\s*'(#[0-9A-Fa-f]{6})'/g;
    const webPairs = new Map<string, string>();
    for (const match of web.matchAll(HEX)) webPairs.set(match[1], match[2].toUpperCase());

    // Only the keys the mobile file DECLARES it mirrors are checked — this
    // gate proves "what mobile has matches web", not "mobile has everything
    // web has" (the mobile client legitimately renders a subset).
    const mobPairs = new Map<string, string>();
    for (const match of mob.matchAll(HEX)) mobPairs.set(match[1], match[2].toUpperCase());

    let mismatches = 0;
    for (const [key, mobValue] of mobPairs) {
      const webValue = webPairs.get(key);
      if (webValue === undefined) continue; // mobile-only key (e.g. onBrand) — not a mirror claim
      if (webValue !== mobValue) {
        bad(`token "${key}" drifted: web=${webValue} mobile=${mobValue}`);
        mismatches++;
      }
    }
    if (mismatches === 0) ok(`${mobPairs.size} mobile token values checked against src/ui/tokens.ts — no drift`);

    // The two load-bearing accessibility splits called out in both files'
    // headers must survive as DISTINCT values, not collapsed to one.
    const faint = mobPairs.get('faint'); const nonText = mobPairs.get('nonText');
    if (faint && nonText && faint !== nonText) ok('text.faint and text.nonText remain distinct (3.2:1 stays non-text-only)');
    else bad('text.faint and text.nonText collapsed to the same value — nonText would carry words at 3.2:1');

    const good = mobPairs.get('good'); const goodFill = mobPairs.get('goodFill');
    if (good && goodFill && good !== goodFill) ok('semantic.good and semantic.goodFill remain distinct (4.0:1 stays fill-only)');
    else bad('semantic.good and semantic.goodFill collapsed — goodFill (4.0:1) would carry text');
  }

  // ── 3. No re-derivation of canonical intelligence ───────────────────────
  console.log('\n── 3. ALPHA launch invariants: MOBILE_REDERIVES_* = NO ──');
  {
    const srcFiles = listTsFiles(`${MOBILE_DIR}/src`);
    const violations: string[] = [];
    // Patterns that would mean the app computed a canonical number instead
    // of rendering the DTO's own `display`/label field. Deliberately narrow:
    // this is not a general "no arithmetic" ban (Metric.tsx does subtract
    // for a delta arrow's sign, which is fine) — it targets the specific
    // shapes a re-derivation actually takes in this codebase.
    const REDERIVE_PATTERNS: Array<[RegExp, string]> = [
      [/\?\?\s*0\b/, 'a `?? 0` fallback — a canonical metric must render as absent, never as a reassuring zero (ALPHA rule 10)'],
      [/health\s*[:=]\s*[\w.]+\s*[+\-*/]/, 'arithmetic on a health value — health scores are canonical, not computed client-side'],
      [/confidence\s*[<>]=?\s*0\.\d/, 'a hardcoded confidence threshold — confidence bands are the Brain\'s, not the client\'s'],
    ];
    for (const file of srcFiles) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, reason] of REDERIVE_PATTERNS) {
        if (pattern.test(text)) violations.push(`${file}: ${reason}`);
      }
    }
    if (violations.length === 0) ok(`${srcFiles.length} mobile source files scanned — no re-derivation pattern found`);
    else violations.forEach((v) => bad(v));
  }

  // ── 4. App identity is internally consistent ────────────────────────────
  console.log('\n── 4. app identity fields are internally consistent ──');
  {
    if (typeof appJson.ios?.bundleIdentifier === 'string' && /^[a-z0-9.]+$/i.test(appJson.ios.bundleIdentifier)) {
      ok(`bundle identifier "${appJson.ios.bundleIdentifier}" is well-formed`);
    } else {
      bad(`bundle identifier missing or malformed: ${JSON.stringify(appJson.ios?.bundleIdentifier)}`);
    }
    if (appJson.ios?.config?.usesNonExemptEncryption === false) {
      ok('usesNonExemptEncryption declared false (no custom crypto — HTTPS/TLS only)');
    } else {
      bad('usesNonExemptEncryption not explicitly false — App Store Connect will ask at every submission');
    }
    if (typeof appJson.version === 'string' && typeof appJson.ios?.buildNumber === 'string') {
      ok(`version ${appJson.version}, build ${appJson.ios.buildNumber}`);
    } else {
      bad('version/buildNumber missing — TestFlight needs both');
    }
  }

  report();
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function report(): void {
  console.log(`\n════ ${passed} passed, ${failed} failed ════`);
  if (failed > 0) process.exit(1);
}

main();
