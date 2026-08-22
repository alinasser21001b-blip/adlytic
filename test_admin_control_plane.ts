/**
 * The Adlytic Control Plane — one shell, one map, and nothing lost.
 *
 * Four claims this suite refuses to take on trust:
 *
 *  1. ONE ADMIN PRODUCT. There were several: a classic console, an Admin OS,
 *     a platform-observability page, a Meta readiness page that looked like a
 *     different application. Consolidating them is only real if no second
 *     shell and no second sidebar survive.
 *
 *  2. NOTHING LOST. Every consolidation risks deleting a capability because
 *     the page around it looked old. `docs/close-code/12` recorded one
 *     near-miss already. So parity is COMPUTED from the capability registry,
 *     and — the part that actually bites — a capability may only claim a
 *     Control Plane home if the page serving that route really calls its
 *     backend. A registry of intentions cannot prove nothing was lost.
 *
 *  3. AUTHORIZATION UNCHANGED. Seven new page routes and three new API routes
 *     are exactly seven and three new chances to forget the gate.
 *
 *  4. THE UI STILL DOES NOT REASON. New surfaces are new places for a
 *     threshold to appear.
 *
 * Run: npx tsx test_admin_control_plane.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ADMIN_IA, ADMIN_LEGACY, adminDestinations,
} from './src/web/pages/adminSurfaceNav';
import {
  ADMIN_CAPABILITIES, capabilitiesForDomain, duplicatedCapabilities,
  legacyRoutes, routeParity, unhostedCapabilities,
} from './src/web/pages/adminCapabilities';
import { adminShell } from './src/web/adminShell';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const serverSrc = src('src/api/server.ts');

/**
 * A page's source PLUS the sibling modules it embeds.
 *
 * The graph surfaces inline `GRAPH_VIEW_JS` from systemGraphView.ts, so the
 * fetch that serves them is a literal in that module, not in the page. The
 * shipped document contains both, and a parity check that only greps the page
 * file would call a working capability unproven — and the obvious way to
 * "fix" that would be to duplicate the component into each page, which is the
 * one thing this whole exercise exists to stop.
 */
function pageSourceWithEmbeds(page: string): string {
  const self = src(`src/web/pages/${page}.ts`);
  const embedded = [...self.matchAll(/from '\.\/([A-Za-z0-9_]+)'/g)].map((m) => m[1]!);
  return self + embedded.map((m) => {
    try { return src(`src/web/pages/${m}.ts`); } catch { return ''; }
  }).join('\n');
}

/** The Control Plane surfaces, and the route each one serves. */
const CONTROL_PLANE_PAGES: Array<[string, string]> = [
  ['controlCenterPage', '/admin'],
  ['systemGraphPage', '/admin/graph'],
  ['metaDataWorkspacePage', '/admin/meta'],
  ['intelligenceWorkspacePage', '/admin/intelligence'],
  ['operationsWorkspacePage', '/admin/operations'],
  ['customersWorkspacePage', '/admin/customers'],
  ['supportWorkspacePage', '/admin/support'],
];

const LEGACY_PAGES = [
  'adminOsPage', 'adminConsolePage', 'adminDashboardPage',
  'adminInboxPage', 'metaReadinessPage',
];

/** Strip the ':param' segments so a registry route matches a mounted one. */
function routePattern(backend: string): string {
  return backend.replace(/^[A-Z]+ /, '').replace(/:[A-Za-z]+/g, '');
}

function run() {
  console.log('\n── 1. Exactly one Control Plane ──');

  check('there is exactly one admin shell', () => {
    // The mechanism behind "one shell" is that there is only one function
    // producing an admin document. A second one is how a second product grows.
    for (const [page] of CONTROL_PLANE_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(p.includes('adminShell('),
        `${page} must render through the one shell`);
      assert.ok(!p.includes('<!DOCTYPE html>'),
        `${page} builds its own document — that is a second shell`);
    }
  });

  check('no Control Plane surface carries a sidebar of its own', () => {
    for (const [page] of CONTROL_PLANE_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(!/class="rail"|<aside class="rail/.test(p),
        `${page} draws its own rail — the shell owns navigation`);
      assert.ok(!p.includes('adminSurfaceNav('),
        `${page} renders the map itself instead of letting the shell do it`);
    }
  });

  check('the IA has exactly six top-level domains, each with a question', () => {
    assert.equal(ADMIN_IA.length, 6, 'six domains, one operator question each');
    const keys = ADMIN_IA.map((s) => s.key);
    assert.deepEqual(keys, [...new Set(keys)], 'a duplicated domain is duplicated truth');
    for (const s of ADMIN_IA) {
      assert.ok(s.items.length > 0, `${s.key} renders empty — a heading with nothing under it`);
      assert.ok(s.question.trim().endsWith('؟'),
        `${s.key} must state the question it answers`);
    }
  });

  check('every Control Plane route is mounted and offered exactly once', () => {
    const offered = adminDestinations().map((d) => d.href);
    for (const [, route] of CONTROL_PLANE_PAGES) {
      assert.ok(serverSrc.includes(`app.get('${route}'`), `${route} is not mounted`);
    }
    assert.deepEqual(offered, [...new Set(offered)], 'a destination is offered twice');
  });

  console.log('\n── 2. Nothing was lost ──');

  check('every capability names a backend that is actually mounted', () => {
    const missing: string[] = [];
    for (const c of ADMIN_CAPABILITIES) {
      if (c.canonicalBackend === '—') continue;
      const pattern = routePattern(c.canonicalBackend);
      // Mounted routes carry the ':param' names; compare on the stripped form.
      const mountedStripped = [...serverSrc.matchAll(/app\.[a-z]+\('(\/api\/admin[^']*)'/g)]
        .map((m) => m[1]!.replace(/:[A-Za-z]+/g, ''));
      if (!mountedStripped.includes(pattern)) missing.push(c.id + ' → ' + c.canonicalBackend);
    }
    assert.deepEqual(missing, [], `capabilities pointing at routes that do not exist: ${missing.join(', ')}`);
  });

  check('a capability may only claim a Control Plane home if that page really calls it', () => {
    // THE load-bearing assertion. Without it the registry is a wish list, and
    // "parity = 100%" would mean somebody typed a route into a field.
    //
    // Two things count as calling a route. The obvious one is a literal URL in
    // the page. The other is consuming `ops:ready` — the shell fetches
    // /api/admin/ops once and hands the snapshot to every surface, so a page
    // reading that event IS served by that route, and making each page refetch
    // it just to satisfy a grep would be a worse product.
    const byRoute = new Map(CONTROL_PLANE_PAGES.map(([page, route]) => [route, page]));
    const shellFetchesOps = src('src/web/adminShell.ts').includes("'/api/admin/ops'");
    const unproven: string[] = [];
    for (const c of ADMIN_CAPABILITIES) {
      if (!c.controlPlaneRoute) continue;
      const page = byRoute.get(c.controlPlaneRoute);
      // Surfaces the Control Plane keeps as-is (the Observatory, the wizard)
      // are their own home; they are covered by the legacy/IA checks instead.
      if (!page) continue;
      const p = pageSourceWithEmbeds(page);
      const path = routePattern(c.canonicalBackend);

      if (path === '/api/admin/ops') {
        assert.ok(shellFetchesOps, 'the shell must be the one place /api/admin/ops is fetched');
        if (p.includes('ops:ready') || p.includes(path)) continue;
        unproven.push(`${c.id} claims ${c.controlPlaneRoute} but ${page} neither calls ${path} nor reads ops:ready`);
        continue;
      }
      // Stripping ':param' leaves '//' where a segment used to be. Require
      // every literal chunk instead, so a URL assembled around an id still
      // proves the call.
      const chunks = path.split('//').map((x) => x.replace(/\/$/, '')).filter((x) => x.length > 1);
      if (chunks.every((chunk) => p.includes(chunk))) continue;
      unproven.push(`${c.id} claims ${c.controlPlaneRoute} but ${page} never calls ${path}`);
    }
    assert.deepEqual(unproven, [], unproven.join('\n      '));
  });

  check('every important capability is reachable from the Control Plane', () => {
    const orphans = unhostedCapabilities().map((c) => `${c.id} (${c.name})`);
    // One is expected and declared: reconcile-actions has no operator surface
    // in EITHER console and never did. It is listed so it cannot be forgotten,
    // and it is the only one allowed to be unhosted.
    assert.deepEqual(orphans, ['cap.ops.reconcileActions (إصلاح تداخل الأحداث التاريخية)'],
      `capabilities with no Control Plane home: ${orphans.join(', ')}`);
  });

  check('an unhosted capability must say WHY, classified', () => {
    // "We did not get to it" and "a button here would be dangerous" are
    // opposite conclusions that look identical in a table of nulls. Without
    // this, the second decays into a to-do somebody later "fixes" by adding
    // the button — which is how a bulk history rewrite gets a one-click UI.
    for (const c of unhostedCapabilities()) {
      assert.ok(c.unhostedReason, `${c.id} has no Control Plane home and no stated reason`);
      assert.ok(c.unhostedReason!.why.trim().length > 40,
        `${c.id}'s reason must be an argument, not a label`);
    }
    const reconcile = ADMIN_CAPABILITIES.find((c) => c.id === 'cap.ops.reconcileActions')!;
    assert.equal(reconcile.unhostedReason!.kind, 'MANUAL_ONLY',
      'a bulk rewrite of stored measurement history is manual-only, not a missing feature');
  });

  check('every domain actually holds capabilities', () => {
    for (const s of ADMIN_IA) {
      const domain = s.key === 'CONTROL_CENTER' ? 'CONTROL_CENTER' : s.key;
      const caps = capabilitiesForDomain(domain as never);
      assert.ok(caps.length > 0, `${s.key} is offered but owns no capability`);
    }
  });

  check('a legacy route may be deprecated only at full parity', () => {
    for (const route of legacyRoutes()) {
      const p = routeParity(route);
      assert.equal(p.safeToDeprecate, p.missingCapabilities.length === 0,
        'safeToDeprecate must be exactly "nothing missing", never a judgement call');
      if (p.missingCapabilities.length > 0) {
        assert.equal(p.safeToDeprecate, false, `${route} claims deprecation with gaps`);
        assert.ok(p.parityPct < 100, `${route} reports 100% with missing capabilities`);
      }
    }
  });

  check('every legacy route is still mounted and still declared', () => {
    const declared = new Set(ADMIN_LEGACY.map((l) => l.href));
    for (const route of legacyRoutes()) {
      assert.ok(declared.has(route),
        `${route} owns capabilities but is not declared in ADMIN_LEGACY — an undocumented survivor`);
      assert.ok(serverSrc.includes(`app.get('${route}'`), `${route} is declared but not mounted`);
    }
  });

  check('duplicate surfaces are recorded, not silently kept', () => {
    for (const d of duplicatedCapabilities()) {
      const target = ADMIN_CAPABILITIES.find((c) => c.id === d.duplicateOf);
      assert.ok(target, `${d.id} duplicates ${d.duplicateOf}, which does not exist`);
      assert.equal(target!.canonicalBackend, d.canonicalBackend,
        'a duplicate must share the backend it duplicates, or it is not a duplicate');
      assert.equal(d.action, 'MERGE', `${d.id} is a duplicate but is not marked MERGE`);
    }
  });

  console.log('\n── 3. Authorization is still server-side ──');

  check('every Control Plane page route is behind the adminPage gate', () => {
    for (const [, route] of CONTROL_PLANE_PAGES) {
      const line = serverSrc.split('\n').find((l) => l.includes(`app.get('${route}'`))!;
      assert.ok(line.includes('adminPage'), `${route} bypasses the adminPage gate`);
    }
  });

  check('every graph API route is behind requirePlatformAdmin', () => {
    const lines = serverSrc.split('\n');
    const unguarded: string[] = [];
    lines.forEach((ln, i) => {
      const m = /app\.(get|post|patch|put|delete)\('(\/api\/admin\/graph[^']*)'/.exec(ln);
      if (!m) return;
      if (!lines.slice(i, i + 12).join('\n').includes('requirePlatformAdmin')) {
        unguarded.push(`${m[1]!.toUpperCase()} ${m[2]}`);
      }
    });
    assert.deepEqual(unguarded, [], `unguarded graph routes: ${unguarded.join(', ')}`);
  });

  check('no Control Plane surface branches on admin-ness client-side', () => {
    for (const [page] of CONTROL_PLANE_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(!/isPlatformAdmin\s*\?|role\s*===\s*['"]admin['"]/.test(p),
        `${page} decides authorization in the browser — the server owns that`);
    }
    const shell = src('src/web/adminShell.ts');
    assert.ok(!/isPlatformAdmin\s*\?|role\s*===\s*['"]admin['"]/.test(shell),
      'the shell must not gate on admin-ness in the browser either');
  });

  check('destructive and privileged actions confirm before firing', () => {
    // The server is the boundary; this is about not discovering that a button
    // was irreversible by pressing it.
    const cust = src('src/web/pages/customersWorkspacePage.ts');
    assert.ok(cust.includes("method: 'DELETE'"), 'the delete capability must still be present');
    assert.ok(cust.includes('prompt('),
      'the destructive delete must require typing the customer identity, not a yes/no box');
    const ops = src('src/web/pages/operationsWorkspacePage.ts');
    assert.ok(ops.includes('confirm('), 'privileged operations actions must confirm');
  });

  console.log('\n── 4. The Control Plane renders; it does not reason ──');

  check('no Control Plane surface re-derives canonical intelligence', () => {
    for (const [page] of CONTROL_PLANE_PAGES.concat([['adminShell' as string, '']] as never)) {
      const rel = page === 'adminShell' ? 'src/web/adminShell.ts' : `src/web/pages/${page}.ts`;
      const p = src(rel);
      const derivation = p.match(
        /\*\s*1000\b|\/\s*impressions\b|problemClass\s*===\s*['"]|reconcileIntelligence\s*\(|diagnoseFunnel\s*\(|detectAnomaly\s*\(|buildEntityIntelligence\s*\(/g,
      ) || [];
      assert.deepEqual(derivation, [],
        `${rel} recomputes canonical intelligence: ${derivation.join(', ')}`);
    }
  });

  check('no Control Plane surface introduces a threshold of its own', () => {
    for (const [page] of CONTROL_PLANE_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      const thresholds = p.match(/[<>]=?\s*0\.\d+/g) || [];
      assert.deepEqual(thresholds, [],
        `${page} judges against a numeric band — bands are server-owned: ${thresholds.join(', ')}`);
    }
  });

  check('absence keeps its own treatment on every new surface', () => {
    // UNKNOWN and NOT_TESTED must never be mapped to the healthy tone. The
    // pages carry a local tone table for rendering; this checks the table.
    for (const [page] of CONTROL_PLANE_PAGES) {
      const p = src(`src/web/pages/${page}.ts`);
      if (!p.includes('UNKNOWN:')) continue;
      assert.ok(/UNKNOWN:\s*\[\s*'absent'/.test(p),
        `${page} maps UNKNOWN to something other than the absence tone`);
      assert.ok(!/NOT_TESTED:\s*\[\s*'(ok|bad)'/.test(p),
        `${page} renders NOT_TESTED as a verdict`);
    }
  });

  console.log('\n── 5. The shell actually renders what it promises ──');

  const html = adminShell({
    active: 'control-center', title: 'اختبار', subtitle: 'سطر',
    body: '<div id="probe">x</div>',
    views: [{ id: 'a', label: 'ألف' }, { id: 'b', label: 'باء' }],
    commands: [{ label: 'أمر اختبار', href: '#a' }],
  });

  check('the shell renders sidebar, context bar, palette, operator state and attention', () => {
    for (const [needle, what] of [
      ['class="rail"', 'the global sidebar'],
      ['class="ctxbar"', 'the context bar'],
      ['id="cmd"', 'the command palette'],
      ['id="btn-logout"', 'operator logout'],
      ['id="who-name"', 'operator identity'],
      ['id="att-drawer"', 'the attention centre'],
      ['class="page"', 'the page container'],
    ] as const) {
      assert.ok(html.includes(needle), `the shell must render ${what}`);
    }
  });

  check('the context bar carries every context the spec asks for', () => {
    for (const id of ['ctx-env', 'ctx-build', 'ctx-role', 'ctx-workspace', 'ctx-account', 'ctx-entity']) {
      assert.ok(html.includes(`id="${id}"`), `context bar is missing ${id}`);
    }
    // Unset context is dashed, not blank and not guessed.
    assert.ok(html.includes('is-unset'), 'unresolved context must render as visibly unset');
  });

  check('the palette carries every IA destination without being told', () => {
    for (const d of adminDestinations()) {
      assert.ok(html.includes(`"href":"${d.href}"`),
        `${d.href} is a destination but not a command — the palette would miss it`);
    }
  });

  check('the shell renders exactly one navigation product', () => {
    assert.equal((html.match(/class="rail"/g) || []).length, 1, 'two rails is two products');
    assert.equal((html.match(/id="cmd"/g) || []).length, 1, 'two palettes is two products');
    const views = html.match(/class="view-tab"/g) || [];
    assert.equal(views.length, 2, 'the view strip must render the views it was given, and only those');
  });

  check('the shell escapes what surfaces hand it', () => {
    const hostile = adminShell({
      active: 'control-center', title: '<script>x</script>', subtitle: '"quo"', body: '',
    });
    assert.ok(!hostile.includes('<title><script>'), 'a title must not open a tag');
    assert.ok(hostile.includes('&lt;script&gt;'), 'the title must be escaped');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════\n`);
  if (failures.length) process.exit(1);
}

run();
