import { evaluateBenchmarks } from "./src/knowledge";

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
  console.log("\n── Benchmark intelligence ──");

  const outliers = evaluateBenchmarks({
    ctr: 0.6,
    cpm: 25,
    frequency: 5.2,
    cost_per_message: 30,
  }, { industryKey: "fashion_apparel" });

  check("returns benchmark insights", outliers.length > 0, outliers.length);
  check(
    "contains CTR assessment",
    outliers.some((x) => x.metricKey === "ctr"),
    outliers.map((x) => x.metricKey),
  );
  check(
    "includes explicit inference text",
    outliers.every((x) => x.inference.length > 20),
  );
  check(
    "non-within values are sorted first",
    outliers.length < 2 || (outliers[0]!.comparison !== "within"),
    outliers.map((x) => x.comparison),
  );

  const neutral = evaluateBenchmarks({
    ctr: 1.2,
    frequency: 3.0,
    cpm: 12,
  }, { industryKey: "homewares_furniture_interiors" });

  check(
    "can return within-range results",
    neutral.some((x) => x.comparison === "within"),
    neutral.map((x) => x.comparison),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
