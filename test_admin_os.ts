/**
 * Admin operating system — one map, one status vocabulary, one gate.
 *
 * Three problems this suite pins down:
 *
 *  1. THREE NAVIGATION MAPS. adminSurfaceNav listed five destinations,
 *     adminConsolePage carried its own seven groups, adminOsPage four more.
 *     None of the three listed the Brain Observatory, so the system's primary
 *     intelligence diagnostic could only be reached by typing its URL.
 *
 *  2. CONFLATABLE STATUS. UNKNOWN is not HEALTHY, NOT_TESTED is not FAILED,
 *     NOT_VETOED is not RECOMMENDED, NOT_GOVERNED is not PERMITTED,
 *     NOT_REACHED is not a neutral conclusion. The engines spend real effort
 *     preserving those distinctions; rendering either member of a pair the
 *     same way throws that away at the last inch.
 *
 *  3. AUTHORIZATION BY CONVENTION. Every admin route is guarded today. Nothing
 *     made that a rule, so the next route added is guarded only if someone
 *     remembers.
 *
 * Run: npx tsx test_admin_os.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ADMIN_IA, ADMIN_LEGACY, adminDestinations, adminSurfaceNav } from './src/web/pages/adminSurfaceNav';
import { MUST_DIFFER, ABSENCE_STATES, statusStyle, statusChip, ADMIN_STATUS_CSS } from './src/web/pages/adminStatus';
import type { AdminStatus } from './src/web/pages/adminStatus';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const serverSrc = src('src/api/server.ts');

/**
 * Every admin surface that must render the shared map.
 *
 * The Control Plane surfaces reach it through `adminShell`, which renders
 * `adminSurfaceNav` itself — so the assertion below accepts either, and a
 * page that draws its own menu still fails.
 */
const ADMIN_PAGES = [
  // Legacy surfaces, still mounted.
  'adminOsPage', 'adminConsolePage', 'adminDashboardPage', 'adminInboxPage',
  'brainObservatoryPage', 'metaReadinessPage', 'addClientPage',
  // Control Plane surfaces.
  'controlCenterPage', 'systemGraphPage', 'metaDataWorkspacePage',
  'intelligenceWorkspacePage', 'operationsWorkspacePage',
  'customersWorkspacePage', 'supportWorkspacePage',
];

function run() {
  console.log('\n── 1. ONE information architecture ──');

  check('every admin surface renders the shared map', () => {
    for (const page of ADMIN_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(p.includes('adminSurfaceNav') || p.includes('adminShell'),
        `${page} must render the shared IA, not invent its own map`);
    }
  });

  check('the Brain Observatory is reachable by navigation', () => {
    // It existed and could not be found — present in none of the three maps.
    const dest = adminDestinations().find((d) => d.href === '/admin/brain-observatory');
    assert.ok(dest, 'the primary intelligence diagnostic must appear in the IA');
    assert.equal(dest!.id, 'observatory');
    const section = ADMIN_IA.find((s) => s.items.some((i) => i.id === 'observatory'));
    assert.equal(section!.key, 'INTELLIGENCE', 'and it belongs under INTELLIGENCE');
    assert.ok(adminSurfaceNav('console').includes('/admin/brain-observatory'),
      'the rendered nav must actually contain the link');
  });

  check('no section is rendered empty', () => {
    // A heading with nothing under it claims a capability that does not exist.
    for (const s of ADMIN_IA) {
      assert.ok(s.items.length > 0, `section ${s.key} has no destinations — it must not be rendered`);
      assert.ok(s.label.trim().length > 0, `section ${s.key} needs a label`);
    }
  });

  check('every IA destination is a real mounted route', () => {
    for (const d of adminDestinations()) {
      assert.ok(serverSrc.includes(`'${d.href}'`),
        `${d.href} is offered in the nav but not mounted in server.ts — a dead menu entry`);
      assert.ok(d.purpose.trim().length > 0, `${d.href} must say what it answers`);
    }
  });

  check('every mounted admin page is reachable from the IA or a declared successor', () => {
    const mounted = [...serverSrc.matchAll(/app\.get\('(\/admin[^']*)'/g)].map((m) => m[1]!);
    const offered = new Set(adminDestinations().map((d) => d.href));
    const legacy = new Set(ADMIN_LEGACY.map((l) => l.href));
    // /admin/login is deliberately outside: it is the unauthenticated door.
    const orphaned = mounted.filter(
      (r) => r !== '/admin/login' && !offered.has(r) && !legacy.has(r));
    assert.deepEqual(orphaned, [],
      `mounted but unreachable by navigation: ${orphaned.join(', ')}`);
  });

  check('a legacy route dropped from the sidebar is still reachable from its successor', () => {
    // Removing a route from the menu without linking it from the surface that
    // replaced it is not consolidation — it is hiding, which is how capability
    // gets lost while everyone believes it was migrated.
    for (const l of ADMIN_LEGACY) {
      assert.ok(serverSrc.includes(`'${l.href}'`),
        `${l.href} is declared legacy but is no longer mounted — capability would vanish`);
      const successor = src(`src/web/pages/${l.reachableFrom}.ts`);
      assert.ok(successor.includes(l.href),
        `${l.reachableFrom} must link to ${l.href} until parity is proven`);
      assert.ok(l.stillOwns.trim().length > 0,
        `${l.href} must say what it still owns, not merely that it exists`);
    }
  });

  check('no legacy surface appears in the global sidebar', () => {
    // The previous map listed the historical pages under domain headings, so
    // clicking a domain left the console. A legacy route in the sidebar means
    // two products are being offered as one.
    const offered = new Set(adminDestinations().map((d) => d.href));
    for (const l of ADMIN_LEGACY) {
      assert.ok(!offered.has(l.href),
        `${l.href} is legacy and must not be a global destination`);
    }
  });

  check('no destination is offered twice', () => {
    const hrefs = adminDestinations().map((d) => d.href);
    assert.deepEqual(hrefs, [...new Set(hrefs)], 'a duplicated destination is duplicated truth');
    const ids = adminDestinations().map((d) => d.id);
    assert.deepEqual(ids, [...new Set(ids)]);
  });

  console.log('\n── 2. Canonical status vocabulary ──');

  check('states that mean different things never render identically', () => {
    for (const [a, b] of MUST_DIFFER) {
      const sa = statusStyle(a), sb = statusStyle(b);
      assert.notEqual(`${sa.tone}|${sa.glyph}`, `${sb.tone}|${sb.glyph}`,
        `${a} and ${b} render the same — that is the conflation this vocabulary exists to prevent`);
    }
  });

  check('absence is always dashed and muted — never green, never red', () => {
    for (const s of ABSENCE_STATES) {
      assert.equal(statusStyle(s).tone, 'absent',
        `${s} asserts absence of knowledge; it must not borrow a verdict's colour`);
    }
    // The specific failures worth naming.
    assert.notEqual(statusStyle('UNKNOWN').tone, statusStyle('HEALTHY').tone, 'UNKNOWN must never look healthy');
    assert.notEqual(statusStyle('UNKNOWN').tone, statusStyle('FAILED').tone, 'UNKNOWN must never look failed');
    assert.notEqual(statusStyle('NOT_TESTED').tone, statusStyle('FAILED').tone, 'NOT_TESTED must never look failed');
    assert.notEqual(statusStyle('NOT_VETOED').tone, statusStyle('RECOMMENDED').tone, 'NOT_VETOED is not advice');
  });

  check('colour is never the only signal', () => {
    // Survives greyscale, colour-blindness and a screenshot in a ticket.
    const seen = new Map<string, AdminStatus[]>();
    for (const [a, b] of MUST_DIFFER) {
      for (const s of [a, b]) {
        const g = statusStyle(s).glyph;
        seen.set(g, [...(seen.get(g) ?? []), s]);
      }
    }
    for (const [a, b] of MUST_DIFFER) {
      assert.notEqual(statusStyle(a).glyph + statusStyle(a).labelAr,
        statusStyle(b).glyph + statusStyle(b).labelAr,
        `${a} and ${b} share a glyph AND a label — indistinguishable without colour`);
    }
  });

  check('the chip renders its literal state name for a reader and a screenshot', () => {
    const html = statusChip('NOT_GOVERNED');
    assert.ok(html.includes('title="NOT_GOVERNED"'), 'the canonical name must survive translation');
    assert.ok(html.includes('st-absent'), 'and carry the absence treatment');
    assert.ok(ADMIN_STATUS_CSS.includes('.st-absent') && ADMIN_STATUS_CSS.includes('dashed'),
      'absence must be dashed in the stylesheet, not only in intent');
  });

  console.log('\n── 3. Authorization is a rule, not a habit ──');

  check('every admin API route is behind requirePlatformAdmin', () => {
    const lines = serverSrc.split('\n');
    const unguarded: string[] = [];
    lines.forEach((ln, i) => {
      const m = /app\.(get|post|patch|put|delete)\('(\/api\/admin[^']*)'/.exec(ln);
      if (!m) return;
      if (!lines.slice(i, i + 40).join('\n').includes('requirePlatformAdmin')) {
        unguarded.push(`${m[1]!.toUpperCase()} ${m[2]}`);
      }
    });
    assert.deepEqual(unguarded, [], `unguarded admin API routes: ${unguarded.join(', ')}`);
  });

  check('every admin page route is behind the adminPage gate', () => {
    const lines = serverSrc.split('\n').filter((l) => /app\.get\('\/admin/.test(l));
    for (const ln of lines) {
      const href = /app\.get\('([^']+)'/.exec(ln)![1]!;
      if (href === '/admin/login') {
        assert.ok(!ln.includes('adminPage'), '/admin/login is the unauthenticated door — gating it locks everyone out');
        continue;
      }
      assert.ok(ln.includes('adminPage'), `${href} must go through the adminPage gate`);
    }
  });

  check('authorization is server-side, not a UI decision', () => {
    // A page that hides a control is not a guard; the route must refuse.
    for (const page of ADMIN_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(!/isPlatformAdmin\s*\?|role\s*===\s*['"]admin['"]/.test(p),
        `${page} appears to branch on admin-ness client-side — the server owns that decision`);
    }
  });

  console.log('\n── 4. The admin UI renders; it does not reason ──');

  check('no admin surface re-derives canonical intelligence', () => {
    for (const page of ADMIN_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      // Call syntax, not bare words: these pages legitimately DISCUSS the
      // reconciler in comments; what they must not do is invoke one.
      const derivation = p.match(
        /\*\s*1000\b|\/\s*impressions\b|problemClass\s*===\s*['"]|reconcileIntelligence\s*\(|diagnoseFunnel\s*\(|detectAnomaly\s*\(|buildEntityIntelligence\s*\(/g,
      ) || [];
      assert.deepEqual(derivation, [],
        `${page} must display canonical output, not recompute it: ${derivation.join(', ')}`);
    }
  });

  check('no admin surface introduces a threshold of its own', () => {
    for (const page of ADMIN_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      const thresholds = p.match(/[<>]=?\s*0\.\d+/g) || [];
      assert.deepEqual(thresholds, [],
        `${page} judges against a numeric band — bands are server-owned: ${thresholds.join(', ')}`);
    }
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

run();
