// ════════════════════════════════════════════════════════════════════════
//  runSync.ts
//  STATUS: EXTRACTED FROM CONVERSATION ARTIFACT (STEP_13_RUNBOOK.md §13.6)
//
//  Pulls real Meta data for the furniture account and upserts daily_stats.
//  Requires META_ACCESS_TOKEN and META_ACCOUNT_ID in the environment.
//  Step 13.6 — only needed before Step 14 (deploy).
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { MetaClient } from "./src/services/metaClient";
import { SyncAccountWorker } from "./src/workers/syncAccount";

const prisma = new PrismaClient();
const meta = new MetaClient({
  apiVersion: process.env.META_API_VERSION ?? "v20.0",
  accessToken: process.env.META_ACCESS_TOKEN!,
});

async function main() {
  const acc = await prisma.adAccount.findFirst({
    where: { name: "Furniture — Meta" },
  });
  if (!acc) throw new Error("seed first");

  // Update externalAccountId to the REAL Meta account id (act_<numeric>)
  // before running. The seed wrote a placeholder.
  await prisma.adAccount.update({
    where: { id: acc.id },
    data: { externalAccountId: process.env.META_ACCOUNT_ID! },
  });

  const worker = new SyncAccountWorker(prisma, meta);
  const result = await worker.sync(acc.id, { backfillDays: 7 });
  console.log(result);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
