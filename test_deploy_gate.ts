// ════════════════════════════════════════════════════════════════════════
//  test_deploy_gate.ts — the deploy job must not be able to lie.
//
//  This gate RUNS .deploy/railway-deploy.sh against a stubbed `curl` placed
//  ahead of the real one on PATH. It never touches the network and never
//  needs a Railway token.
//
//  Why execute rather than grep: the defect being fixed was a shell branch
//  ending in `exit 0`. A test that searched the file for "exit 1" would have
//  passed the moment the string appeared anywhere, including inside a comment
//  or an unreachable branch. Only running the script proves what it does. The
//  original logic lived inside a workflow `run:` block, where nothing could
//  execute it at all — which is precisely how a job that deployed nothing
//  reported success across five commits without anyone noticing.
//
//  The invariant under test:
//
//      A GREEN DEPLOY JOB MEANS THE TRIGGER WAS ATTEMPTED AND ACCEPTED.
//
//  Both halves are tested. "Attempted" is the missing-secret case.
//  "Accepted" is everything Railway can answer that is not an acceptance.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

const SCRIPT = '.deploy/railway-deploy.sh';
const WORKFLOW = '.github/workflows/deploy-adlytic.yml';

/**
 * Run the real deploy script with a fake `curl`.
 *
 * `curlBody`/`curlStatus` describe what the stub should pretend Railway said.
 * `curlFails` makes the stub exit non-zero, standing in for DNS/TLS/network.
 */
function runScript(opts: {
  token?: string;
  curlBody?: string;
  curlStatus?: string;
  curlFails?: boolean;
}): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'deploygate-'));
  // The stub honours curl's contract as the script uses it: write the body to
  // the -o path, print the status to stdout for -w '%{http_code}'.
  const stub = `#!/usr/bin/env bash
${opts.curlFails ? 'exit 7' : ''}
OUT=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then OUT="$a"; fi
  prev="$a"
done
if [ -n "$OUT" ]; then cat > "$OUT" <<'BODYEOF'
${opts.curlBody ?? '{"data":{"serviceInstanceDeploy":true}}'}
BODYEOF
fi
printf '%s' '${opts.curlStatus ?? '200'}'
`;
  writeFileSync(join(dir, 'curl'), stub);
  chmodSync(join(dir, 'curl'), 0o755);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: `${dir}:${process.env['PATH'] ?? ''}`,
  };
  if (opts.token === undefined) delete env['RAILWAY_TOKEN'];
  else env['RAILWAY_TOKEN'] = opts.token;

  const r = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
  return { code: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function main() {
  console.log('\n── 0. the script exists and is the workflow\'s entry point ──');
  if (!existsSync(SCRIPT)) { bad(`${SCRIPT} is missing`); process.exit(1); }
  ok(`${SCRIPT} exists`);

  const wf = readFileSync(WORKFLOW, 'utf8');
  if (wf.includes(SCRIPT)) ok('the workflow invokes the script rather than inlining the logic');
  else bad('the workflow no longer calls the script — the logic has drifted back out of test reach');

  // The defect class, guarded at the workflow level too: if deploy logic
  // returns to an inline `run:` block, nothing here can execute it again.
  const deployJob = wf.slice(wf.indexOf('deploy-adlytic:'));
  if (/curl\s+.*backboard\.railway\.app/.test(deployJob)) {
    bad('the workflow calls Railway inline again — that code is unreachable to this gate');
  } else ok('the workflow contains no inline, untestable Railway call');

  console.log('\n── 1. DEPLOY_NOT_ATTEMPTED must never report success ──');
  {
    const r = runScript({});
    if (r.code === 0) bad('a missing RAILWAY_TOKEN still exits 0 — the false green is back');
    else ok(`a missing RAILWAY_TOKEN exits ${r.code} (non-zero)`);
    if (/RAILWAY_TOKEN is not set/.test(r.out)) ok('the failure names the missing secret');
    else bad('the failure does not say what is missing');
    if (/Deploy Latest Commit|GitHub secret/.test(r.out)) ok('the failure names both ways to fix it');
    else bad('the failure is not actionable');
  }
  {
    // Empty and whitespace are the shapes an unset GitHub secret actually
    // takes when it reaches a shell, and both must fail.
    for (const [label, token] of [['empty string', ''], ['whitespace', '   ']] as const) {
      const r = runScript({ token });
      if (r.code === 0) bad(`a token that is ${label} exits 0`);
      else ok(`a token that is ${label} exits non-zero`);
    }
  }

  console.log('\n── 2. DEPLOY_ATTEMPTED is still not DEPLOY_ACCEPTED ──');
  {
    const cases: { label: string; body?: string; status?: string; fails?: boolean }[] = [
      { label: 'HTTP 401 from Railway', status: '401', body: '{"message":"Unauthorized"}' },
      { label: 'HTTP 500 from Railway', status: '500', body: 'internal error' },
      { label: 'GraphQL errors at HTTP 200', body: '{"errors":[{"message":"Not Authorized"}]}' },
      { label: 'an empty body', body: '' },
      { label: 'a response with no serviceInstanceDeploy field', body: '{"data":{}}' },
      { label: 'serviceInstanceDeploy: null', body: '{"data":{"serviceInstanceDeploy":null}}' },
      { label: 'serviceInstanceDeploy: false', body: '{"data":{"serviceInstanceDeploy":false}}' },
      { label: 'the request never completing', fails: true },
    ];
    for (const c of cases) {
      const r = runScript({
        token: 'tok_fake', ...(c.body !== undefined ? { curlBody: c.body } : {}),
        ...(c.status ? { curlStatus: c.status } : {}), ...(c.fails ? { curlFails: true } : {}),
      });
      if (r.code === 0) bad(`${c.label} was treated as a successful deploy`);
      else ok(`${c.label} fails the job`);
    }
  }

  console.log('\n── 3. a real acceptance must still pass ──');
  {
    // A gate that fails everything is not a gate, it is an outage. The
    // success path has to survive, or the next person deletes the check.
    const r = runScript({ token: 'tok_fake', curlBody: '{"data":{"serviceInstanceDeploy":true}}' });
    if (r.code !== 0) bad(`an accepted trigger fails the job (exit ${r.code}) — ${r.out.slice(0, 300)}`);
    else ok('an accepted trigger exits 0');
    if (/accepted by Railway/.test(r.out)) ok('success is stated explicitly');
    else bad('success prints nothing an operator can read');
    // Acceptance is not proof the build is serving, and the script must not
    // let anyone believe otherwise — that belief is what started all of this.
    if (/NOT YET PROVEN/.test(r.out)) ok('success states what it does NOT prove (that the build is serving)');
    else bad('success overclaims — it must not imply the new build is live');
  }

  console.log('\n── 4. the token never reaches a log or a process listing ──');
  {
    const secret = 'railwaytokenSUPERSECRETvalue123';
    const r = runScript({ token: secret, curlBody: '{"data":{"serviceInstanceDeploy":true}}' });
    if (r.out.includes(secret)) bad('the token appears in the job output');
    else ok('the token appears nowhere in the job output');
    const src = readFileSync(SCRIPT, 'utf8');
    if (/-H\s+"Authorization: Bearer \$RAILWAY_TOKEN"/.test(src)) {
      bad('the token is passed in argv, where any process on the runner can read it');
    } else ok('the token is passed to curl via a header file, not argv');
  }

  console.log('\n── 5. the deployment target is unchanged ──');
  {
    // Pinned byte-for-byte. A deploy script whose target can be edited without
    // a test objecting is not a safety mechanism.
    const src = readFileSync(SCRIPT, 'utf8');
    const pins: [string, string][] = [
      ['Railway API', 'https://backboard.railway.app/graphql/v2'],
      ['service id', 'cc7cbf67-d757-4018-bf6d-9cec643222c3'],
      ['environment id', '89cdf3cb-15b7-4b92-b1ae-07e812333c37'],
      ['mutation', 'serviceInstanceDeploy'],
      ['latestCommit', 'LATEST_COMMIT="true"'],
    ];
    for (const [label, pin] of pins) {
      if (src.includes(pin)) ok(`${label} unchanged`);
      else bad(`${label} changed — expected to find ${pin}`);
    }
  }

  console.log('\n── 6. the script is syntactically valid shell ──');
  {
    try {
      execFileSync('bash', ['-n', SCRIPT], { stdio: 'pipe' });
      ok('bash -n parses the script');
    } catch (e) {
      bad(`the script does not parse: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── The pre-merge test gate ────────────────────────────────────────────
  // Added because NO workflow ran the suite: deploy-adlytic.yml covers src/**
  // but runs typecheck only, on push-to-main, and then deploys production —
  // so CI evidence was fused to deployment and a PR triggered nothing.
  {
    const TEST_WF = '.github/workflows/test.yml';
    const wf = readFileSync(join(__dirname, TEST_WF), 'utf8');

    const missingStep = ['npm ci', 'npx prisma generate', 'npm run typecheck', 'npm run test:all']
      .filter((step) => !wf.includes(step));
    if (missingStep.length === 0) ok('the test gate runs install, generate, typecheck and the full suite');
    else bad(`the test gate is missing: ${missingStep.join(', ')}`);

    if (/pull_request:/.test(wf)) ok('the test gate runs on pull_request — before merge, not after');
    else bad('the test gate does not run on pull_request');

    if (/branches:\s*\n\s*- claude\/brain-admin-v2-integration/.test(wf)) {
      ok('the test gate runs on pushes to the integration branch');
    } else bad('the test gate does not run on integration-branch pushes');

    // It is a test gate, not a deploy path, and it needs no secrets.
    // Comments are stripped first: the path list is annotated with WHY each
    // entry exists, and those annotations legitimately name the deploy script
    // this very suite reads. What matters is what the workflow DOES.
    const wfCode = wf.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
    const leaks = ['railway-deploy', 'RAILWAY_TOKEN', 'prisma migrate', 'secrets.']
      .filter((f) => wfCode.includes(f));
    if (leaks.length === 0) ok('the test gate deploys nothing, migrates nothing and needs no secret');
    else bad(`the test gate must not reference: ${leaks.join(', ')}`);

    // The two path lists are duplicated rather than shared through a YAML
    // anchor, because GitHub Actions does not reliably expand anchors.
    // Duplication is only safe if drift is caught, so it is caught here.
    const blocks = [...wf.matchAll(/paths:\n((?:\s+- '[^']+'.*\n)+)/g)]
      .map((m) => m[1]!.split('\n')
        .map((l) => (/- '([^']+)'/.exec(l) ?? [])[1])
        .filter(Boolean) as string[]);
    if (blocks.length === 2 && JSON.stringify(blocks[0]) === JSON.stringify(blocks[1])) {
      ok('the pull_request and push path lists are identical');
    } else bad(`the trigger path lists have drifted (${blocks.length} list(s) found)`);

    // Every path a suite actually reads must be covered, or a change to it
    // merges with a green tick it never earned.
    const covered = blocks[0] ?? [];
    const uncovered = ['src/**', 'prisma/**', 'test_*.ts', 'test_*.mjs', 'package.json',
      'package-lock.json', 'tsconfig*.json', 'docs/**', 'README.md',
      'deploy_production.command', '.deploy/**', 'nixpacks.toml', TEST_WF,
      WORKFLOW, '.github/workflows/verify-live.yml',
      // test_admin_acceptance.ts imports SCENARIOS from
      // ./tools/admin-acceptance/fixtures.mjs, so that directory decides what
      // the acceptance suite asserts. It arrived with the Control Plane merge
      // and this array predates it — the coverage list is hardcoded, so it
      // passed while the gap was real. A guard whose blind spot matches the
      // workflow's is not a guard.
      'tools/**']
      .filter((r) => !covered.includes(r));
    if (uncovered.length === 0) ok('every path the suites read is covered by the test gate');
    else bad(`read by a suite but not covered by CI paths: ${uncovered.join(', ')}`);
  }

  // ── the deploy workflow must remain dispatchable ────────────────────────
  // The push trigger only fires on the watched paths, so a release whose diff
  // is docs/CI/tests merges to main and ships nothing — which is exactly what
  // happened to the close-code governance commits. workflow_dispatch is the
  // only thing that makes such a release deployable without the Railway UI.
  console.log('\n── 6. the deploy workflow can still be dispatched ──');
  {
    const on = wf.slice(wf.indexOf('on:'), wf.indexOf('concurrency:'));
    if (/^\s*workflow_dispatch:/m.test(on)) ok('deploy-adlytic.yml exposes workflow_dispatch');
    else bad('deploy-adlytic.yml lost workflow_dispatch — a docs/CI-only release can no longer be shipped');
  }

  // ── the live-verification workflow observes and nothing more ────────────
  console.log('\n── 7. verify-live.yml is read-only ──');
  {
    const VERIFY_WF = '.github/workflows/verify-live.yml';
    if (!existsSync(VERIFY_WF)) bad(`${VERIFY_WF} is missing — the gates have no live evidence path`);
    else {
      const vf = readFileSync(VERIFY_WF, 'utf8');
      // Comments legitimately NAME the things this file must not DO, so they
      // are stripped before scanning. Same reasoning as the test-gate leak
      // check: what matters is what the workflow does, not what it explains.
      const body = vf.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
      // It now DOES call Railway, to read deployment logs. So "calls no Railway
      // API" is no longer the guard — every call being a READ is. A mutation
      // is what would make this file dangerous, not the hostname.
      const mutations = ['mutation', 'serviceInstanceDeploy', 'serviceInstanceUpdate',
        'variableUpsert', 'variableDelete', 'deploymentRestart', 'deploymentRedeploy',
        'deploymentRemove', 'environmentCreate', 'migrate deploy', SCRIPT];
      const found = mutations.filter((f) => body.includes(f));
      if (found.length === 0) ok('verify-live.yml issues reads only — no mutation, no deploy, no migration');
      else bad(`verify-live.yml must not reference: ${found.join(', ')}`);

      // RAILWAY_TOKEN is the ONE secret it may see. Anything else appearing
      // here is scope creep into a file whose output is a public Actions log.
      const secretsUsed = [...body.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]!);
      const extra = [...new Set(secretsUsed)].filter((n) => n !== 'RAILWAY_TOKEN');
      if (extra.length === 0) ok(`verify-live.yml reads only ${secretsUsed.length ? 'RAILWAY_TOKEN' : 'no secret'}`);
      else bad(`verify-live.yml reads secrets it has no business with: ${extra.join(', ')}`);

      // The token must reach curl through a @-file, never argv — argv is
      // readable by every process on the runner. Same reason railway-deploy.sh
      // does it, and the reason is not weaker just because this one only reads.
      if (secretsUsed.includes('RAILWAY_TOKEN')) {
        if (/-H @"?\$/.test(body)) ok('the Railway token reaches curl via a @-file, not argv');
        else bad('the Railway token is passed to curl outside a @-file — it would be visible in argv');
        if (/echo[^\n]*\$RAILWAY_TOKEN|echo[^\n]*\$\{RAILWAY_TOKEN/.test(body)) {
          bad('verify-live.yml echoes RAILWAY_TOKEN');
        } else ok('verify-live.yml never echoes the token');
      }

      // Raw log dumping is the other way a secret escapes. The evidence step
      // must filter to an allowlist before printing anything.
      if (body.includes('deploymentLogs')) {
        if (/grep -aE '[^']*period facts:/.test(body)) ok('runtime log lines are allowlisted before printing');
        else bad('deploymentLogs is read without an allowlist filter — raw log could reach a public log');
      }

      if (/^on:\n\s+workflow_dispatch:/m.test(body)) ok('verify-live.yml runs only when a human asks');
      else bad('verify-live.yml is not dispatch-only — an observation job must not self-trigger');
    }
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES, ${passed} passed`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
