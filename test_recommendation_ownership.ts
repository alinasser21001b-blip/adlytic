/**
 * P0-02 — Recommendation ownership regression suite.
 *
 * Guards the fix to src/repositories/recommendationsRepo.ts and
 * src/services/agent/tools/saveRecommendation.ts: two independent writers
 * share the `recommendations` table (V1_RULES via the repo, AI_AGENT via
 * the tool), and neither may reconcile or overwrite a row it does not own.
 *
 * Uses a small in-memory fake Prisma client, following this repo's own
 * convention (see test_worker.ts / test_recommendation.ts) rather than a
 * mocking framework — enough surface to exercise the real
 * RecommendationsRepo class and the real saveRecommendationHandler(), with
 * no live database in this sandbox.
 *
 * Run: npx tsx test_recommendation_ownership.ts
 */
import assert from 'node:assert/strict';
import { EntityType, RecommendationPriority, RecommendationSource, Prisma } from '@prisma/client';
import { RecommendationsRepo, type RecommendationRecord } from './src/repositories/recommendationsRepo';
import { saveRecommendationHandler } from './src/services/agent/tools/saveRecommendation';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (e: any) => { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); },
  );
}

// ── In-memory fake `recommendation` table + just-enough Prisma surface ────

interface Row {
  id: string;
  entityType: EntityType;
  entityId: string;
  date: Date;
  priority: RecommendationPriority;
  actionCode: string;
  sourceIssuesJson: unknown;
  detailsJson: unknown;
  source: RecommendationSource;
  reasoningChainJson: unknown;
}

let nextId = 1;
function keyOf(r: Pick<Row, 'entityType' | 'entityId' | 'date' | 'actionCode'>): string {
  return `${r.entityType}:${r.entityId}:${r.date.toISOString().slice(0, 10)}:${r.actionCode}`;
}

function makeFakePrisma(table: Row[]) {
  // Deferred "PrismaPromise"-like ops so $transaction can apply/roll back
  // atomically, matching what RecommendationsRepo relies on.
  type Op = { exec: () => void };

  // deleteMany/create below are used by RecommendationsRepo ONLY inside a
  // $transaction([...]) array, exactly like real Prisma's PrismaPromise:
  // constructing the call does not execute it — only $transaction's loop
  // (or a direct await, for callers that do that instead) does, exactly
  // once. Returning a plain { exec } here (not a Promise) keeps that
  // single-execution guarantee explicit rather than racing a `.then`
  // against $transaction's own call.
  const recommendation = {
    deleteMany(args: { where: { entityType: EntityType; entityId: string; date: Date; source?: RecommendationSource } }): Op {
      return {
        exec: () => {
          const before = table.length;
          const w = args.where;
          for (let i = table.length - 1; i >= 0; i--) {
            const r = table[i]!;
            if (r.entityType === w.entityType && r.entityId === w.entityId &&
                r.date.getTime() === w.date.getTime() &&
                (w.source === undefined || r.source === w.source)) {
              table.splice(i, 1);
            }
          }
          return { count: before - table.length };
        },
      };
    },
    create(args: { data: Omit<Row, 'id'> }): Op {
      return {
        exec: () => {
          const k = keyOf(args.data as Row);
          if (table.some((r) => keyOf(r) === k)) {
            throw new Prisma.PrismaClientKnownRequestError(
              `Unique constraint failed on the fields: (entityType,entityId,date,actionCode)`,
              { code: 'P2002', clientVersion: 'test' },
            );
          }
          // Matches prisma/schema.prisma's `source RecommendationSource
          // @default(V1_RULES)` — recommendationsRepo.ts's create() omits
          // `source` deliberately, relying on this default.
          const row: Row = { id: `rec_${nextId++}`, source: RecommendationSource.V1_RULES, ...args.data } as Row;
          table.push(row);
          return row;
        },
      };
    },
    async findUnique(args: { where: { entityType_entityId_date_actionCode: { entityType: EntityType; entityId: string; date: Date; actionCode: string } } }): Promise<Row | null> {
      const w = args.where.entityType_entityId_date_actionCode;
      return table.find((r) => keyOf(r) === keyOf(w as Row)) ?? null;
    },
    async upsert(args: {
      where: { entityType_entityId_date_actionCode: { entityType: EntityType; entityId: string; date: Date; actionCode: string } };
      create: Omit<Row, 'id'>;
      update: Partial<Row>;
    }): Promise<Row> {
      const w = args.where.entityType_entityId_date_actionCode;
      const existing = table.find((r) => keyOf(r) === keyOf(w as Row));
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      const row: Row = { id: `rec_${nextId++}`, ...args.create } as Row;
      table.push(row);
      return row;
    },
  };

  return {
    recommendation,
    campaign: { findFirst: async () => ({ id: 'camp_1' }) },
    adAccount: { findFirst: async () => ({ id: 'acct_1' }) },
    async $transaction(ops: Op[]) {
      // Snapshot-and-roll-back, matching Prisma's array-form atomicity.
      const snapshot = table.slice();
      const results: unknown[] = [];
      try {
        for (const op of ops) results.push(op.exec());
      } catch (e) {
        table.length = 0;
        table.push(...snapshot);
        throw e;
      }
      return results;
    },
  } as any;
}

const V1_ACCOUNT = { entityType: EntityType.ACCOUNT, entityId: 'acct_shared' };
const dateA = new Date('2026-08-19T00:00:00.000Z');

function rec(actionCode: string, priority: RecommendationPriority = RecommendationPriority.HIGH): RecommendationRecord {
  return { actionCode, priority, sourceIssues: [], details: null };
}

async function run() {
  console.log('\n── 0. Characterize the bug being fixed ──');
  await check('the OLD unscoped delete really would have removed an AI-authored row', async () => {
    // src/repositories/recommendationsRepo.ts's pre-fix deleteMany, reproduced
    // here verbatim (entityType+entityId+date, no source filter), applied to
    // the same fixture test B uses, to make the regression this suite guards
    // against undeniable rather than inferred.
    const table: Row[] = [{
      id: 'ai_1', ...V1_ACCOUNT, date: dateA, priority: RecommendationPriority.HIGH,
      actionCode: 'REFRESH_CREATIVE', sourceIssuesJson: {}, detailsJson: null,
      source: RecommendationSource.AI_AGENT, reasoningChainJson: {},
    }];
    const oldUnscopedDelete = (t: Row[], w: { entityType: EntityType; entityId: string; date: Date }) => {
      for (let i = t.length - 1; i >= 0; i--) {
        const r = t[i]!;
        if (r.entityType === w.entityType && r.entityId === w.entityId && r.date.getTime() === w.date.getTime()) {
          t.splice(i, 1);
        }
      }
    };
    oldUnscopedDelete(table, { ...V1_ACCOUNT, date: dateA });
    assert.equal(table.length, 0, 'confirms the old code would have deleted the AI-authored row');
    // The fixed repo must NOT reproduce this — proven in scenario B below.
  });

  console.log('\n── A. deterministic sync replaces its own prior recommendation ──');
  await check('A. second replaceForDate call replaces the first V1_RULES row', async () => {
    const table: Row[] = [];
    const repo = new RecommendationsRepo(makeFakePrisma(table));
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('MONITOR') });
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('PAUSE') });
    const v1Rows = table.filter((r) => r.source === RecommendationSource.V1_RULES);
    assert.equal(v1Rows.length, 1, 'exactly one V1_RULES row should remain');
    assert.equal(v1Rows[0]!.actionCode, 'PAUSE');
  });

  console.log('\n── B. deterministic sync cannot delete AI-authored recommendation ──');
  await check('B. AI row for a different actionCode survives a deterministic replaceForDate', async () => {
    const table: Row[] = [{
      id: 'ai_1', ...V1_ACCOUNT, date: dateA, priority: RecommendationPriority.HIGH,
      actionCode: 'REFRESH_CREATIVE', sourceIssuesJson: { source: 'ai_agent', text: 'x' },
      detailsJson: { text: 'x' }, source: RecommendationSource.AI_AGENT, reasoningChainJson: {},
    }];
    const repo = new RecommendationsRepo(makeFakePrisma(table));
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('MONITOR') });
    const aiRow = table.find((r) => r.id === 'ai_1');
    assert.ok(aiRow, 'AI-authored row must still exist');
    assert.equal(aiRow!.source, RecommendationSource.AI_AGENT);
    assert.equal(aiRow!.actionCode, 'REFRESH_CREATIVE', 'AI row content must be untouched');
    const v1Rows = table.filter((r) => r.source === RecommendationSource.V1_RULES);
    assert.equal(v1Rows.length, 1, 'the new deterministic row must also have been written');
  });

  console.log('\n── C. AI write cannot silently overwrite a deterministic recommendation ──');
  await check('C. save_recommendation refuses to overwrite an existing V1_RULES row at the same slot', async () => {
    const table: Row[] = [{
      id: 'v1_1', ...V1_ACCOUNT, date: dateA, priority: RecommendationPriority.HIGH,
      actionCode: 'PAUSE', sourceIssuesJson: [], detailsJson: null,
      source: RecommendationSource.V1_RULES, reasoningChainJson: null,
    }];
    const prisma = makeFakePrisma(table);
    const handler = saveRecommendationHandler();
    const result = await handler.run(
      { entityType: 'ACCOUNT', entityId: V1_ACCOUNT.entityId, text: 'وقف الحملة لضعف الأداء والنتائج المنخفضة', actionCode: 'PAUSE', priority: 'HIGH', reasoning: 'This is a sufficiently long AI reasoning string for validation.' },
      { prisma, workspaceId: 'ws_1', userId: 'u_1' },
    );
    assert.equal(result.ok, false, 'must refuse, not silently upsert');
    if (!result.ok) assert.equal(result.error.code, 'FORBIDDEN');
    const v1Row = table.find((r) => r.id === 'v1_1');
    assert.equal(v1Row!.source, RecommendationSource.V1_RULES, 'must not have been converted to AI_AGENT');
    assert.equal(table.length, 1, 'no second row created');
  });

  console.log('\n── D. repeated deterministic sync is idempotent ──');
  await check('D. calling replaceForDate twice with identical content yields exactly one row', async () => {
    const table: Row[] = [];
    const repo = new RecommendationsRepo(makeFakePrisma(table));
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('MONITOR') });
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('MONITOR') });
    assert.equal(table.length, 1);
    assert.equal(table[0]!.actionCode, 'MONITOR');
  });

  console.log('\n── E. repeated AI save is deduplicated per the tool\'s own idempotency key ──');
  await check('E. calling save_recommendation twice with the same key returns deduplicated=true and one row', async () => {
    const table: Row[] = [];
    const prisma = makeFakePrisma(table);
    const handler = saveRecommendationHandler();
    const args = { entityType: 'ACCOUNT' as const, entityId: V1_ACCOUNT.entityId, text: 'وقف الحملة لضعف الأداء والنتائج المنخفضة', actionCode: 'PAUSE' as const, priority: 'HIGH' as const, reasoning: 'This is a sufficiently long AI reasoning string for validation.' };
    const ctx = { prisma, workspaceId: 'ws_1', userId: 'u_1' };
    const first = await handler.run(args, ctx);
    const second = await handler.run(args, ctx);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal((second.data as any).deduplicated, true, 'second call must report deduplicated=true');
    const aiRows = table.filter((r) => r.source === RecommendationSource.AI_AGENT);
    assert.equal(aiRows.length, 1);
  });

  console.log('\n── F. both sources coexist when identities differ ──');
  await check('F. a V1_RULES row and an AI_AGENT row for the same entity/date but different actionCodes both persist', async () => {
    const table: Row[] = [];
    const prisma = makeFakePrisma(table);
    const repo = new RecommendationsRepo(prisma);
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('MONITOR') });
    const handler = saveRecommendationHandler();
    const result = await handler.run(
      { entityType: 'ACCOUNT', entityId: V1_ACCOUNT.entityId, text: 'وقف الحملة لضعف الأداء والنتائج المنخفضة', actionCode: 'PAUSE', priority: 'HIGH', reasoning: 'This is a sufficiently long AI reasoning string for validation.' },
      { prisma, workspaceId: 'ws_1', userId: 'u_1' },
    );
    assert.equal(result.ok, true, 'AI write at a distinct actionCode must succeed');
    assert.equal(table.length, 2);
    assert.ok(table.some((r) => r.source === RecommendationSource.V1_RULES && r.actionCode === 'MONITOR'));
    assert.ok(table.some((r) => r.source === RecommendationSource.AI_AGENT && r.actionCode === 'PAUSE'));
  });

  console.log('\n── G. delete scope is entity/tenant safe ──');
  await check('G. replaceForDate for one entity never touches another entity\'s row, same date', async () => {
    const table: Row[] = [{
      id: 'other_1', entityType: EntityType.ACCOUNT, entityId: 'acct_other', date: dateA,
      priority: RecommendationPriority.HIGH, actionCode: 'MONITOR', sourceIssuesJson: [],
      detailsJson: null, source: RecommendationSource.V1_RULES, reasoningChainJson: null,
    }];
    const repo = new RecommendationsRepo(makeFakePrisma(table));
    await repo.replaceForDate({ ...V1_ACCOUNT, date: dateA, recommendation: rec('PAUSE') });
    const other = table.find((r) => r.id === 'other_1');
    assert.ok(other, 'a different entity\'s row must be untouched');
    assert.equal(other!.actionCode, 'MONITOR');
  });

  console.log('\n── H. cross-account recommendation deletion is impossible ──');
  await check('H. save_recommendation for one workspace\'s account cannot target another workspace\'s entity', async () => {
    const table: Row[] = [];
    const prisma = makeFakePrisma(table);
    // campaign.findFirst returns null when the entity does not belong to the
    // caller's workspace — the real Prisma query scopes on adAccount.workspaceId.
    prisma.campaign.findFirst = async (args: any) => null;
    const handler = saveRecommendationHandler();
    const result = await handler.run(
      { entityType: 'CAMPAIGN', entityId: 'camp_in_other_workspace', text: 'وقف الحملة لضعف الأداء والنتائج المنخفضة', actionCode: 'PAUSE', priority: 'HIGH', reasoning: 'This is a sufficiently long AI reasoning string for validation.' },
      { prisma, workspaceId: 'ws_1', userId: 'u_1' },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(table.length, 0, 'nothing written for an out-of-tenant entity');
  });

  console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
  if (fail.length > 0) {
    console.error('failed: ' + fail.join(', '));
    process.exit(1);
  }
}

run();
