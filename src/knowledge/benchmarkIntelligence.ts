import fs from "node:fs";
import path from "node:path";
import type { BenchmarkAssessment, CampaignMetrics } from "./types";

type JsonRecord = Record<string, unknown>;

interface BenchmarkSourceRef {
  id: string;
  label: string;
  url?: string;
}

interface BenchmarkRange {
  min: number | null;
  max: number | null;
}

const BENCHMARK_FILE = "benchmarks_by_industry.json";

// Add explicit source references to make recommendation evidence traceable.
const SOURCE_REFERENCES: Record<string, BenchmarkSourceRef> = {
  pengwing: {
    id: "pengwing",
    label: "Pengwing Meta Ads Benchmarks 2026",
    url: "https://www.pengwing.com/meta-ads-benchmarks-2026",
  },
  goodmorning: {
    id: "goodmorning",
    label: "Good Morning Marketing frequency guidance",
  },
  ryze_video: {
    id: "ryze_video",
    label: "Ryze Agency 2026 video creative benchmarks",
  },
  metaglossary_messaging: {
    id: "metaglossary_messaging",
    label: "Meta glossary (messaging event definitions)",
  },
};

const METRIC_CONFIG: Record<
  string,
  { globalKey?: string; industryKey?: string; unitHint?: "percent" | "ratio" | "currency" | "count" }
> = {
  ctr: { globalKey: "CTR", industryKey: "CTR", unitHint: "percent" },
  cpm: { globalKey: "CPM", industryKey: "CPM", unitHint: "currency" },
  cpc: { globalKey: "CPC", industryKey: "CPC", unitHint: "currency" },
  roas: { globalKey: "ROAS_ecommerce", industryKey: "ROAS", unitHint: "ratio" },
  frequency: { globalKey: "frequency", unitHint: "count" },
  // Explicitly map to the best available public proxy.
  cost_per_message: { globalKey: "messaging_objective", industryKey: "CPL", unitHint: "currency" },
};

let cachedBenchmarks: JsonRecord | null = null;

function knowledgeDirCandidates(): string[] {
  const dirs = new Set<string>();
  dirs.add(path.join(__dirname));
  dirs.add(path.join(process.cwd(), "src/knowledge"));
  dirs.add(path.join(process.cwd(), "dist/src/knowledge"));
  return [...dirs];
}

function readBenchmarks(): JsonRecord | null {
  if (cachedBenchmarks) return cachedBenchmarks;
  for (const dir of knowledgeDirCandidates()) {
    const filePath = path.join(dir, BENCHMARK_FILE);
    if (!fs.existsSync(filePath)) continue;
    try {
      cachedBenchmarks = JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
      return cachedBenchmarks;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeIndustryKey(industryKey: string): string {
  return industryKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseRange(text: string): BenchmarkRange | null {
  const cleaned = text.replace(/,/g, "").trim().toLowerCase();
  const nums = [...cleaned.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  if (cleaned.includes("<")) return { min: null, max: nums[0] ?? null };
  if (cleaned.includes(">")) return { min: nums[0] ?? null, max: null };
  if (cleaned.includes("-")) return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null };
  return { min: nums[0] ?? null, max: nums[0] ?? null };
}

function compareAgainstRange(value: number, range: BenchmarkRange): "below" | "within" | "above" {
  if (range.min != null && value < range.min) return "below";
  if (range.max != null && value > range.max) return "above";
  return "within";
}

function describeComparison(
  metricLabel: string,
  value: number,
  benchmarkText: string,
  comparison: "below" | "within" | "above" | "unscored",
): string {
  if (comparison === "below") {
    return `${metricLabel} at ${value.toFixed(2)} is below benchmark (${benchmarkText}). Prioritize first-order fixes before scaling budget.`;
  }
  if (comparison === "above") {
    return `${metricLabel} at ${value.toFixed(2)} is above benchmark (${benchmarkText}). This may signal auction pressure or inefficiency and needs cross-metric validation.`;
  }
  if (comparison === "within") {
    return `${metricLabel} at ${value.toFixed(2)} is within benchmark (${benchmarkText}). Keep monitoring trend direction before changing strategy.`;
  }
  return `${metricLabel} at ${value.toFixed(2)} has no numeric benchmark range in the source (${benchmarkText}); use account-relative trend scoring.`;
}

function confidenceForComparison(comparison: "below" | "within" | "above" | "unscored"): "low" | "medium" | "high" {
  if (comparison === "unscored") return "low";
  if (comparison === "within") return "medium";
  return "high";
}

function pickSource(rawSource: unknown): string {
  if (typeof rawSource !== "string") return "unknown";
  const ref = SOURCE_REFERENCES[rawSource];
  return ref ? ref.label : rawSource;
}

function getRangeTextFromObject(raw: JsonRecord): string | null {
  const preferredKeys = ["average", "typical", "good", "excellent", "strong"];
  for (const key of preferredKeys) {
    if (typeof raw[key] === "string") return String(raw[key]);
  }
  for (const value of Object.values(raw)) {
    if (typeof value === "string" && /[\d]/.test(value)) return value;
  }
  return null;
}

export interface BenchmarkEvaluationOptions {
  industryKey?: string | null;
}

export function evaluateBenchmarks(
  metrics: CampaignMetrics,
  options: BenchmarkEvaluationOptions = {},
): BenchmarkAssessment[] {
  const loaded = readBenchmarks();
  if (!loaded) return [];

  const global = (loaded["global_averages"] as JsonRecord | undefined) ?? {};
  const industries = (loaded["industries"] as JsonRecord | undefined) ?? {};
  const normalizedIndustry =
    typeof options.industryKey === "string" && options.industryKey.trim().length > 0
      ? normalizeIndustryKey(options.industryKey)
      : null;
  const industry = normalizedIndustry ? (industries[normalizedIndustry] as JsonRecord | undefined) : undefined;

  const results: BenchmarkAssessment[] = [];

  for (const [metricKey, rawValue] of Object.entries(metrics)) {
    if (rawValue == null || !Number.isFinite(rawValue)) continue;
    const mapping = METRIC_CONFIG[metricKey];
    if (!mapping) continue;

    let benchmarkText: string | null = null;
    let source = "unknown";
    let metricLabel = metricKey.toUpperCase();

    if (mapping.industryKey && industry && typeof industry[mapping.industryKey] === "string") {
      benchmarkText = String(industry[mapping.industryKey]);
      source = pickSource(industry["source"]);
      if (typeof industry["label"] === "string") metricLabel = `${metricLabel} (${industry["label"]})`;
    } else if (mapping.globalKey && typeof global[mapping.globalKey] === "object" && global[mapping.globalKey] != null) {
      const g = global[mapping.globalKey] as JsonRecord;
      benchmarkText = getRangeTextFromObject(g);
      source = pickSource(g["source"]);
    } else if (mapping.globalKey && typeof loaded[mapping.globalKey] === "string") {
      benchmarkText = String(loaded[mapping.globalKey]);
    } else if (mapping.globalKey && typeof loaded[mapping.globalKey] === "object" && loaded[mapping.globalKey] != null) {
      benchmarkText = getRangeTextFromObject(loaded[mapping.globalKey] as JsonRecord);
    }

    if (!benchmarkText) continue;

    const parsed = parseRange(benchmarkText);
    const comparison = parsed ? compareAgainstRange(rawValue, parsed) : "unscored";
    results.push({
      metricKey,
      metricLabel,
      liveValue: rawValue,
      benchmarkText,
      source,
      comparison,
      confidence: confidenceForComparison(comparison),
      inference: describeComparison(metricLabel, rawValue, benchmarkText, comparison),
    });
  }

  // Sort with actionable outliers first.
  const score = (c: BenchmarkAssessment["comparison"]) => {
    if (c === "below" || c === "above") return 2;
    if (c === "within") return 1;
    return 0;
  };
  return results.sort((a, b) => score(b.comparison) - score(a.comparison));
}

export function resetBenchmarkCache(): void {
  cachedBenchmarks = null;
}
