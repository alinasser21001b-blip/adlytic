// ════════════════════════════════════════════════════════════════════════
//  runEngines.ts
//  STATUS: EXTRACTED FROM CONVERSATION ARTIFACT (STEP_13_RUNBOOK.md §13.3)
//
//  Drives the full engine chain against the seeded furniture account.
//  Not production code — a Step 13 verification harness.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import { AnalyticsEngine } from "./src/engines/analytics/AnalyticsEngine";
import { RulesEngine } from "./src/engines/rules/RulesEngine";
import { RecommendationEngine } from "./src/engines/recommendation/RecommendationEngine";
import { HealthScoreEngine } from "./src/engines/health/HealthScoreEngine";

const prisma = new PrismaClient();

async function main() {
  // Find the furniture ad account
  const furnitureWs = await prisma.workspace.findFirst({
    where: { name: "Furniture Showroom" },
    include: { adAccounts: true },
  });
  if (!furnitureWs) throw new Error("Furniture workspace not found — did you seed?");
  const acc = furnitureWs.adAccounts[0];
  if (!acc) throw new Error("No ad account on furniture workspace");

  console.log(`Running engines for ad_account ${acc.id} (${acc.name})\n`);

  const asOf = new Date("2026-06-14T12:00:00Z");

  // 1. Analytics
  const analytics = new AnalyticsEngine(prisma);
  const a = await analytics.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Analytics:", a.ok ? "ok" : a.error);
  console.log("  trends:", a.trends);

  // 2. Rules
  const rules = new RulesEngine(prisma);
  const r = await rules.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Rules:", r.ok ? "ok" : r.error);
  console.log("  issues:", r.issues.map(i => `${i.issueCode}/${i.severity}`));

  // 3. Recommendation
  const rec = new RecommendationEngine(prisma);
  const rc = await rec.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Recommendation:", rc.ok ? "ok" : rc.error);
  console.log("  action:", rc.recommendation?.actionCode, "priority:", rc.recommendation?.priority);

  // 4. Health Score (v2)
  const health = new HealthScoreEngine(prisma);
  const h = await health.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Health:", h.ok ? "ok" : h.error);
  console.log("  score:", h.score);
  console.log("  breakdown:", JSON.stringify(h.breakdown.facets, null, 2));
// Campaign health (v2)
const campaigns = await prisma.campaign.findMany({
  where: {
    adAccountId: acc.id,
    status: "ACTIVE"
  }
});

for (const c of campaigns) {
  const hc = await health.run(
    EntityType.CAMPAIGN,
    c.id,
    { asOf }
  );

  console.log(
    `Campaign ${c.name}:`,
    hc.ok ? hc.score : hc.error
  );
}
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
