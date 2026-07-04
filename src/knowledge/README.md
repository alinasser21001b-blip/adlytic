# Meta Ads Knowledge Base (`src/knowledge/`)

Drop-in metric thresholds and optimization actions for the AI insight pipeline. When a file is present, **AdlyticIntelligenceSystem** and **getDashboard** query it **before** legacy hardcoded recommendations.

## Quick start

1. Copy the sample to the live filename:

   ```bash
   cp src/knowledge/metaAdsKnowledgeBase.sample.json src/knowledge/metaAdsKnowledgeBase.json
   ```

   Or export from TypeScript:

   ```ts
   // src/knowledge/metaAdsKnowledgeBase.ts
   import type { MetaAdsKnowledgeBase } from "./types";

   export const metaAdsKnowledgeBase: MetaAdsKnowledgeBase = {
     version: "1.0.0",
     platform: "meta_ads",
     metrics: [ /* … */ ],
   };
   ```

2. Restart the server (KB is cached once per process).

3. Run tests: `npm run test:knowledge-base`
4. Run benchmark intelligence test: `npm run test:knowledge-benchmarks`
5. Run industry routing test: `npm run test:industry-routing`

## File priority

| Priority | File | Notes |
|----------|------|-------|
| 1 | `metaAdsKnowledgeBase.ts` | Compiled with the app; export `metaAdsKnowledgeBase` |
| 2 | `metaAdsKnowledgeBase.json` | Pure JSON drop-in — no rebuild needed in dev (`tsx`) |
| 3 | *(none)* | Empty KB — legacy rules unchanged |

## Metric keys

Use keys that match live campaign metrics passed to `evaluateCampaign()`:

| Key | Typical source |
|-----|----------------|
| `ctr` | Window CTR (%) |
| `cpm` | Window CPM (major currency) |
| `frequency` | Daily average frequency |
| `cost_per_message` | spend / messages |

Add new keys freely — each `metrics[]` row is evaluated independently.

## Threshold semantics

- **`direction: "below"`** — lower is worse (e.g. CTR).  
  `critical` when `value <= critical_threshold`; `warning` when `value <= warning_threshold`.
- **`direction: "above"`** — higher is worse (e.g. frequency).  
  `critical` when `value >= critical_threshold`; `warning` when `value >= warning_threshold`.

`recommended_optimization_actions.warning` / `.critical` are returned **verbatim** on breach — never rewritten by the engine.

## Schema reference

See `metaAdsKnowledgeBase.schema.json` and `metaAdsKnowledgeBase.sample.json` for the full shape Claude should follow.

## Public API

```ts
import {
  getKnowledgeBase,
  evaluateMetric,
  evaluateCampaign,
  findActionsForBreaches,
  metaKnowledgeInsightEngine,
} from "./knowledge";
```

## Integration points

- **`MetaKnowledgeInsightEngine`** — KB-first recommendations for V5 intelligence
- **`RecommendationEngine`** — attaches KB actions to `detailsJson` when thresholds breach
- **`getDashboard`** — merges KB action text into `issues[].recommendations` and `priorityAction`
- **`benchmarkIntelligence.ts`** — compares live metrics against global + industry ranges and emits source-backed inference strings
- **`industryRouting.ts`** — resolves the benchmark industry key from workspace → ad account → global without manual params at call sites

## Industry-aware benchmark routing

Benchmark comparisons use `benchmarks_by_industry.json`. The industry key is resolved automatically:

1. **Workspace** — `workspace.industryProfile` (`name` or `knowledgeJson.benchmarkIndustryKey`)
2. **Ad account** — same profile via `adAccount.workspace` when only `adAccountId` is available (engines)
3. **Global** — `global_averages` when no profile is set

```ts
import {
  resolveBenchmarkIndustry,
  resolveBenchmarkIndustryFromContext,
  toBenchmarkEvaluationOptions,
  evaluateBenchmarks,
} from "./knowledge";

// Async (engines with adAccountId)
const resolved = await resolveBenchmarkIndustry(prisma, { adAccountId });
const insights = evaluateBenchmarks(metrics, toBenchmarkEvaluationOptions(resolved));

// Sync (getDashboard — workspace already loaded)
const resolved = resolveBenchmarkIndustryFromContext({ workspace: ws });
```

Profile name aliases (e.g. `furniture` → `homewares_furniture_interiors`, `cosmetics` → `beauty_cosmetics`) live in `industryRouting.ts`. Override any mapping with `industryProfile.knowledgeJson.benchmarkIndustryKey`.
