// ════════════════════════════════════════════════════════════════════════
//  src/workers/runEngines.ts
//
//  Runs all four intelligence engines sequentially for a given ad account
//  after ETL (SyncAccountWorker) completes.
//
//  Pipeline order (must not change — each engine reads the previous one's output):
//    1. AnalyticsEngine  → metric_trends
//    2. RulesEngine      → detected_issues
//    3. RecommendationEngine → recommendations
//    4. HealthScoreEngine → health_scores
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from '@prisma/client';
import { AnalyticsEngine } from '../engines/analytics/AnalyticsEngine';
import { RulesEngine } from '../engines/rules/RulesEngine';
import { RecommendationEngine } from '../engines/recommendation/RecommendationEngine';
import { HealthScoreEngine } from '../engines/health/HealthScoreEngine';

export interface EngineRunResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export async function runEngines(
  prisma: PrismaClient,
  adAccountId: string,
  opts?: { now?: Date },
): Promise<EngineRunResult> {
  const start = Date.now();
  const now = opts?.now ?? new Date();
  const tag = `[engines:${adAccountId.slice(0, 8)}]`;

  try {
    console.log(`${tag} Running analytics engine…`);
    const analyticsEngine = new AnalyticsEngine(prisma);
    const aResult = await analyticsEngine.run(EntityType.ACCOUNT, adAccountId, { asOf: now });
    console.log(`${tag} Analytics done — ${JSON.stringify(aResult).slice(0, 120)}`);

    console.log(`${tag} Running rules engine…`);
    const rulesEngine = new RulesEngine(prisma);
    const rResult = await rulesEngine.run(EntityType.ACCOUNT, adAccountId, { asOf: now });
    console.log(`${tag} Rules done — issues fired: ${(rResult as any)?.issuesFired ?? '?'}`);

    console.log(`${tag} Running recommendation engine…`);
    const recommendationEngine = new RecommendationEngine(prisma);
    await recommendationEngine.run(EntityType.ACCOUNT, adAccountId, { asOf: now });
    console.log(`${tag} Recommendation done`);

    console.log(`${tag} Running health engine…`);
    const healthEngine = new HealthScoreEngine(prisma);
    const hResult = await healthEngine.run(EntityType.ACCOUNT, adAccountId, { asOf: now });
    console.log(`${tag} Health done — score: ${(hResult as any)?.score ?? '?'}`);

    const durationMs = Date.now() - start;
    console.log(`${tag} ALL ENGINES COMPLETE — ${durationMs}ms`);
    return { ok: true, durationMs };
  } catch (e) {
    const durationMs = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    console.error(`${tag} ENGINE FAILED — ${error}`);
    return { ok: false, durationMs, error };
  }
}
