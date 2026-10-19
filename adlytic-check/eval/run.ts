// Real-provider benchmark. Runs only where ANTHROPIC_API_KEY exists (GitHub Actions),
// against synthetic fixtures only, with a hard cap on provider calls.
//   npx tsx eval/run.ts eval/run-request.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProviderReport } from "../shared/schemas";
import type { EngineHooks, EngineOutcome } from "../worker/engine/types";
import { runV1 } from "../worker/engine/v1";
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
  note?: string;
}

type Engine = (c: FixtureCase, provider: VisionProvider, hooks: EngineHooks, timeoutMs: number) => Promise<{ outcome: EngineOutcome<unknown>; view: ReportView | null }>;

const ENGINES: Record<string, Engine> = {
  async v1(c, provider, hooks, timeoutMs) {
    const outcome = await runV1({
      input: { industry: c.industry as never, goal: c.goal as never, adCopy: c.adCopy, audience: c.audience, additionalContext: c.additionalContext },
      mode: c.mode,
      image: c.image ? { mime: "image/jpeg", bytes: new Uint8Array(readFileSync(join(here, "fixtures", c.image.file))) } : undefined,
      provider,
      timeoutMs,
      maxOutputTokens: 3000,
      hooks,
    });
    return { outcome, view: outcome.ok ? viewV1(outcome.report) : null };
  },
};

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
  const req: Request = JSON.parse(readFileSync(process.argv[2] ?? join(here, "run-request.json"), "utf8"));
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
        res = await engine!(c, provider, hooks, req.timeoutMs ?? 45000);
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
  const axesOf = (r: Record<string, unknown>) => { const v = viewV1Safe(r); return v ? [v.axes.cta, v.axes.offerClear, v.axes.readability, v.legibility] : []; };
  const agree = pairs.map(([a, b]) => { const x = axesOf(a!), y = axesOf(b); return x.filter((v, i) => v === y[i]).length / Math.max(1, x.length); });

  const summary = {
    engine: req.engine, model: req.model, split: req.split, note: req.note ?? null,
    jobs: jobs.length, completed: ok.length, failed: first.length - ok.length,
    failures: first.filter((r) => !r.ok).map((r) => `${r.id}:${r.reason}`),
    providerCalls: calls, callCapHit: calls >= req.maxCalls,
    repairRate: +(first.filter((r) => (r.repairs as string[]).length > 0).length / Math.max(1, first.length)).toFixed(3),
    repairReasons: first.flatMap((r) => r.repairs as string[]).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
    strippedReports: first.filter((r) => r.stripped).map((r) => r.id),
    latencyMs: { p50: pct(0.5), p90: pct(0.9), max: lat.at(-1) ?? null },
    tokens: { input: inTok, output: outTok },
    estCostUsd: price ? +((inTok * price[0] + outTok * price[1]) / 1e6).toFixed(4) : null,
    consistency: agree.length ? { pairs: agree.length, meanAgreement: +(agree.reduce((a, b) => a + b, 0) / agree.length).toFixed(3) } : null,
    quality: aggregate(scores),
    wallSeconds: Math.round((Date.now() - t0) / 1000),
  };
  console.log(`EVAL_SUMMARY ${JSON.stringify(summary)}`);
  mkdirSync(join(here, "out"), { recursive: true });
  writeFileSync(join(here, "out", `${req.engine}-${req.split}.json`), JSON.stringify({ summary, results }, null, 1));
}

function viewV1Safe(r: Record<string, unknown>): ReportView | null {
  try { return r.report ? viewV1(r.report as ProviderReport) : null; } catch { return null; }
}

main().catch((e) => { console.error(e); process.exit(1); });
