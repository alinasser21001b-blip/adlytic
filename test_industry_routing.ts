import { evaluateBenchmarks } from "./src/knowledge";
import {
  resolveBenchmarkIndustryFromContext,
  resolveBenchmarkIndustryFromProfile,
  toBenchmarkEvaluationOptions,
} from "./src/knowledge/industryRouting";

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

function main() {
  console.log("\n── Industry routing ──");

  const furniture = resolveBenchmarkIndustryFromProfile({
    name: "furniture",
    knowledgeJson: { ctrBenchmark: 2.0 },
  });
  check(
    "furniture profile maps to homewares benchmark key",
    furniture.benchmarkIndustryKey === "homewares_furniture_interiors",
    furniture,
  );
  check("furniture resolves from workspace", furniture.source === "workspace", furniture.source);

  const cosmetics = resolveBenchmarkIndustryFromProfile({ name: "cosmetics" });
  check(
    "cosmetics profile maps to beauty benchmark key",
    cosmetics.benchmarkIndustryKey === "beauty_cosmetics",
    cosmetics,
  );

  const explicit = resolveBenchmarkIndustryFromProfile({
    name: "custom",
    knowledgeJson: { benchmarkIndustryKey: "b2b_saas" },
  });
  check(
    "knowledgeJson.benchmarkIndustryKey overrides name mapping",
    explicit.benchmarkIndustryKey === "b2b_saas",
    explicit,
  );

  const fromWorkspace = resolveBenchmarkIndustryFromContext({
    workspace: { industryProfile: { name: "cosmetics" } },
  });
  check(
    "context resolver prefers workspace profile",
    fromWorkspace.benchmarkIndustryKey === "beauty_cosmetics",
    fromWorkspace,
  );

  const fromAccount = resolveBenchmarkIndustryFromContext({
    adAccount: { workspace: { industryProfile: { name: "furniture" } } },
  });
  check(
    "context resolver falls back to ad account workspace",
    fromAccount.benchmarkIndustryKey === "homewares_furniture_interiors" &&
      fromAccount.source === "ad_account",
    fromAccount,
  );

  const globalFallback = resolveBenchmarkIndustryFromContext({});
  check(
    "missing profile falls back to global",
    globalFallback.benchmarkIndustryKey === null && globalFallback.source === "global",
    globalFallback,
  );

  const routedOptions = toBenchmarkEvaluationOptions(fromWorkspace);
  const industryCtr = evaluateBenchmarks({ ctr: 1.5 }, routedOptions);
  const globalCtr = evaluateBenchmarks({ ctr: 1.5 }, toBenchmarkEvaluationOptions(globalFallback));
  check(
    "routed industry produces industry-labelled CTR assessment",
    industryCtr.some((x) => x.metricKey === "ctr" && x.metricLabel.includes("Beauty")),
    industryCtr.find((x) => x.metricKey === "ctr")?.metricLabel,
  );
  check(
    "global fallback still evaluates CTR",
    globalCtr.some((x) => x.metricKey === "ctr"),
    globalCtr.map((x) => x.metricKey),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
