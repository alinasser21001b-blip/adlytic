// Exercises Meta Ads knowledge base loading, threshold evaluation, and verbatim
// recommended_optimization_actions — no database required.

import type { MetaAdsKnowledgeBase } from "./src/knowledge/types";
import {
  evaluateMetric,
  evaluateCampaign,
  findActionsForBreaches,
  formatActionsForDisplay,
  resetKnowledgeBaseCache,
  setKnowledgeBaseForTests,
} from "./src/knowledge";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`);
  }
}

const SAMPLE_KB: MetaAdsKnowledgeBase = {
  version: "test-1",
  platform: "meta_ads",
  metrics: [
    {
      key: "ctr",
      label: "Click-Through Rate",
      unit: "percent",
      direction: "below",
      warning_threshold: 1.5,
      critical_threshold: 1.0,
      recommended_optimization_actions: {
        warning: [
          {
            id: "CTR_WARN",
            title: "Test new hooks",
            description: "Warning-level CTR action.",
            priority: "HIGH",
          },
        ],
        critical: [
          {
            id: "CTR_CRIT",
            title: "Refresh creatives immediately",
            description: "Critical-level CTR action.",
            priority: "CRITICAL",
          },
        ],
      },
    },
    {
      key: "frequency",
      label: "Frequency",
      direction: "above",
      warning_threshold: 4.0,
      critical_threshold: 6.0,
      recommended_optimization_actions: {
        warning: [
          {
            id: "FREQ_WARN",
            title: "Expand audience",
            description: "Frequency warning action.",
          },
        ],
        critical: [
          {
            id: "FREQ_CRIT",
            title: "Cap frequency",
            description: "Frequency critical action.",
          },
        ],
      },
    },
  ],
};

function main() {
  console.log("\n── Knowledge base: threshold evaluation ──");
  setKnowledgeBaseForTests(SAMPLE_KB);

  {
    const breach = evaluateMetric("ctr", 1.2, { kb: SAMPLE_KB });
    check("CTR 1.2% → warning breach", breach?.severity === "warning", breach);
    check(
      "warning returns exact KB action id",
      breach?.recommended_optimization_actions[0]?.id === "CTR_WARN",
      breach?.recommended_optimization_actions,
    );
    check(
      "warning action description verbatim",
      breach?.recommended_optimization_actions[0]?.description === "Warning-level CTR action.",
    );
  }

  {
    const breach = evaluateMetric("ctr", 0.8, { kb: SAMPLE_KB });
    check("CTR 0.8% → critical breach", breach?.severity === "critical", breach);
    check(
      "critical returns CTR_CRIT action",
      breach?.recommended_optimization_actions.some(a => a.id === "CTR_CRIT"),
    );
  }

  {
    const breach = evaluateMetric("ctr", 2.5, { kb: SAMPLE_KB });
    check("CTR 2.5% → no breach", breach === null);
  }

  {
    const breach = evaluateMetric("frequency", 5.0, { kb: SAMPLE_KB });
    check("frequency 5 → warning (above direction)", breach?.severity === "warning", breach);
    check(
      "frequency warning action verbatim",
      breach?.recommended_optimization_actions[0]?.title === "Expand audience",
    );
  }

  {
    const breach = evaluateMetric("frequency", 7.0, { kb: SAMPLE_KB });
    check("frequency 7 → critical", breach?.severity === "critical");
    check(
      "critical frequency action id",
      breach?.recommended_optimization_actions[0]?.id === "FREQ_CRIT",
    );
  }

  console.log("\n── Knowledge base: evaluateCampaign + findActionsForBreaches ──");
  {
    const breaches = evaluateCampaign({ ctr: 0.9, frequency: 5.0 }, { kb: SAMPLE_KB });
    check("multi-metric campaign returns 2 breaches", breaches.length === 2, breaches.length);
    check("critical CTR sorted first", breaches[0]?.metricKey === "ctr");

    const actions = findActionsForBreaches(breaches);
    check("deduped actions include both metrics", actions.length === 2, actions.map(a => a.id));
    check(
      "display format preserves title + description",
      formatActionsForDisplay(actions)[0] === "Refresh creatives immediately: Critical-level CTR action.",
    );
  }

  console.log("\n── Knowledge base: empty / missing metrics ──");
  {
    setKnowledgeBaseForTests({ version: "0", platform: "meta_ads", metrics: [] });
    check("empty KB → no breaches", evaluateCampaign({ ctr: 0.5 }).length === 0);
    check("unknown metric key → null", evaluateMetric("roas", 0.5) === null);
  }

  resetKnowledgeBaseCache();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
