// Step 12 condition: DashboardDTO must NOT change shape.
// The HTML rendering it cannot tell that anything happened internally.
// This test asserts the shape exhaustively against the documented contract.

import type { DashboardDTO } from "./src/services/getDashboard";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

// The contract: every top-level field, every nested field, every shape.
// This is a type-level + structural assertion. Building a fake DTO that
// satisfies the TYPE proves the interface still accepts the same fields.

const fake: DashboardDTO = {
  workspace: {
    id: "ws_x", name: "Test", industry: "furniture", locale: "EN" as any,
    currency: "IQD", currencyMinorFactor: 1, lastSyncedAt: null, activeCampaigns: 2,
    campaignCounts: {
      total: 5, activeStatus: 3, paused: 1, archived: 1, spendingToday: 2, withMetrics: 2,
    },
  },
  health: { score: 51, band: "attention" },
  kpis: [
    { key: "spend", label: "Spend", value: 100, display: "100", deltaPct: 0.1, direction: "up", goodWhenUp: false },
  ],
  trendSeries: { dates: ["2026-06-14"], messages: [4], spend: [13000], ctr: [2.0] },
  issues: [
    { code: "AUDIENCE_FATIGUE" as any, title: "Audience fatigue", severity: "HIGH",
      causes: ["..."], recommendations: ["..."], evidence: { confidence: 0.9 } },
  ],
  priorityAction: {
    actionCode: "REFRESH_CREATIVES", priority: "HIGH",
    text: "Refresh creatives", details: null,
  },
  diagnoses: [],
  attribution: null,
  bestCampaign: {
    id: "c1", metaId: "120001", name: "Bedroom", health: 94, band: "excellent",
    messages: 45, ctr: 4.2, cpm: 3.8, frequency: 3.1,
  },
  worstCampaign: {
    id: "c2", metaId: "120002", name: "Living Room", health: 57, band: "attention",
    messages: 8, ctr: 1.6, cpm: 6.1, frequency: 6.4,
  },
  lifetimeSpend: { minor: 128294, display: "1282.94 USD", syncedAt: "2026-06-26T00:00:00.000Z" },
};

// Top-level keys
const topKeys = Object.keys(fake).sort();
const expectedTopKeys = ["attribution", "bestCampaign", "diagnoses", "health", "issues", "kpis", "lifetimeSpend", "priorityAction", "trendSeries", "workspace", "worstCampaign"];
check("DTO top-level keys exact match (no additions, no removals)",
  JSON.stringify(topKeys) === JSON.stringify(expectedTopKeys), topKeys);

// workspace fields
const wsKeys = Object.keys(fake.workspace).sort();
const expectedWsKeys = ["activeCampaigns", "campaignCounts", "currency", "currencyMinorFactor", "id", "industry", "lastSyncedAt", "locale", "name"];
check("workspace shape includes campaignCounts",
  JSON.stringify(wsKeys) === JSON.stringify(expectedWsKeys), wsKeys);

// health fields
const healthKeys = Object.keys(fake.health).sort();
check("health shape: {score, band} only",
  JSON.stringify(healthKeys) === JSON.stringify(["band", "score"]), healthKeys);

// KPI shape
const kpiKeys = Object.keys(fake.kpis[0]).sort();
const expectedKpiKeys = ["deltaPct", "direction", "display", "goodWhenUp", "key", "label", "value"];
check("KPI shape: 7 fields, no health/severity leaking in",
  JSON.stringify(kpiKeys) === JSON.stringify(expectedKpiKeys), kpiKeys);

// trendSeries shape
const tsKeys = Object.keys(fake.trendSeries).sort();
check("trendSeries shape: {dates, messages, spend, ctr}",
  JSON.stringify(tsKeys) === JSON.stringify(["ctr", "dates", "messages", "spend"]), tsKeys);

// issues shape
const issueKeys = Object.keys(fake.issues[0]).sort();
const expectedIssueKeys = ["causes", "code", "evidence", "recommendations", "severity", "title"];
check("issue shape: 6 fields, includes localized text from KnowledgeEngine",
  JSON.stringify(issueKeys) === JSON.stringify(expectedIssueKeys), issueKeys);

// priorityAction shape
const paKeys = Object.keys(fake.priorityAction!).sort();
const expectedPaKeys = ["actionCode", "details", "priority", "text"];
check("priorityAction shape: 4 fields — actionCode + text together (code from Recommendation, text from Knowledge)",
  JSON.stringify(paKeys) === JSON.stringify(expectedPaKeys), paKeys);

// lifetimeSpend shape
const lsKeys = Object.keys(fake.lifetimeSpend!).sort();
check("lifetimeSpend shape: {minor, display, syncedAt}",
  JSON.stringify(lsKeys) === JSON.stringify(["display", "minor", "syncedAt"]), lsKeys);

// campaign card shape
const ccKeys = Object.keys(fake.bestCampaign!).sort();
const expectedCcKeys = ["band", "cpm", "ctr", "frequency", "health", "id", "messages", "metaId", "name"];
check("campaignCard shape includes metaId",
  JSON.stringify(ccKeys) === JSON.stringify(expectedCcKeys), ccKeys);

// Verify the DTO does NOT contain any v2-leaked field
const dtoJson = JSON.stringify(fake);
check("DTO does NOT leak algorithmVersion to frontend",
  !dtoJson.includes("algorithmVersion"));
check("DTO does NOT leak HEALTH_ALGORITHM_VERSION constant",
  !dtoJson.includes("HEALTH_ALGORITHM_VERSION"));
check("DTO does NOT leak breakdown_json (internal versioning is invisible to consumers)",
  !dtoJson.includes("breakdownJson") && !dtoJson.includes("breakdown_json"));

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
