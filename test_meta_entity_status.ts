import { EntityStatus } from "@prisma/client";
import {
  mapMetaEntityStatus,
  resolveCampaignStatusFromMeta,
} from "./src/lib/metaEntityStatus";
import { isCurrentlySpending, getAccountLocalDateString, accountLocalTodayFloor } from "./src/lib/campaignSpending";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`);
  }
}

console.log("\n── metaEntityStatus ──");
check("ACTIVE maps to ACTIVE", mapMetaEntityStatus("ACTIVE") === EntityStatus.ACTIVE);
check("CAMPAIGN_PAUSED maps to PAUSED", mapMetaEntityStatus("CAMPAIGN_PAUSED") === EntityStatus.PAUSED);
check("unknown maps to ARCHIVED", mapMetaEntityStatus("WEIRD") === EntityStatus.ARCHIVED);

check(
  "prefers effective_status over configured status",
  resolveCampaignStatusFromMeta({ status: "ACTIVE", effective_status: "PAUSED" }) === EntityStatus.PAUSED,
);
check(
  "past stop_time → PAUSED",
  resolveCampaignStatusFromMeta(
    { status: "ACTIVE", effective_status: "ACTIVE", stop_time: "2020-01-01T00:00:00+0000" },
    { now: new Date("2026-06-29T12:00:00Z") },
  ) === EntityStatus.PAUSED,
);

console.log("\n── campaignSpending ──");
check(
  "ACTIVE + spend today → currently spending",
  isCurrentlySpending({ status: EntityStatus.ACTIVE, spendTodayMinor: 100 }),
);
check(
  "ACTIVE + zero today → not spending",
  !isCurrentlySpending({ status: EntityStatus.ACTIVE, spendTodayMinor: 0, spendYesterdayMinor: 500 }),
);
check(
  "PAUSED → not spending",
  !isCurrentlySpending({ status: EntityStatus.PAUSED, spendTodayMinor: 100 }),
);

console.log("\n── accountLocalTodayFloor ──");
check(
  "Asia/Baghdad local date before UTC midnight",
  getAccountLocalDateString("Asia/Baghdad", new Date("2026-06-28T21:00:00Z")) === "2026-06-29",
);
check(
  "accountLocalTodayFloor matches local YYYY-MM-DD",
  accountLocalTodayFloor("Asia/Baghdad", new Date("2026-06-28T21:00:00Z")).toISOString().slice(0, 10) === "2026-06-29",
);

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
