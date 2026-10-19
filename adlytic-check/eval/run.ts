// Real-provider benchmark. Runs only where ANTHROPIC_API_KEY exists (GitHub Actions),
// against synthetic fixtures only, with a hard cap on provider calls.
//   npx tsx eval/run.ts eval/run-request.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProviderReport } from "../shared/schemas";
import type { EngineHooks, EngineOutcome } from "../worker/engine/types";
import { runV1 } from "../worker/engine/v1";
import { runV2, type V2Core } from "../worker/engine/v2";
import { anthropicProvider, type VisionProvider } from "../worker/providers/vision";
import { aggregate, score, type FixtureCase, type ReportView } from "./score";

const here = dirname(fileURLToPath(import.meta.url));
const PRICES: Record<string, [number, number]> = { "claude-haiku-4-5": [1, 5], "claude-sonnet-4-5": [3, 15], "claude-sonnet-4-6": [3, 15] };

interface Request {
  engine: "v1" | "v2";
  split: "dev" | "heldout" | "all";
  model: string;
  maxCalls: number;
  concurrency?: number;
  repeatIds?: string[];
  only?: string[];
  timeoutMs?: number;
  maxOutputTokens?: number;
  note?: string;
}

type Engine = (c: FixtureCase, provider: VisionProvider, hooks: EngineHooks, timeoutMs: number, maxOutputTokens: number) => Promise<{ outcome: EngineOutcome<unknown>; view: ReportView | null }>;

const ENGINES: Record<string, Engine> = {
  async v1(c, provider, hooks, timeoutMs, maxOutputTokens) {
    const outcome = await runV1({
      input: { industry: c.industry as never, goal: c.goal as never, adCopy: c.adCopy, audience: c.audience, additionalContext: c.additionalContext },
      mode: c.mode,
      image: c.image ? { mime: "image/jpeg", bytes: new Uint8Array(readFileSync(join(here, "fixtures", c.image.file))) } : undefined,
      provider,
      timeoutMs,
      maxOutputTokens,
      hooks,
    });
    return { outcome, view: outcome.ok ? viewV1(outcome.report) : null };
  },
  async v2(c, provider, hooks, timeoutMs, maxOutputTokens) {
    const outcome = await runV2({
      input: { industry: c.industry as never, goal: c.goal as never, adCopy: c.adCopy, audience: c.audience, additionalContext: c.additionalContext },
      mode: c.mode,
      image: c.image ? { mime: "image/jpeg", bytes: new Uint8Array(readFileSync(join(here, "fixtures", c.image.file))) } : undefined,
      provider,
      timeoutMs,
      maxOutputTokens,
      hooks,
      showIndex: true,
    });
    return { outcome, view: outcome.ok ? viewV2(outcome.report) : null };
  },
};

const AXIS = (r: V2Core, dim: string) => r.dimensions.find((d) => d.dimension === dim)?.status ?? "not_assessed";

export function viewV2(r: V2Core): ReportView {
  const ic = r.improvedCopy;
  const linkedDims = r.dimensions.filter((d) => d.status === "strong" || d.status === "needs_improvement");
  return {
    improvedTexts: [ic.opening, ic.body, ic.headline, ic.callToAction, ...r.alternateOpenings, ...r.alternateCallsToAction],
    factsFromImage: r.evidence.filter((e) => e.source === "visible_text").map((e) => e.text),
    legibility: r.imageTextLegibility,
    axes: {
      cta: AXIS(r, "cta"),
      offerClear: AXIS(r, "offer_clarity"),
      readability: r.dimensions.some((d) => d.dimension === "legibility") ? normLeg(AXIS(r, "legibility")) : "not_assessed",
    },
    allText: JSON.stringify({ ...r, checkedRules: undefined, citations: undefined }),
    tips: r.shareableTips,
    citedSources: r.citations.map((c) => c.sourceId),
    evidenceLinked: { total: linkedDims.length, linked: linkedDims.filter((d) => d.evidenceIds.length > 0).length },
    index: r.index.value,
  };
}

// V2 "legibility" not_applicable (no text in image) maps to V1's not_assessed.
function normLeg(s: string): string {
  return s === "not_applicable" || s === "unknown" ? "not_assessed" : s;
}

export function viewV1(r: ProviderReport): ReportView {
  const ic = r.improvedCopy;
  return {
    improvedTexts: [ic.opening, ic.body, ic.headline, ic.callToAction],
    factsFromImage: r.factsReadFromImage,
    legibility: r.imageTextLegibility,
    axes: { cta: r.assessments.callToAction.status, offerClear: r.assessments.messageClarity.status, readability: r.assessments.visualReadability.status },
    allText: JSON.stringify(r),
    tips: r.shareableTips,
  };
}

async function main() {
  const file = JSON.parse(readFileSync(process.argv[2] ?? join(here, "run-request.json"), "utf8"));
  const runs: Request[] = Array.isArray(file.runs) ? file.runs : [file];
  const index = Number(process.argv[3] ?? 0);
  const req = runs[index];
  if (!req) {
    console.log(`EVAL_SKIP no run at index ${index}`);
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const engine = ENGINES[req.engine];
  if (!engine) throw new Error(`engine ${req.engine} not available`);
  const all: FixtureCase[] = JSON.parse(readFileSync(join(here, "fixtures/cases.json"), "utf8")).cases;
  let cases = all.filter((c) => req.split === "all" || c.split === req.split);
  if (req.only?.length) cases = cases.filter((c) => req.only!.includes(c.id));
  const jobs = [...cases.map((c) => ({ c, run: 1 })), ...(req.repeatIds ?? []).flatMap((id) => all.filter((c) => c.id === id).map((c) => ({ c, run: 2 })))];

  const provider = anthropicProvider({ apiKey, model: req.model, baseURL: "https://api.anthropic.com" });
  let calls = 0;
  const hooks: EngineHooks = { beforeCall: async () => (calls < req.maxCalls ? (calls++, true) : false) };
  const results: Array<Record<string, unknown>> = [];
  const t0 = Date.now();

  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { c, run } = jobs[next++]!;
      const started = Date.now();
      let res: Awaited<ReturnType<Engine>>;
      try {
        res = await engine!(c, provider, hooks, req.timeoutMs ?? 60000, req.maxOutputTokens ?? 4096);
      } catch (e) {
        console.log(`EVAL_ERROR ${c.id} ${e instanceof Error ? e.message : e}`);
        continue;
      }
      const latencyMs = Date.now() - started;
      const t = res.outcome.telemetry;
      const s = res.view ? score(c, res.view) : null;
      const row = {
        id: c.id, run, split: c.split, mode: c.mode, ok: res.outcome.ok, reason: res.outcome.ok ? null : res.outcome.reason,
        calls: t.calls, repairs: t.repairs, stripped: t.stripped, latencyMs, inTok: t.inputTokens, outTok: t.outputTokens, model: t.model,
        score: s, report: res.outcome.ok ? res.outcome.report : null,
      };
      results.push(row);
      console.log(`EVAL_RESULT ${JSON.stringify(row)}`);
    }
  }
  await Promise.all(Array.from({ length: req.concurrency ?? 4 }, worker));

  const first = results.filter((r) => r.run === 1);
  const ok = first.filter((r) => r.ok);
  const scores = ok.map((r) => r.score).filter(Boolean) as ReturnType<typeof score>[];
  const lat = ok.map((r) => r.latencyMs as number).sort((a, b) => a - b);
  const pct = (p: number) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null;
  const inTok = results.reduce((a, r) => a + (r.inTok as number), 0);
  const outTok = results.reduce((a, r) => a + (r.outTok as number), 0);
  const price = PRICES[req.model];
  // Consistency: second runs vs first runs on the same case.
  const pairs = results.filter((r) => r.run === 2 && r.ok).map((r2) => [first.find((r1) => r1.id === r2.id && r1.ok), r2] as const).filter(([a]) => a);
  const axesOf = (r: Record<string, unknown>) => { const v = viewAny(r); return v ? [v.axes.cta, v.axes.offerClear, v.axes.readability, v.legibility] : []; };
  const idxPairs = pairs.map(([a, b]) => [viewAny(a!)?.index, viewAny(b)?.index] as const).filter(([x, y]) => typeof x === "number" && typeof y === "number") as Array<readonly [number, number]>;
  const agree = pairs.map(([a, b]) => { const x = axesOf(a!), y = axesOf(b); return x.filter((v, i) => v === y[i]).length / Math.max(1, x.length); });

  const summary = {
    runIndex: index, engine: req.engine, model: req.model, split: req.split, timeoutMs: req.timeoutMs ?? 60000, maxOutputTokens: req.maxOutputTokens ?? 4096, note: req.note ?? null,
    jobs: jobs.length, completed: ok.length, failed: first.length - ok.length,
    failures: first.filter((r) => !r.ok).map((r) => `${r.id}:${r.reason}`),
    providerCalls: calls, callCapHit: calls >= req.maxCalls,
    repairRate: +(first.filter((r) => (r.repairs as string[]).length > 0).length / Math.max(1, first.length)).toFixed(3),
    repairReasons: first.flatMap((r) => r.repairs as string[]).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
    strippedReports: first.filter((r) => r.stripped).map((r) => r.id),
    latencyMs: { p50: pct(0.5), p90: pct(0.9), max: lat.at(-1) ?? null },
    tokens: { input: inTok, output: outTok },
    estCostUsd: price ? +((inTok * price[0] + outTok * price[1]) / 1e6).toFixed(4) : null,
    consistency: agree.length ? { pairs: agree.length, meanAgreement: +(agree.reduce((a, b) => a + b, 0) / agree.length).toFixed(3), indexAbsDiff: idxPairs.map(([x, y]) => Math.abs(x - y)) } : null,
    sources: {
      citedUnknown: scores.length ? ok.flatMap((r) => (viewAny(r)?.citedSources ?? []).filter((id) => !KNOWN_SOURCES.has(id))) : [],
      evidenceLinkRate: (() => { const v = ok.map((r) => viewAny(r)?.evidenceLinked).filter(Boolean) as Array<{ total: number; linked: number }>; const t = v.reduce((a, x) => a + x.total, 0); return t ? +(v.reduce((a, x) => a + x.linked, 0) / t).toFixed(3) : null; })(),
    },
    indexValues: ok.map((r) => [r.id, viewAny(r)?.index ?? null]),
    quality: aggregate(scores),
    wallSeconds: Math.round((Date.now() - t0) / 1000),
  };
  console.log(`EVAL_SUMMARY ${JSON.stringify(summary)}`);
  mkdirSync(join(here, "out"), { recursive: true });
  writeFileSync(join(here, "out", `run${index}-${req.engine}-${req.model}-${req.split}.json`), JSON.stringify({ summary, results }, null, 1));
}

function viewAny(r: Record<string, unknown>): ReportView | null {
  try {
    if (!r.report) return null;
    const rep = r.report as { schemaVersion?: string };
    return rep.schemaVersion === "2" ? viewV2(r.report as V2Core) : viewV1(r.report as ProviderReport);
  } catch { return null; }
}

const KNOWN_SOURCES = new Set((JSON.parse(readFileSync(join(here, "../research/sources.json"), "utf8")).sources as Array<{ sourceId: string }>).map((s) => s.sourceId));

main().catch((e) => { console.error(e); process.exit(1); });
