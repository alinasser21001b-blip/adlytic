# 02 — Period metric semantics

## Classification

| Metric | Class | Source | Period rule |
|---|---|---|---|
| spend | ADDITIVE | `DailyStat.spend` | Σ daily |
| impressions | ADDITIVE | `DailyStat.impressions` | Σ daily |
| clicks (all) | ADDITIVE | `DailyStat.clicks` | Σ daily |
| link clicks | ADDITIVE | `DailyStat.linkClicks` | Σ daily |
| landing page views | ADDITIVE | `DailyStat.landingPageViews` | Σ daily |
| messages / leads / purchases | ADDITIVE | `DailyStat.*` | Σ daily |
| primary result count | ADDITIVE | `resultSemantics` | Σ of the canonical column |
| CTR — all clicks | RATIO_DERIVABLE | `DailyStat.ctr` | impression-weighted |
| Link CTR | RATIO_DERIVABLE | link clicks ÷ impressions | ratio of sums |
| CPC | RATIO_DERIVABLE | `DailyStat.cpc` | impression-weighted |
| CPM | RATIO_DERIVABLE | `DailyStat.cpm` | impression-weighted |
| cost per result | RATIO_DERIVABLE | spend ÷ results | ratio of sums |
| ROAS | RATIO_DERIVABLE | revenue ÷ spend | ratio of window sums |
| **reach** | **META_PERIOD_VALUE_REQUIRED** | `PeriodInsight.reach` | Meta's own, or UNKNOWN |
| **frequency** | **META_PERIOD_VALUE_REQUIRED** | `PeriodInsight.frequency` | Meta's own, or UNKNOWN |

```
PERIOD_METRIC_DEFECTS = 2 (reach, frequency) — both fixed
REACH_STATUS      = META_PERIOD_VALUE_REQUIRED — Meta's value or UNKNOWN
FREQUENCY_STATUS  = META_PERIOD_VALUE_REQUIRED — Meta's value or UNKNOWN
CTR_STATUS        = CORRECT (impression-weighted, labelled "CTR — all clicks")
LINK_CTR_STATUS   = CORRECT (derived in the canonical window context, labelled derived)
CPM_STATUS        = CORRECT (impression-weighted)
CPC_STATUS        = CORRECT (impression-weighted)
```

## Reach

Not additive, and not reconstructible either. Meta de-duplicates people inside
a requested `time_range` and never publishes the cross-day overlap, so from
daily rows the period value is genuinely unknowable: `max(daily)` is a lower
bound, `sum(daily)` an upper one, and the truth sits between with no way to
locate it.

## Frequency — the damaging one

`favg()` took the flat arithmetic mean of the daily frequencies, four lines
below a comment reading *"ratios are never averaged flat"* and against
`metricDictionary`'s own declared `ratio_of_sums`.

It feeds **absolute** thresholds — `FREQUENCY_WATCH` 3.0, `FREQUENCY_SATURATED`
4.0 — where no current-vs-prior comparison exists to cancel an estimator's
bias. A person reached on five days counts once in period reach but washes out
of a daily mean, so the mean sat below the truth and **audience fatigue was
under-detected by construction**.

## The internal estimator was also unsafe — disproved, not argued

The funnel briefly kept `max(daily reach)` as an internal denominator for
*change* detection, on the reasoning that both windows use the same estimator
so the bias cancels. **That reasoning is wrong**, because cross-day overlap
differs between windows.

Hold impressions and daily reach identical in both windows and vary only who
those people are:

| | prior | current | change |
|---|---|---|---|
| true period reach | 70,000 (fresh audience daily) | 10,000 (same people daily) | |
| **true reach ÷ impressions** | 1.000 | 0.143 | **−85.7%** |
| **max(daily) estimate** | 0.143 | 0.143 | **0%** |

The estimator does not understate the break — it **erases** it. The mirror case
hides a +600% rise just as completely.

`FUNNEL_REACH_ESTIMATOR = REMOVED`
`ESTIMATOR_CAN_DISTORT_WINDOW_CHANGE = YES (proven)`
`ESTIMATOR_FINAL_DISPOSITION = REMOVED, not annotated`
`REACH_TRUTH_BLOCKER_CLOSED = YES`

## The degradation is bounded

Reach is stage 1 of every funnel shape, so a naive UNKNOWN would have disabled
diagnosis for every campaign. Two narrow changes prevent that:

- `computeFunnel` distinguishes "this stage's COUNT is unknown" from "this
  stage's RATIO could not be formed". When only the denominator was unknown,
  the stage is `UNAVAILABLE(UNKNOWN)` but its own measured count still serves
  the next stage, so the chain resumes.
- `diagnoseFunnel` accepts a denominator from an `UNAVAILABLE` stage when the
  reason is `UNKNOWN`, and still refuses one when the reason is
  `INSUFFICIENT_DATA` — that gap is a sample-size signal and must keep
  propagating. Scoped this way, **no existing diagnosis can change.**

With period reach unknown: `reach ÷ impressions` and `link clicks ÷ reach` are
UNAVAILABLE, while `conversations ÷ link clicks` — which never depended on
reach — is still judged and still reaches POST_CLICK at HIGH confidence.

No confidence cap was invented: with the estimator gone, no diagnosis depends
on it. Fatigue thresholds untouched.

## Frequency is deliberately not derived

Meta's definition is believed to be period impressions ÷ period reach, and both
are stored in the same row from the same request. It is still **not** derived,
because proving the two coincide needs Meta's documentation, which cannot be
read from this environment. Both inputs are stored so a later audit can close
it. Until then an unproven derivation is the class of invention this work
exists to stop.
