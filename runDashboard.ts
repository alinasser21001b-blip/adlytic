// ════════════════════════════════════════════════════════════════════════
//  runDashboard.ts
//  STATUS: EXTRACTED FROM CONVERSATION ARTIFACT (STEP_13_RUNBOOK.md §13.4)
//
//  Calls getDashboard against the seeded + engine-populated DB and prints
//  the DashboardDTO plus spot-checks. Step 13 verification harness.
// ════════════════════════════════════════════════════════════════════════

import { getDashboard } from "./src/services/getDashboard";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const ws = await prisma.workspace.findFirst({ where: { name: "Furniture Showroom" } });
  if (!ws) throw new Error("seed not run");

  const dto = await getDashboard(ws.id);

  console.log("\n══ DashboardDTO ══");
  console.log(JSON.stringify(dto, null, 2));

  // Spot-checks
  console.log("\n══ Spot-checks ══");
  console.log("health.score:", dto.health.score, "band:", dto.health.band);
  console.log("issues:", dto.issues.length, "→", dto.issues.map(i => i.code).join(", "));
  console.log("priorityAction:", dto.priorityAction?.actionCode, "/", dto.priorityAction?.text);
  console.log("bestCampaign:", dto.bestCampaign?.name, dto.bestCampaign?.health);
  console.log("worstCampaign:", dto.worstCampaign?.name, dto.worstCampaign?.health);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
