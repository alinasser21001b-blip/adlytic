/**
 * The Control Plane, judged as an operator would judge it.
 *
 * `test_admin_control_plane.ts` proves the structure: one shell, one IA, no
 * lost capability, no auth gap. It cannot prove the thing an operator
 * actually cares about — that the console stays honest and usable when the
 * platform is NOT healthy.
 *
 * The rendered audit (tools/admin-acceptance/) drives real pages in a browser
 * across every scenario below and is the primary evidence. This suite is its
 * static counterpart: it pins the properties that browser run verified, so a
 * later edit that quietly removes an error state fails here even if nobody
 * re-runs Chromium.
 *
 * Two failures found by the rendered audit are pinned specifically, because
 * both were invisible to source review and both would silently come back:
 *   · panels that keep animating a skeleton after their request already failed;
 *   · timestamps rendered as raw ISO in a column an operator scans.
 *
 * Run: npx tsx test_admin_acceptance.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCENARIOS, USAGE } from './tools/admin-acceptance/fixtures';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}
const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/**
 * Source with comments removed, for guards that must judge CODE, not prose.
 *
 * These files document the defect they were rebuilt to remove, quoting the
 * offending expression verbatim. A guard that fires on the explanation
 * pressures the next author to delete the explanation, which is the opposite
 * of what a comment like that is for.
 */
function code(rel: string): string {
  return src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Surfaces fed by the ops snapshot, and the regions each one fills from it. */
const OPS_DRIVEN: Array<[string, string[]]> = [
  ['controlCenterPage', ['pulse', 'attention', 'timeline', 'risk']],
  ['metaDataWorkspacePage', ['health', 'conn', 'sync', 'cov']],
  ['intelligenceWorkspacePage', ['boundary', 'ladder']],
  ['operationsWorkspacePage', ['subs', 'acts', 'unknown']],
];

const ALL_SURFACES = [
  'controlCenterPage', 'systemGraphPage', 'metaDataWorkspacePage',
  'intelligenceWorkspacePage', 'operationsWorkspacePage',
  'customersWorkspacePage', 'supportWorkspacePage',
];

function run() {
  console.log('\n── 1. The acceptance matrix exists and covers the states that matter ──');

  check('every operator state the brief names has a fixture', () => {
    const required = [
      'healthy', 'meta_disconnected', 'meta_permission_failure', 'database_unhealthy',
      'redis_unavailable', 'redis_not_configured', 'worker_unavailable', 'no_workspaces',
      'workspace_without_meta', 'stale_workspace', 'partial_data', 'unknown_intelligence',
      'graph_unavailable', 'graph_adapter_failure', 'graph_empty', 'api_errors',
    ];
    const have = Object.keys(SCENARIOS);
    const missing = required.filter((r) => !have.includes(r));
    assert.deepEqual(missing, [], `unscenarioed operator states: ${missing.join(', ')}`);
  });

  check('the meta-usage fixture is derived from the service type, not invented', () => {
    // The previous fixture was `{ callCount, appUsage }`. Neither field exists
    // on MetaUsageStats. It is typed now, so drift is a compile error — but
    // assert the nesting explicitly, because the nesting is what broke.
    const u = USAGE.healthy;
    assert.ok(u.counts && typeof u.counts === 'object', 'counts must be the nested object it really is');
    assert.ok(u.errorBreakdown15d && typeof u.errorBreakdown15d === 'object');
    assert.ok(u.latest && typeof u.latest === 'object');
    assert.ok(Object.keys(u.counts).length >= 10,
      'the real counts object has a dozen fields — a thin fixture hides the dump');
  });

  check('fixtures cannot describe a platform the services could not produce', () => {
    // A hand-written `attention: []` beside a blocked workspace made the
    // Control Center print "nothing needs intervention" directly above a failed
    // account — a self-contradiction no real snapshot can contain, because
    // adminOpsHealth pushes an ERROR item for every blocked connection.
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      const ops = (sc.api as any).ops;
      if (!ops || ops.__status) continue;
      const blocked = (ops.workspaces ?? []).filter(
        (w: any) => w.connection === 'ERROR' || w.connection === 'BLOCKED');
      if (!blocked.length) continue;
      assert.ok((ops.attention ?? []).length > 0,
        `scenario "${name}" has ${blocked.length} blocked workspace(s) and an empty attention queue — `
        + 'the ops snapshot cannot produce that state');
    }
  });

  check('the fixtures describe real shapes, not convenient ones', () => {
    // A fixture that omits the awkward fields tests a product that does not
    // exist. Each of these is a field the UI must survive being null.
    const partial = SCENARIOS['partial_data']!.api as any;
    const rows = partial.ops.workspaces;
    assert.ok(rows.some((w: any) => w.dataAgeDays === null), 'no fixture exercises a null data age');
    assert.ok(rows.some((w: any) => w.lastSyncedAt === null), 'no fixture exercises a never-synced workspace');
    assert.ok(rows.some((w: any) => w.workspaceName.length > 30), 'no fixture exercises a long Arabic label');
    const none = SCENARIOS['no_workspaces']!.api as any;
    assert.equal(none.ops.workspaces.length, 0, 'the empty-platform fixture is not empty');
    assert.equal(none.stats.brain.narrationCoveragePct, null,
      'an empty platform must report coverage as unknown, never as 0%');
  });

  console.log('\n── 2. Failure states, not spinners ──');

  check('every ops-driven surface handles the snapshot failing', () => {
    // Static reach only: a handler may repaint a region directly OR by calling
    // a render function that reads the now-null snapshot. Grepping for the id
    // would fail the second, correct pattern — and pushing authors to name ids
    // in the handler just to satisfy a grep is writing code for the test.
    // The rendered audit owns the real proof: it fails any page still showing
    // a skeleton after its request failed, per scenario.
    for (const [page, regions] of OPS_DRIVEN) {
      const p = src(`src/web/pages/${page}.ts`);
      assert.ok(p.includes("'ops:failed'"),
        `${page} reads the ops snapshot but never handles it failing`);
      const handler = p.slice(p.indexOf("addEventListener('ops:failed'"));
      const end = handler.indexOf('\n  });');
      const body = handler.slice(0, end > 0 ? end : 1200);
      const touchesDirectly = regions.some((r) => body.includes(`'${r}'`));
      const touchesViaRender = /render[A-Z]\w*\(\)/.test(body);
      assert.ok(touchesDirectly || touchesViaRender,
        `${page}'s ops:failed handler repaints nothing — its regions keep loading forever`);
    }
  });

  check('no surface leaves a skeleton as its only failure state', () => {
    // The rendered audit caught seven of these across three surfaces. A
    // spinner that never resolves says "loading" indefinitely, which is a
    // worse answer than an error.
    for (const [page] of OPS_DRIVEN) {
      const p = src(`src/web/pages/${page}.ts`);
      const handler = p.slice(p.indexOf("addEventListener('ops:failed'"));
      const end = handler.indexOf('\n  });');
      const body = handler.slice(0, end > 0 ? end : 900);
      assert.ok(!body.includes('class="skel"'),
        `${page} re-renders a skeleton in its failure handler`);
      assert.ok(/تعذّر|غير متاح/.test(body),
        `${page}'s failure handler does not say anything went wrong`);
    }
  });

  check('a failed fetch never leaves a surface silent', () => {
    for (const page of ALL_SURFACES) {
      const p = src(`src/web/pages/${page}.ts`);
      const fetches = (p.match(/adminFetch\(/g) || []).length;
      if (fetches === 0) continue;
      const catches = (p.match(/\.catch\(/g) || []).length;
      assert.ok(catches >= 1, `${page} calls ${fetches} endpoints and catches nothing`);
    }
  });

  console.log('\n── 2b. No raw JSON in primary operator UI ──');

  check('no admin surface stringifies a payload into primary content', () => {
    // THE regression that shipped. metaDataWorkspacePage rendered
    //   Object.keys(payload).slice(0,12).map(v => typeof v === 'object' ? JSON.stringify(v) : v)
    // which, against the real three-nested-object MetaUsageStats, printed raw
    // serialized JSON at an operator and overflowed its own card.
    //
    // Raw payloads are allowed ONLY inside a <details class="tech"> disclosure.
    for (const page of ALL_SURFACES) {
      const p = code(`src/web/pages/${page}.ts`);
      // The key-dump fallback, in the position that ships the defect: an
      // inline `typeof x === 'object' ? JSON.stringify(x)` in RENDER code.
      // The same expression inside a named `editableValue()` helper is the
      // classified exception — a settings editor must show the stored literal,
      // because editing it is the whole point of the field.
      const dumps = [...p.matchAll(/typeof\s+\w+\s*===\s*'object'[\s\S]{0,40}?JSON\.stringify/g)]
        .filter((m) => {
          const before = p.slice(Math.max(0, m.index! - 220), m.index!);
          return !/function editableValue/.test(before);
        });
      assert.deepEqual(dumps.map((m) => m[0].slice(0, 40)), [],
        `${page} falls back to JSON.stringify for object values in render code — that is a key-dumper, not a UI`);

      // Any stringify that reaches the DOM must land inside a tech disclosure.
      // Two ways that can be true: the call site sits next to the disclosure
      // markup, or it writes into an element whose id lives inside one.
      const disclosedIds = new Set<string>();
      for (const block of p.match(/<details class="tech"[\s\S]*?<\/details>/g) || []) {
        for (const id of block.match(/id="([\w-]+)"/g) || []) {
          disclosedIds.add(id.slice(4, -1));
        }
      }
      const renders = [...p.matchAll(/JSON\.stringify\([^)]*\)/g)]
        .filter((m) => {
          const around = p.slice(Math.max(0, m.index! - 260), m.index! + 120);
          if (/body:\s*JSON|method:\s*'(POST|PATCH|PUT|DELETE)'/.test(around)) return false;
          // The classified exception, applied consistently with the check
          // above: a named editor helper whose job is to surface the stored
          // literal for editing.
          if (/function editableValue/.test(p.slice(Math.max(0, m.index! - 220), m.index!))) return false;
          return /innerHTML|textContent|<pre/.test(around);
        });
      for (const m of renders) {
        const before = p.slice(Math.max(0, m.index! - 400), m.index! + 200);
        if (/details class="tech"|class="raw"/.test(before)) continue;
        const target = /getElementById\('([\w-]+)'\)[^;]*$/.exec(p.slice(Math.max(0, m.index! - 200), m.index!));
        if (target && disclosedIds.has(target[1]!)) continue;
        assert.fail(`${page} renders ${m[0].slice(0, 46)} outside a Technical-details disclosure`);
      }
    }
  });

  check('the Meta workspace explains quota instead of dumping its field names', () => {
    const p = code('src/web/pages/metaDataWorkspacePage.ts');
    // Raw Meta-quota field names must not be the operator-facing label.
    for (const raw of ['redisAvailable', 'errorRateGatePct', 'progressToThresholdPct',
                       'meetsErrorGate', 'recentWindowSize']) {
      const asLabel = new RegExp(`>\\s*${raw}\\s*<|'${raw}'\\s*\\+|esc\\(\\s*'?${raw}`);
      assert.ok(!asLabel.test(p), `${raw} is shown to the operator as a label rather than translated`);
    }
    // And the translation must actually be present.
    for (const [needle, what] of [
      ['معدّل الخطأ', 'the error rate, in operator language'],
      ['سقف', 'the gate ceiling stated as a ceiling'],
      ['عدّاد الاستهلاك غير متاح', 'the Redis-down case saying "no measurement", not zero'],
      ['التقدّم نحو رفع الطبقة', 'threshold progress as a goal, not a percentage field'],
    ] as const) {
      assert.ok(p.includes(needle), `the quota view is missing ${what}`);
    }
  });

  check('a downed counter backend reads as unknown, never as zero', () => {
    assert.equal(USAGE.noRedis.redisAvailable, false);
    assert.equal(USAGE.noRedis.counts.last15Days, 0);
    const p = src('src/web/pages/metaDataWorkspacePage.ts');
    assert.ok(/redisAvailable\)\s*\{[\s\S]{0,600}لا قياس/.test(p)
      || p.includes('لا قياس'),
      'with Redis down the page must say "no measurement" — a 0 there reads as "no errors"');
  });

  console.log('\n── 3. Absence keeps its meaning under every scenario ──');

  check('no surface maps an absence state to a verdict tone', () => {
    for (const page of ALL_SURFACES) {
      const p = src(`src/web/pages/${page}.ts`);
      if (!p.includes('UNKNOWN:')) continue;
      assert.ok(/UNKNOWN:\s*\[\s*'absent'/.test(p), `${page} gives UNKNOWN a verdict tone`);
      assert.ok(!/NOT_TESTED:\s*\[\s*'(ok|bad|warn)'/.test(p), `${page} gives NOT_TESTED a verdict tone`);
    }
    const gv = src('src/web/pages/systemGraphView.ts');
    for (const s of ['UNKNOWN', 'NOT_TESTED', 'NOT_CONFIGURED']) {
      assert.ok(new RegExp(`${s}:\\s*'transparent'`).test(gv),
        `the graph fills ${s} with a colour — absence must be drawn, not painted`);
    }
    assert.ok(gv.includes('ABSENT[s]') && gv.includes('dashed'),
      'the graph legend must draw absence dashed');
  });

  check('an empty platform reports unknown coverage, never zero', () => {
    const intel = src('src/web/pages/intelligenceWorkspacePage.ts');
    assert.ok(intel.includes("cov == null"), 'coverage must distinguish null from 0');
    assert.ok(/ليست صفراً/.test(intel), 'the null-coverage case must say it is not zero');
  });

  console.log('\n── 4. A graph failure degrades one panel, never the console ──');

  check('the graph fails inside its own host element', () => {
    const gv = src('src/web/pages/systemGraphView.ts');
    const fail = gv.slice(gv.indexOf('function fail('), gv.indexOf('function fail(') + 700);
    assert.ok(fail.includes('stage.innerHTML'), 'graph failure must be scoped to the stage');
    assert.ok(!/document\.body|location\.|throw /.test(fail),
      'a graph failure must not touch the document or throw');
    assert.ok(fail.includes('بقية لوحة التحكّم تعمل'),
      'the failure must tell the operator the rest of the console still works');
  });

  check('the graph names WHY it could not load', () => {
    const gv = src('src/web/pages/systemGraphView.ts');
    assert.ok(gv.includes('r.reason || r.code'),
      'a refused snapshot must surface the adapter reason, not a generic error');
  });

  check('an empty graph and a filtered-empty graph say different things', () => {
    const gv = src('src/web/pages/systemGraphView.ts');
    assert.ok(gv.includes('الخريطة فارغة'), 'no message for a genuinely empty snapshot');
    assert.ok(gv.includes('لا عقدة تطابق'), 'no message for filters that matched nothing');
  });

  console.log('\n── 5. The graph is an instrument, not a picture ──');

  check('search, class filters, isolation and reset all exist', () => {
    const gv = src('src/web/pages/systemGraphView.ts');
    for (const [needle, what] of [
      ['gv-search', 'search'],
      ['data-class=', 'per-class filters'],
      ["kind === 'focus'", 'neighbourhood isolation'],
      ["kind === 'reset'", 'reset'],
      ['data-zoom="fit"', 'fit to screen'],
      ['data-status="PROBLEM"', 'a runtime problem filter'],
      ['data-ask=', 'preset operator questions'],
    ] as const) {
      assert.ok(gv.includes(needle), `the graph has no ${what}`);
    }
  });

  check('labels are truncated from the head, not the tail', () => {
    // Every admin route starts '/api/admin/', so tail-truncation turned
    // thirty-nine of them into the same illegible stub in the first render.
    const gv = src('src/web/pages/systemGraphView.ts');
    assert.ok(gv.includes('function shortLabel'), 'no label strategy at all');
    const fn = gv.slice(gv.indexOf('function shortLabel'), gv.indexOf('function shortLabel') + 620);
    assert.ok(fn.includes('slice(-('), 'labels must keep the distinguishing tail');
    assert.ok(fn.includes("'/api/admin'"), 'the shared route prefix must be dropped before truncating');
  });

  check('the inspector is a drawer, and answers every required question', () => {
    const gv = src('src/web/pages/systemGraphView.ts');
    assert.ok(gv.includes('class="gvi"') && gv.includes('.gvi.open'),
      'the inspector must be a drawer, not a page navigation');
    for (const q of ['ما هذا؟', 'المالك الرسمي', 'الحالة الآن', 'من أين جاءت هذه المعلومة', 'ما لا نعرفه']) {
      assert.ok(gv.includes(q), `the inspector never answers "${q}"`);
    }
    assert.ok(gv.includes('لا رصد لهذه العقدة'),
      'a node with no observation must say so — silence reads as fine');
  });

  console.log('\n── 6. Details an operator reads ──');

  check('timestamps are formatted once, in the shell', () => {
    const shell = src('src/web/adminShell.ts');
    assert.ok(shell.includes('window.adminTime'), 'no shared time formatter');
    assert.ok(shell.includes('title="'), 'the exact instant must survive on hover');
  });

  check('no surface prints a raw ISO timestamp into a cell', () => {
    // Caught by the rendered audit: '2026-08-22T04:10:00.000Z' in a column an
    // operator scans for "was that today".
    for (const page of ALL_SURFACES) {
      const p = src(`src/web/pages/${page}.ts`);
      const raw = p.match(/esc\((?:[a-z]\.)?(?:createdAt|lastSyncedAt|at)\b[^)]*\)/g) || [];
      assert.deepEqual(raw, [],
        `${page} renders a raw timestamp: ${raw.join(', ')} — use window.adminTime`);
    }
  });

  check('cards size to their content', () => {
    const shell = src('src/web/adminShell.ts');
    assert.ok(/\.grid\s*\{[^}]*align-items:\s*start/.test(shell),
      'grid cards stretch to their tallest sibling — that is the measured sparse-card problem');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════\n`);
  if (failures.length) process.exit(1);
}

run();
