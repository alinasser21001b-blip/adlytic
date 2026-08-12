// ════════════════════════════════════════════════════════════════════════
//  test_admin_pages.ts — the operator consoles get the same script gate.
//
//  WHY THIS EXISTS
//  test_page_scripts.mjs parses the inline <script> of every page in
//  .mobile-pages. The admin consoles are NOT in that set, so the defect class
//  that has taken this product down repeatedly — a stray backtick or a `${`
//  inside a TypeScript template literal, which tsc cannot see because the
//  browser JS is an opaque string to it — had no gate at all on the very
//  pages the operator uses to fix an outage.
//
//  Found while adding the capability-probe panel: the check had to be run by
//  hand, which means it would not have been run again.
// ════════════════════════════════════════════════════════════════════════
import vm from 'node:vm';

let failed = 0;
let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

async function main() {
  // Imported dynamically so a page that cannot even LOAD is reported as a
  // failure rather than a stack trace. A stray backtick inside the TS template
  // literal breaks the module itself; tsc catches that, but a gate that dies
  // with an uncaught throw can be misread as a pass by a pipeline that only
  // looks at the last line.
  const PAGES: { name: string; html: string }[] = [];
  try {
    const mod = await import('./src/web/pages/adminConsolePage');
    PAGES.push({ name: 'adminConsolePage', html: (mod.adminConsolePage as unknown as () => string)() });
  } catch (e) {
    bad(`adminConsolePage could not be loaded at all — ${(e as Error).message.slice(0, 160)}`);
  }
  try {
    const mod = await import('./src/web/pages/adminSessionSyncPage');
    PAGES.push({ name: 'adminSessionSyncPage', html: (mod.adminSessionSyncPage as unknown as () => string)() });
  } catch (e) {
    bad(`adminSessionSyncPage could not be loaded at all — ${(e as Error).message.slice(0, 160)}`);
  }
  if (PAGES.length === 0) {
    console.error('\n════ 1 FAILURES ════\n');
    process.exit(1);
  }

  for (const { name, html } of PAGES) {
    console.log(`\n── ${name} ──`);

    // 1. Every inline script must actually parse.
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    let n = 0;
    let broke = 0;
    while ((m = re.exec(html))) {
      n += 1;
      try {
        new vm.Script(m[1], { filename: `${name}#${n}` });
      } catch (e) {
        broke += 1;
        bad(`inline script #${n} does not parse — ${(e as Error).message}`);
      }
    }
    if (n === 0) bad('no inline script found — this gate would be checking nothing');
    else if (!broke) ok(`${n} inline script(s) parse`);

    // 2. Duplicate ids: getElementById binds to the first match in document
    //    order, so a duplicate silently steals every read of the visible one.
    const ids = [...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map((x) => x[1]);
    const dupes = [...new Set(ids.filter((v, i, a) => a.indexOf(v) !== i))];
    if (dupes.length) bad(`duplicate element ids: ${dupes.join(', ')}`);
    else ok(`${ids.length} element ids, none duplicated`);

    // 3. Cooked template escapes — the same rule test_page_scripts.mjs applies
    //    to the app pages. A single backslash is eaten at cook time, so \d
    //    reaches the browser as the letter d: it parses, and matches the wrong
    //    thing forever.
    const COOKED: [RegExp, string][] = [
      [/(?<!\\)\bd\{\d+\}/, 'd{n} — a cooked \\d{n} quantifier'],
      [/\[d,\]/, '[d,] — a cooked [\\d,] class'],
      [/\(\/s[+*][/(]/, '(/s+/ or (/s*( — a cooked \\s class'],
    ];
    let cooked = 0;
    for (const [pat, what] of COOKED) {
      const hit = html.match(pat);
      if (hit) { bad(`cooked template escape reached the browser — ${what} ("${hit[0]}")`); cooked += 1; }
    }
    if (!cooked) ok('no cooked template escape');
  }

  // 4. The capability-probe panel is wired end to end. Every id the runtime
  //    reads must exist in the markup — a panel whose button reads a missing
  //    element fails silently, and this page has no other gate to catch it.
  console.log('\n── the capability-probe panel is wired ──');
  {
    const html = PAGES[0].html;
    const needed = ['view-probe', 'probe-ws', 'probe-run', 'probe-status', 'probe-tally', 'probe-out', 'probe-matrix', 'probe-report'];
    const missing = needed.filter((id) => !html.includes(`id="${id}"`));
    if (missing.length) bad(`markup is missing: ${missing.join(', ')}`);
    else ok(`all ${needed.length} panel ids exist in the markup`);

    for (const id of ['probe-ws', 'probe-run', 'probe-matrix', 'probe-report', 'probe-out', 'probe-tally', 'probe-status']) {
      if (!html.includes(`getElementById('${id}')`)) bad(`the runtime never reads #${id} — dead markup`);
    }
    if (!failed) ok('every panel id is read by the runtime');

    if (!html.includes("'/api/admin/capability-probe'")) bad('the panel does not call the probe route');
    else ok('the panel calls /api/admin/capability-probe');

    // The run spends the account's Meta quota; a double click must not cost 80
    // calls. The guard is a flag checked before the request goes out.
    if (!/if \(probeRunning\) return;/.test(html)) bad('no in-flight guard — a double click would run the probe twice');
    else ok('a second click while a run is in flight is refused');

    // The panel must never render a token, and the route never returns one —
    // but the page must not invent a place to put one either.
    if (/access_token|accessToken/.test(html)) bad('the admin page mentions a token');
    else ok('no token anywhere in the served page');

    // API-shape guard. /api/admin/customers returns FLATTENED rows —
    // u.workspaces[] with adAccountCount — not raw Prisma memberships. The
    // probe workspace loader once read `u.memberships[].workspace`, found
    // nothing, and reported "no workspace with an ad account" forever, which
    // blocked the probe from the very panel built to run it. tsc cannot see
    // this: the script is an opaque string to it.
    if (/\.memberships\b/.test(html)) bad('the console script reads .memberships — the customers API returns flattened .workspaces');
    else if (!html.includes('adAccountCount')) bad('the console script no longer reads adAccountCount — probe dropdown shape drifted');
    else ok('probe workspace loader reads the flattened customers shape');

    // Every class the probe panel uses must exist in the page CSS. The panel
    // once shipped with .hint/.row/.btn-ghost undefined and rendered as bare
    // unstyled text.
    const probeSection = html.slice(html.indexOf('id="view-probe"'), html.indexOf('id="view-settings"'));
    const usedClasses = [...new Set([...probeSection.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))];
    // A class earns its keep either as a CSS rule or as a JS selector hook
    // (querySelectorAll('.view')); only a class referenced NOWHERE outside its
    // own class="" attribute is dead styling.
    const css = html.slice(0, html.indexOf('</style>'));
    const script = html.slice(html.indexOf('</style>'));
    const undefinedClasses = usedClasses.filter((cls) => {
      if (!cls) return false;
      const escd = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(`\\.${escd}[\\s,{.:]`).test(css) && !script.includes(`'.${cls}'`);
    });
    if (undefinedClasses.length) bad(`probe panel uses CSS classes never defined: ${undefinedClasses.join(', ')}`);
    else ok(`all ${usedClasses.length} probe-panel classes are defined in the page CSS`);

    // Deleting a customer is the console's only un-undoable action. It once
    // ran on a single click; the guard is typing the account's email.
    if (!html.includes('customerEmailById') || !/typed\.trim\(\)\.toLowerCase\(\) !== email\.toLowerCase\(\)/.test(html)) {
      bad('customer delete lost its type-the-email confirmation');
    } else ok('customer delete requires typing the account email');

    // Every enum value the API can send must have an Arabic label — raw Latin
    // enums on the operator screen are the audited billing-panel defect class.
    const enumVals = ['ACTIVE', 'INACTIVE', 'PAST_DUE', 'CANCELED', 'ACTIVATED', 'RENEWED', 'EXPIRED', 'REFUNDED', 'UPGRADED', 'DOWNGRADED'];
    const missingEnum = enumVals.filter((v) => !new RegExp(`${v}:\\s*\\[`).test(html));
    if (missingEnum.length) bad(`enum values with no Arabic label mapping: ${missingEnum.join(', ')}`);
    else ok(`all ${enumVals.length} subscription/payment enum values carry Arabic labels`);

    // Every ops status must have a glyph + Arabic word. A status rendered as
    // colour alone is invisible to a colour-blind operator and to any
    // greyscale screenshot pasted into a support thread.
    const opsStatuses = ['HEALTHY', 'RUNNING', 'UNKNOWN', 'NOT_TESTED', 'DEGRADED', 'WARNING', 'BLOCKED', 'ERROR'];
    const missingSt = opsStatuses.filter((v) => !new RegExp(`${v}:\\s*\\[`).test(html));
    if (missingSt.length) bad(`ops statuses with no glyph/label mapping: ${missingSt.join(', ')}`);
    else ok(`all ${opsStatuses.length} ops statuses carry a glyph and an Arabic word`);

    // Every failure code the route can return must name a remediation.
    const probeCodes = ['TOKEN_DECRYPT_FAILED', 'NO_AD_ACCOUNT', 'NO_TOKEN', 'META_UNREACHABLE', 'PROBE_FAILED'];
    const missingFix = probeCodes.filter((v) => !new RegExp(`${v}:\\s*'`).test(html));
    if (missingFix.length) bad(`probe failure codes with no remediation text: ${missingFix.join(', ')}`);
    else ok(`all ${probeCodes.length} probe failure codes name a next action`);

    // The concurrency truth must stay on screen: the guard is per-page, not
    // per-account. Claiming otherwise would be a lie the UI cannot back.
    if (!/تبويب آخر أو مسؤول آخر/.test(html)) bad('the probe panel no longer states that concurrency is page-level only');
    else ok('probe panel states the concurrency limit honestly');
  }

  // 5. The session-sync page heals the cookie/bearer desync without looping.
  console.log('\n── the session-sync page is safe ──');
  {
    const sync = PAGES.find((p) => p.name === 'adminSessionSyncPage');
    if (!sync) bad('adminSessionSyncPage missing from the checked set');
    else {
      const h = sync.html;
      if (!h.includes("'/api/auth/session-cookie'")) bad('sync page does not call the cookie re-issue route');
      else ok('sync page calls /api/auth/session-cookie');
      if (!h.includes('adm_sync')) bad('sync page has no loop guard — a dead bearer would reload forever');
      else ok('one-attempt loop guard present');
      if (!h.includes("location.replace('/login')")) bad('sync page has no logged-out fallback to /login');
      else ok('logged-out visitors fall back to /login');
      if (/kpi|customers|drawer|admin-email/.test(h)) bad('sync page leaks admin markup to unauthenticated viewers');
      else ok('no admin structure leaks before authentication');
    }
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
