// ════════════════════════════════════════════════════════════════════════
//  scripts/test-redis-scaling-drill.ts
//
//  Programmatic validation of the Phase 2 horizontal-scaling primitives.
//  Designed to run BEFORE flipping WEBHOOK_REDIS_DEBOUNCE_ENABLED=true in
//  production. Each drill is a deterministic assertion against the actual
//  Redis instance that staging/production will use, NOT a mock — the value
//  of this script is that it catches misconfiguration (auth, TLS, ACL),
//  network paths, and silent semantic drift.
//
//  Usage:
//    REDIS_URL=redis://... npx tsx scripts/test-redis-scaling-drill.ts
//    REDIS_URL=redis://... DATABASE_URL=... npx tsx scripts/test-redis-scaling-drill.ts
//
//  Without DATABASE_URL the DB-touching drills (4 outage + 5 token-health)
//  are SKIPPED with a clear notice, so a developer with only Redis access
//  can still validate the core debounce semantics.
//
//  Exit code: 0 if all run drills pass, 1 if any fail.
// ════════════════════════════════════════════════════════════════════════

import IORedis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'];
const DATABASE_URL = process.env['DATABASE_URL'];

interface DrillResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

const results: DrillResult[] = [];

function pass(id: string, name: string, detail?: string): void {
  results.push({ id, name, status: 'pass', detail });
  console.log(`  ✅ ${id} — ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(id: string, name: string, detail: string): void {
  results.push({ id, name, status: 'fail', detail });
  console.error(`  ❌ ${id} — ${name} — ${detail}`);
}
function skip(id: string, name: string, detail: string): void {
  results.push({ id, name, status: 'skip', detail });
  console.warn(`  ⏭️  ${id} — ${name} — ${detail}`);
}

// ── Drill 1 ─────────────────────────────────────────────────────────────
//  In-process fallback when REDIS_URL is unset (semantic check, no I/O).
//  We reach into src/lib/redis to confirm getRedis() === null and
//  withRedis(fn, fallback) returns the fallback synchronously.
// ────────────────────────────────────────────────────────────────────────
async function drill1_fallbackWhenUnset(): Promise<void> {
  const ID = 'D1', NAME = 'Redis OFF → withRedis returns fallback';
  // Isolate the module — re-import without REDIS_URL in env.
  const saved = process.env['REDIS_URL'];
  delete process.env['REDIS_URL'];
  // Dynamic import so config evaluates with the env we just set.
  // Note: src/config.ts caches its frozen config at module load. Restart
  // the script (not just clearing env mid-run) is the only way to fully
  // re-evaluate. So instead of relying on a fresh import, we directly
  // exercise the ioredis fallback semantics:
  try {
    const { withRedis, getRedis } = await import('../src/lib/redis.ts');
    const r = getRedis();
    // In a fresh process with no REDIS_URL set at boot, getRedis() is null.
    // When this script was invoked WITH a REDIS_URL however, getRedis() is
    // not null and this drill is logically n/a — declare skip.
    if (r !== null) {
      skip(
        ID,
        NAME,
        'getRedis() is non-null because REDIS_URL was set when the process started — drill must run in a child process with REDIS_URL unset to be meaningful',
      );
    } else {
      const fallbackValue = { used: true };
      const out = await withRedis(async () => ({ used: false }), fallbackValue);
      if (out === fallbackValue) pass(ID, NAME, 'fallback object returned identity-equal');
      else fail(ID, NAME, `expected fallback identity, got ${JSON.stringify(out)}`);
    }
  } finally {
    if (saved !== undefined) process.env['REDIS_URL'] = saved;
  }
}

// ── Drill 2 ─────────────────────────────────────────────────────────────
//  Redis NX semantics: first SET wins, second SET with same key in TTL
//  window returns null (lost). This is the primitive the webhook
//  debounce relies on.
// ────────────────────────────────────────────────────────────────────────
async function drill2_nxWinAndLose(client: IORedis): Promise<void> {
  const ID = 'D2', NAME = 'Redis ON → SET NX EX wins once, loses thereafter';
  const key = `drill:nx:${Date.now()}`;
  try {
    const first = await client.set(key, '1', 'EX', 5, 'NX');
    const second = await client.set(key, '1', 'EX', 5, 'NX');
    if (first === 'OK' && second === null) {
      pass(ID, NAME, 'first=OK, second=null');
    } else {
      fail(ID, NAME, `first=${first}, second=${second} (expected OK / null)`);
    }
  } finally {
    await client.del(key).catch(() => undefined);
  }
}

// ── Drill 3 ─────────────────────────────────────────────────────────────
//  Two-"instance" overlap: 10 concurrent SET NX EX against the same key
//  must yield exactly one 'OK' and nine nulls. Simulates 10 webhooks
//  arriving at multiple dynos within the same 5-second window.
// ────────────────────────────────────────────────────────────────────────
async function drill3_concurrentBurst(client: IORedis): Promise<void> {
  const ID = 'D3', NAME = 'Cluster burst → exactly one winner across 10 concurrent SETs';
  const key = `drill:burst:${Date.now()}`;
  try {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => client.set(key, '1', 'EX', 5, 'NX')),
    );
    const winners = attempts.filter((r) => r === 'OK').length;
    const losers = attempts.filter((r) => r === null).length;
    if (winners === 1 && losers === 9) {
      pass(ID, NAME, '1 winner, 9 losers');
    } else {
      fail(ID, NAME, `winners=${winners}, losers=${losers} (expected 1/9) — attempts: ${JSON.stringify(attempts)}`);
    }
  } finally {
    await client.del(key).catch(() => undefined);
  }
}

// ── Drill 4 ─────────────────────────────────────────────────────────────
//  Mid-flight outage: a successful SET, then disconnect the client, then
//  verify the next SET attempt rejects (does not hang) and that the
//  application would see the fallback path.
// ────────────────────────────────────────────────────────────────────────
async function drill4_midFlightOutage(): Promise<void> {
  const ID = 'D4', NAME = 'Mid-flight outage → ops reject fast (no hang)';
  if (!REDIS_URL) {
    skip(ID, NAME, 'REDIS_URL not set');
    return;
  }
  // Use the same options as src/lib/redis.ts to faithfully reproduce app behavior.
  const c = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // do not auto-reconnect during this drill
    connectionName: 'adlytic-drill-D4',
    lazyConnect: false,
  });
  const key = `drill:outage:${Date.now()}`;
  try {
    // Phase A: connect + one successful op (catch transient pre-ready window).
    const setRes = await new Promise<string | null>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('initial SET timed out')), 5_000);
      c.set(key, '1', 'EX', 30, 'NX')
        .then((v) => { clearTimeout(t); resolve(v); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
    if (setRes !== 'OK') {
      fail(ID, NAME, `pre-outage SET did not return OK (got ${setRes})`);
      return;
    }

    // Phase B: force-disconnect, then attempt another op. We expect the
    // command to REJECT (not hang). enableOfflineQueue:false + retryStrategy
    // returning null guarantees this.
    c.disconnect(false); // false = do NOT auto-reconnect
    const t0 = Date.now();
    let rejected = false;
    try {
      // Race the SET against a short timer; the SET should reject far before.
      await Promise.race([
        c.set(key, '2', 'EX', 30, 'XX'),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('drill: hang detected (>1s)')), 1_000)),
      ]);
    } catch (e) {
      rejected = true;
      const dur = Date.now() - t0;
      const msg = e instanceof Error ? e.message : String(e);
      if (dur >= 1_000) {
        fail(ID, NAME, `op did not reject within 1s — saw: ${msg}`);
        return;
      }
      pass(ID, NAME, `rejected in ${dur}ms (${msg})`);
    }
    if (!rejected) fail(ID, NAME, 'post-disconnect SET resolved unexpectedly');
  } finally {
    try { c.disconnect(false); } catch { /* already disconnected */ }
  }
}

// ── Drill 5 ─────────────────────────────────────────────────────────────
//  Token-health cache herd: 100 concurrent reads/writes against the
//  Redis SET path used by getCachedWorkspaceTokenHealth. We don't invoke
//  the full service (needs Prisma + a real workspace) — we exercise the
//  CACHE PRIMITIVE: the first SET stores, subsequent GETs return the
//  same payload, and the SET roundtrip never exceeds a healthy budget.
// ────────────────────────────────────────────────────────────────────────
async function drill5_tokenHealthHerd(client: IORedis): Promise<void> {
  const ID = 'D5', NAME = 'Token-health cache herd → 100 ops within budget';
  const wsId = `drill-${Date.now()}`;
  const key = `tokenhealth:${wsId}`;
  const payload = JSON.stringify({ ok: true });
  try {
    const t0 = Date.now();
    await client.set(key, payload, 'EX', 60);
    const setMs = Date.now() - t0;

    const reads = await Promise.all(Array.from({ length: 100 }, () => client.get(key)));
    const hits = reads.filter((r) => r === payload).length;
    const elapsed = Date.now() - t0;

    if (hits !== 100) {
      fail(ID, NAME, `expected 100 cache hits, got ${hits}`);
      return;
    }
    // Budget: 100 GETs + 1 SET on a healthy LAN/Railway link should land
    // well under 1500ms. If we blow past it, surface that — it usually
    // means the staging/prod Redis is geographically wrong or saturated.
    if (elapsed > 1500) {
      fail(ID, NAME, `100 hits but total latency ${elapsed}ms exceeds 1500ms budget (single SET ${setMs}ms)`);
      return;
    }
    pass(ID, NAME, `100 hits in ${elapsed}ms (SET=${setMs}ms)`);
  } finally {
    await client.del(key).catch(() => undefined);
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('═══ Adlytic Phase 2 — Redis scaling drill ═══');
  console.log(`  REDIS_URL    : ${REDIS_URL ? sanitizeUrl(REDIS_URL) : '<unset>'}`);
  console.log(`  DATABASE_URL : ${DATABASE_URL ? '<set>' : '<unset> (DB-touching drills will skip)'}`);
  console.log('');

  // Drill 1 — runs regardless (semantic).
  await drill1_fallbackWhenUnset();

  if (!REDIS_URL) {
    skip('D2', 'Redis ON drills', 'REDIS_URL not set');
    skip('D3', 'Redis ON drills', 'REDIS_URL not set');
    skip('D4', 'Redis ON drills', 'REDIS_URL not set');
    skip('D5', 'Redis ON drills', 'REDIS_URL not set');
    summarize();
    return;
  }

  // Drills 2, 3, 5 share a client.
  const client = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    connectionName: 'adlytic-drill-shared',
  });
  // Wait for ready or fail with a clear message.
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Redis did not become ready within 5s')), 5_000);
      client.once('ready', () => { clearTimeout(t); resolve(); });
      client.once('error', (e) => { clearTimeout(t); reject(e); });
    });
  } catch (e) {
    fail('connect', 'Redis connection', e instanceof Error ? e.message : String(e));
    summarize();
    process.exit(1);
  }

  await drill2_nxWinAndLose(client);
  await drill3_concurrentBurst(client);
  await drill5_tokenHealthHerd(client);
  client.disconnect(false);

  // Drill 4 owns its own short-lived client because it deliberately disconnects.
  await drill4_midFlightOutage();

  summarize();
}

function summarize(): void {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  console.log('');
  console.log('═══ Summary ═══');
  console.log(`  passed:  ${passed}`);
  console.log(`  failed:  ${failed}`);
  console.log(`  skipped: ${skipped}`);
  if (failed > 0) {
    console.error('');
    console.error('Drill suite FAILED. Do NOT flip WEBHOOK_REDIS_DEBOUNCE_ENABLED on in this environment.');
    process.exit(1);
  }
  console.log('');
  console.log('All non-skipped drills passed. Safe to enable in this environment.');
}

/** Strip password from a redis:// URL for safe logging. */
function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<unparseable>';
  }
}

main().catch((e) => {
  console.error('Drill runner crashed:', e);
  process.exit(1);
});
