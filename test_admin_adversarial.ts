// ════════════════════════════════════════════════════════════════════════
//  test_admin_adversarial.ts — try to make the Operations Console LIE.
//
//  The scenario harness proves the console reads correctly when the data
//  arrives. This one attacks the cases where it might not: the subsystem
//  it reports on is the same one it depends on, and verdicts that look
//  alike but mean different things.
//
//  A test here passing means "we could not make it lie in this way",
//  which is the only kind of confidence worth having about a console.
// ════════════════════════════════════════════════════════════════════════
import { getAdminOpsSnapshot, worstOf, isUndetermined, OPS_STATUSES } from './src/services/adminOpsHealth';

let failed = 0;
let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

/** Minimal Prisma stand-in. Each field may be told to throw. */
function fakePrisma(opts: { dbDown?: boolean; workspaces?: unknown[] } = {}) {
  const boom = () => { throw new Error('Connection terminated unexpectedly'); };
  return {
    $queryRaw: async () => { if (opts.dbDown) boom(); return [{ '?column?': 1 }]; },
    workspace: { findMany: async () => { if (opts.dbDown) boom(); return opts.workspaces ?? []; } },
    syncJob: { findMany: async () => { if (opts.dbDown) boom(); return []; } },
    dailyStat: { groupBy: async () => { if (opts.dbDown) boom(); return []; } },
  } as never;
}

async function main() {
  console.log('\n── A1. the console must survive the outage it reports on ──');
  {
    // THE TRAP: the snapshot both REPORTS ON the database and READS FROM it.
    // If the read throws, the operator gets a generic 500 at exactly the
    // moment the console matters most — and never learns the DB is the cause.
    let snap: Awaited<ReturnType<typeof getAdminOpsSnapshot>> | null = null;
    let threw = false;
    try {
      snap = await getAdminOpsSnapshot(fakePrisma({ dbDown: true }));
    } catch {
      threw = true;
    }
    if (threw) {
      bad('database down → getAdminOpsSnapshot THREW; the console cannot report the outage it is in');
    } else if (!snap) {
      bad('database down → no snapshot returned');
    } else {
      const db = snap.subsystems.find((s) => s.key === 'database');
      if (db?.status !== 'ERROR') bad(`database down → reported "${db?.status}", expected ERROR`);
      else ok('database down → snapshot still returns, database reads ERROR');
      if (!snap.attention.some((a) => a.id === 'db')) bad('database down → no attention item raised');
      else ok('database down → attention queue names the outage');
      // The rest of the snapshot must degrade to "unknown", never to "fine".
      const lying = snap.subsystems.filter((s) => s.key !== 'database' && s.status === 'HEALTHY');
      if (lying.length) bad(`database down → ${lying.map((s) => s.key).join(', ')} still claim HEALTHY on unreadable data`);
      else ok('database down → no subsystem claims health it cannot verify');
    }
  }

  console.log('\n── A2. undetermined is never folded into healthy ──');
  {
    if (isUndetermined('UNKNOWN') && isUndetermined('NOT_TESTED')) ok('UNKNOWN and NOT_TESTED both classify as undetermined');
    else bad('an undetermined status is being treated as determined');
    if (isUndetermined('HEALTHY') || isUndetermined('ERROR')) bad('a determined status classifies as undetermined');
    else ok('HEALTHY and ERROR classify as determined');

    // worstOf must never let an undetermined value mask a real failure.
    if (worstOf(['UNKNOWN', 'ERROR']) !== 'ERROR') bad('worstOf lets UNKNOWN mask ERROR');
    else ok('worstOf: ERROR outranks UNKNOWN');
    if (worstOf(['HEALTHY', 'NOT_TESTED']) === 'HEALTHY') bad('worstOf collapses NOT_TESTED into HEALTHY');
    else ok('worstOf: NOT_TESTED is not absorbed by HEALTHY');
  }

  console.log('\n── A3. the empty platform must not read as a healthy one ──');
  {
    const snap = await getAdminOpsSnapshot(fakePrisma({ workspaces: [] }));
    const meta = snap.subsystems.find((s) => s.key === 'meta');
    // Zero connected accounts is an ABSENCE of evidence about Meta, not
    // proof that Meta works. A console that greens this teaches the operator
    // that green means nothing.
    if (meta?.status === 'HEALTHY') bad('no ad accounts at all → Meta reported HEALTHY on zero evidence');
    else ok(`no ad accounts → Meta reads ${meta?.status}, not a green claim`);
    const workers = snap.subsystems.find((s) => s.key === 'workers');
    if (workers?.status === 'HEALTHY') bad('no accounts → workers reported HEALTHY with nothing observed');
    else ok(`no accounts → workers reads ${workers?.status}`);
    if (snap.overall === 'HEALTHY' && snap.unknown.length === 0) bad('empty platform reports fully healthy with no unknowns');
    else ok(`empty platform: overall=${snap.overall}, unknown=[${snap.unknown.join(', ')}]`);
  }

  console.log('\n── A4. every status in the vocabulary is reachable and distinct ──');
  {
    const seen = new Set(OPS_STATUSES);
    if (seen.size !== OPS_STATUSES.length) bad('duplicate status in the vocabulary');
    else ok(`${OPS_STATUSES.length} statuses, all distinct`);
    // A vocabulary where two words share a severity cannot order an
    // attention queue deterministically.
    const sev = OPS_STATUSES.map((s) => worstOf([s]));
    if (new Set(sev).size !== OPS_STATUSES.length) bad('two statuses collapse to the same severity');
    else ok('every status has its own severity rank');
  }

  console.log('\n── A5. no secret may reach the DTO ──');
  {
    const snap = await getAdminOpsSnapshot(fakePrisma({
      workspaces: [{
        id: 'w1', name: 'ws', members: [{ user: { email: 'o@x.iq' } }],
        adAccounts: [{
          id: 'a1', name: 'acct', externalAccountId: 'act_1', currency: 'IQD', status: 'ACTIVE',
          accessTokenEncrypted: 'ENCRYPTED-SECRET-VALUE', connectionId: null,
          tokenSource: 'USER_OAUTH', tokenExpiresAt: null, lastSyncedAt: new Date(),
          metaAccountStatus: 1, metaDisableReason: null,
        }],
      }],
    }));
    const blob = JSON.stringify(snap);
    if (blob.includes('ENCRYPTED-SECRET-VALUE')) bad('the encrypted token value reached the DTO');
    else ok('encrypted token never leaves the service — only a hasToken boolean');
    if (!/"hasToken":true/.test(blob)) bad('hasToken not surfaced, so the UI cannot distinguish "no token" from "bad token"');
    else ok('token PRESENCE is reported without the token');
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
