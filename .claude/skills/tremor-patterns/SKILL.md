---
name: tremor-patterns
description: Port Tremor dashboard information-design patterns (BarList, Tracker, CategoryBar, ProgressCircle, SparkChart, Area/Bar/Donut charts) into analytics UIs. Use for KPI ranking, freshness strips, budget splits, health rings, and sparklines. Prefer pattern ports into Chart.js/vanilla HTML for Adlytic.
---

# Tremor Patterns (portable)

Component sources in `components/` from github.com/tremorlabs/tremor.

## High-value patterns for Adlytic

| Component | Pattern | Adlytic use |
|---|---|---|
| BarList | ranked horizontal bars | top campaigns by spend |
| Tracker | equal segments colored by state | 30-day sync freshness strip |
| CategoryBar | stacked % segments | budget active/paused split |
| ProgressCircle | SVG ring percent | campaign health in inspector |
| SparkChart | tiny axis-less sparkline | 7-day trend in campaigns table |
| AreaChart / BarChart / DonutChart | full charts | port interaction rules, keep Chart.js |

## Rules

1. Recessive grids, direct labels, one hue per series.
2. Right-align numerics; use tabular nums.
3. Do not import Tremor React into Adlytic — port the math/layout.
4. Cross-check with `UI_KIT_NOTES.md` and `taste-saas` dashboard refs.
