# META_CAPABILITY_MATRIX

**Status: SKELETON — the "actually accessible" column is deliberately empty.**

This document has one rule. A capability is only recorded here once a real
token, on a real ad account, has been asked and has answered. Everything else
is a wish list.

Four different things get conflated when people say "what Meta gives us":

```
DOCUMENTED
   ⊇ SUPPORTED BY OUR API VERSION (v26.0, src/config.ts DEFAULT_META_API_VERSION)
      ⊇ ALLOWED BY OUR APP'S PERMISSIONS
         ⊇ ACTUALLY READABLE WITH THIS TOKEN, ON THIS ACCOUNT   ← the only one that counts
```

`src/services/metaCapabilityProbe.ts` answers the innermost question. It has
not been run: this sandbox has no Meta token and no egress to
`graph.facebook.com`, and inventing its output would defeat the point of
building it. **Running it against one real workspace is the first task of
Phase 2.**

---

## Part 1 — What Adlytic asks Meta for TODAY

Measured from source on the current commit, not from documentation.

| Surface | Method | What it requests | Level(s) |
|---|---|---|---|
| Insights, daily | `getInsights` | 17 fields, `time_increment=1`, optional `breakdowns` | account · campaign · adset · ad |
| Insights, intraday | `getTodayInsights` | same fields, `date_preset=today` | all four |
| Insights, lifetime | `getLifetimeTotalsForEntity` | 7 fields, `date_preset=maximum` | all four |
| Campaigns | `listCampaigns` | `id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time` | — |
| Ad sets | `listAdSets` | `+optimization_goal,destination_type,targeting,learning_stage_info{status}` | — |
| Ads | `listAds` | `+creative{id,name,thumbnail_url,image_hash,video_id,object_story_spec,asset_feed_spec,call_to_action_type,body,title}` | — |
| Account | `getAccountStatus` | `account_status,disable_reason` | — |
| Pixels | `listPixels`, `getDatasetQuality` | dataset quality | — |

`DEFAULT_INSIGHT_FIELDS` (metaClient.ts:43):
`date_start, date_stop, spend, impressions, reach, clicks, inline_link_clicks,
unique_clicks, ctr, unique_ctr, cpc, cpm, frequency, actions, action_values,
cost_per_action_type, cost_per_unique_action_type, purchase_roas`

`AD_RELEVANCE_FIELDS` — **live, not dead code.** `syncAccount.ts:1166` and
`:1261` spread `quality_ranking, engagement_rate_ranking,
conversion_rate_ranking` into ad-level requests. *(Checked because an earlier
reading of this file assumed they were unused. They are used.)*

Breakdowns in production: `['age','gender']` and
`['publisher_platform','platform_position']`, both from
`v2ContextAssembler.ts:307,313`.

---

## Part 2 — The gap that matters most

### Attribution context is never requested and never stored

Verified two ways:

```
$ grep -rc "action_attribution_windows|use_unified_attribution_setting" src/ --include=*.ts
(no matches)
```

and every `URLSearchParams` in `metaClient.ts` (lines 124, 155, 196, 208, 217,
232, 252, 269, 290) sets `level`, `time_increment`/`date_preset`, `fields`,
`time_range`, `limit`, and sometimes `breakdowns` — nothing else.

`DailyStat` (prisma/schema.prisma:405) stores 20 numeric columns and
`createdAt`. It carries **no** attribution window, **no** currency, **no**
timezone, **no** API version, **no** freshness or confidence. Every number is
stored as though it were context-free.

Consequences, stated plainly:

1. **Every conversion count is under whatever window that ad account happens to
   be set to** — and different clients are set differently. Two workspaces' CPAs
   are not comparable, and nothing in the system says so.
2. **A client changing their attribution window in Ads Manager silently rewrites
   the meaning of Adlytic's history.** The numbers move; Adlytic attributes the
   move to campaign performance, because it has no way to see the other cause.
3. **The hypothesis "this is a reporting change, not a performance change"
   cannot be tested at all.** That hypothesis is required by the brief's
   diagnostic engine (§15). Without attribution context it is not a weak
   hypothesis — it is an unaskable question.

`attribution_setting` is a **read-only report** of the applied window. Adding it
to the requested fields changes no existing number. That property is why it is
the first probe candidate and the first Phase-1 change: it is the only
measurement fix with zero blast radius.

The codebase already knows the field exists —
`src/adAssessor/data/meta-metrics.ts:173` lists it with an Arabic label — it is
simply never requested.

---

## Part 3 — Candidates, and why each is worth a call

Ordered by decision value. Full rationale in `PROBE_CANDIDATES`
(`src/services/metaCapabilityProbe.ts`).

| # | Candidate | Decides |
|---|---|---|
| 1 | `insights.attribution_setting` | whether stored conversions can be made comparable at all |
| 2 | `insights` + `action_breakdowns=action_type` | whether result composition can be reconstructed rather than inferred |
| 3 | `breakdowns: publisher_platform + platform_position + impression_device` | whether placement inefficiency separates from device inefficiency |
| 4 | `adset.attribution_spec`, `billing_event`, `bid_strategy` | whether a reporting change separates from a performance change; auction context |
| 5 | `adset.learning_stage_info` | whether a LEARNING regime would be observed or invented |
| 6 | `insights` ad-relevance at ad level | whether the fatigue signals are populated for this account or permanently null |
| 7 | `campaign.budget_remaining`, `bid_strategy` | "spend fell" vs "the budget ran out" — opposite diagnoses, opposite actions |
| 8 | hourly breakdown | whether intra-day pacing is measured or inferred |

### Verdict vocabulary

`AVAILABLE · PERMISSION_REQUIRED · OBJECT_REQUIRED · LEVEL_REQUIRED ·
BREAKDOWN_CONFLICT · ACCOUNT_NOT_ELIGIBLE · UNAVAILABLE · DEPRECATED ·
RATE_LIMITED · UNKNOWN`

Three rules the classifier enforces, each covered by a test that fails without
it (`test_meta_capability_probe.ts`, 35 assertions):

- **A rate limit is never recorded as UNAVAILABLE.** It says nothing about the
  capability; recording it as absence bakes a transient condition in as a
  permanent fact.
- **An unrecognised refusal stays UNKNOWN.** A row that says UNKNOWN makes a
  human look. A row that guesses gets believed.
- **"We could not test this" ≠ "Meta refused."** A candidate with no entity to
  probe against returns UNKNOWN and costs no call.

Two defects were found in the probe by its own test before it ever ran:
a node read at ad-set level was being addressed to the ad *account* (so a valid
ad-set field would have been filed as UNAVAILABLE), and `(#100) Requires
permission…` was being filed as UNAVAILABLE rather than PERMISSION_REQUIRED —
turning a fixable scope gap into an abandoned capability.

### The rows — every one NOT_TESTED, none guessed

Generated by hand for this gate; `scripts/run-capability-probe.ts` overwrites
this whole file with real verdicts the moment it runs.

| capability | dimension | level | field / breakdown under test | baseline (what it isolates against) | **token result** |
|---|---|---|---|---|---|
| `baseline.account.insights` | TOKEN_ACCESS | account | `spend,impressions` | — (this IS the floor) | **NOT_TESTED** |
| `baseline.campaign.insights` | ENTITY_LEVEL | campaign | `spend,impressions` | — | **NOT_TESTED** |
| `baseline.adset.node` | ENTITY_LEVEL | adset | `id,name` | — | **NOT_TESTED** |
| `baseline.ad.insights` | ENTITY_LEVEL | ad | `spend,impressions` | — | **NOT_TESTED** |
| `field.insights.attribution_setting` | FIELD | campaign | `attribution_setting` | same request without it | **NOT_TESTED** |
| `field.insights.ad_relevance` | FIELD | ad | 3 ranking fields | `impressions` alone | **NOT_TESTED** |
| `field.adset.attribution_spec` | FIELD | adset | `attribution_spec` | `id,name` | **NOT_TESTED** |
| `field.adset.auction_config` | FIELD | adset | `billing_event,bid_strategy` | `id,name` | **NOT_TESTED** |
| `field.adset.learning_stage_info` | FIELD | adset | `learning_stage_info` | `id,name` | **NOT_TESTED** |
| `field.campaign.budget_remaining` | FIELD | campaign | `budget_remaining` | `id,name` | **NOT_TESTED** |
| `breakdown.impression_device` | BREAKDOWN | campaign | + `impression_device` | the platform+position pair already in production | **NOT_TESTED** |
| `breakdown.hourly` | BREAKDOWN | campaign | hourly breakdown | no breakdown | **NOT_TESTED** |
| `config.action_breakdowns.action_type` | REPORTING_CONFIG | campaign | `action_breakdowns=action_type` | same request without it | **NOT_TESTED** |
| `config.unified_attribution` | REPORTING_CONFIG | campaign | `use_unified_attribution_setting` | same request without it | **NOT_TESTED** |

**NOT_TESTED is not a finding about Meta.** It records that the question was
never asked. The reason is documented in `META_CAPABILITY_PROBE_REPORT.md`:
this environment has no Meta credentials, no database from which to decrypt a
stored token, and the egress proxy refuses the CONNECT tunnel to
`graph.facebook.com` with a 403 — all three measured, not assumed.

### Tiering

Deliberately unassigned. Tiers are assigned **after** the token result, never
before: **S** strategic · **A** advanced · **B** diagnostic · **C** secondary ·
**D** not worth the complexity. A Tier-S idea this token cannot read is Tier D
in practice, so ranking now would be ranking a wish list.
