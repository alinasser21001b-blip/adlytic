# META_CAPABILITY_PROBE_REPORT

**Run status: NOT RUN. Zero Meta API calls were made.**

The probe is built, tested (56 assertions) and runnable. It could not be
executed from this environment, and no result in this document is invented.

---

## Why the run did not happen — measured, not asserted

Three independent blockers. Any one is sufficient.

| check | command | result |
|---|---|---|
| Meta credentials in env | `env \| grep -ciE "META_\|FB_\|FACEBOOK"` | **0** |
| stored token reachable | `$DATABASE_URL` | **unset** — no database, so no encrypted token to decrypt |
| network egress to Meta | `curl https://graph.facebook.com/v20.0/me` | **`CONNECT tunnel failed, response 403`** |

The egress proxy's `noProxy` list does not include `graph.facebook.com`, and
the tunnel is refused. This matches the standing note in the project's own
audit conventions: production and third-party hosts are not reachable from the
audit sandbox.

**What this means for every row below: `NOT_TESTED`, never `UNAVAILABLE`.**
That distinction is the point of the phase. Filling this report from Meta's
documentation would produce exactly the artefact the probe was built to
prevent — a wish list wearing the costume of evidence.

### The block is a policy, not a fault

`/root/.ccr/README.md` is explicit about a 403 from the egress proxy:

> The destination host is not allowed by your organization's egress policy for
> this session. **Do not retry or route around it — report the blocked host.**

Reported: **`graph.facebook.com`**. No workaround was attempted, and none
should be — routing around an egress policy to reach a live client's ad
account is exactly the wrong instinct for this codebase.

### To produce the real evidence

**Preferred — the token never touches a shell or its history.** On any host
that already runs the workers, `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` are
in the ambient environment:

```bash
WORKSPACE_ID=ws_…  npx tsx scripts/run-capability-probe.ts
```

It resolves that workspace's ad account, decrypts through the **same
resolve-and-decrypt path the sync workers use** (so it inherits the
system-user vs per-account distinction rather than reimplementing it), and
never prints the token.

Fallback, when no database is reachable:

```bash
META_ACCESS_TOKEN=…  META_AD_ACCOUNT_ID=act_…  npx tsx scripts/run-capability-probe.ts
```

Either way it discovers a campaign/ad set/ad, runs the baseline-first ladder,
and **overwrites both `META_CAPABILITY_MATRIX.md` and this file** with real
rows. Budget defaults to 40 calls and is enforced by the probe itself.

Send back the two files, or the commit. **Do not send the token.**

---

## What was built for this phase

### The ten-state vocabulary, with `NOT_TESTED` separated from `UNKNOWN`

`AVAILABLE · PERMISSION_REQUIRED · OBJECT_REQUIRED · LEVEL_REQUIRED ·
BREAKDOWN_CONFLICT · ACCOUNT_NOT_ELIGIBLE · UNAVAILABLE · DEPRECATED ·
RATE_LIMITED · NOT_TESTED · UNKNOWN`

Your brief separated these two and mine had conflated them. `NOT_TESTED` means
*we never asked* — no object, no budget, an earlier rate limit, or a failed
prerequisite. `UNKNOWN` means *we asked, Meta refused, and the refusal was not
recognised*. Recording an unasked question as an unrecognised refusal would
have quietly overstated how much of Meta's surface had been explored.

Four rules, each with a test that fails without it:

- a rate limit is **never** recorded as UNAVAILABLE
- an unrecognised refusal stays UNKNOWN, never a guess
- an untested candidate is NOT_TESTED, never UNAVAILABLE
- a wrong object level is attributed to the level, not to the field

### Dimension isolation — the change your brief forced

The first version tested three breakdowns in one request. A refusal there
teaches you that *some unidentified part* of the request was wrong. That is not
evidence.

Every candidate now isolates **one** of seven dimensions —
`API_VERSION · PERMISSION · TOKEN_ACCESS · ENTITY_LEVEL · FIELD · BREAKDOWN ·
REPORTING_CONFIG` — and declares a **baseline**: the identical request minus
the thing under test.

```
run baseline (same request, minus the one unknown)
   ├── fails   → the object / level / permission is at fault
   │             candidate = NOT_TESTED, baselineVerdict recorded,
   │             and the second call is not wasted
   └── passes  → any refusal now belongs to the isolated dimension
```

So `breakdown.impression_device` baselines on the
`publisher_platform + platform_position` pair Adlytic **already uses in
production**. A refusal names the third breakdown, not the trio.

### Evidence, not just status codes

For every candidate: the exact request path and params, HTTP status, Meta's
code and subcode, redacted message, which fields actually came back, how many
calls it cost, and how long it took.

The row that matters most: **`AVAILABLE` with `field returned: no`.** Meta
accepted the request and did not return the field — usually an account below a
reporting threshold. That is *not* a capability, and it is recorded as such
rather than rounded up.

### What is never persisted

Tokens are stripped from Meta's own error messages before anything is stored
(`redact()`), messages are truncated to 400 characters, and field values are
sampled **only when enum-shaped** — `7d_click`, `above_average`, `LEARNING`.
Those are semantics and are needed to read the capability. Anything longer or
free-form is withheld: a covering test asserts that an Arabic campaign name in
a response never reaches a stored row.

---

## A. What can the current token actually read?

**NOT_TESTED — no token was reachable.**

What is known from **source**, which is a different question and is labelled as
such: production successfully requests these today, so they were readable at
last sync for the accounts in production.

| surface | fields | evidence |
|---|---|---|
| insights, 4 levels | 17 `DEFAULT_INSIGHT_FIELDS` | `metaClient.ts:43` |
| insights, ad level | `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` | `syncAccount.ts:1166,1261` |
| insights breakdowns | `age,gender` and `publisher_platform,platform_position` | `v2ContextAssembler.ts:307,313` |
| ad sets | `optimization_goal`, `destination_type`, `targeting`, `learning_stage_info{status}` | `metaClient.ts:217` |
| ads | creative expansion incl. `asset_feed_spec`, `object_story_spec` | `metaClient.ts:232` |
| account | `account_status`, `disable_reason` | `metaClient.ts:252` |

This is *"the code sends these and production works"*, not *"the probe verified
these"*. Whether `quality_ranking` is **populated** rather than merely accepted
is precisely one of the open questions — it is candidate
`field.insights.ad_relevance`, and `present:false` there would be a finding.

## B. Legitimately requestable, but this token/account cannot read

**NOT_TESTED.** No PERMISSION_REQUIRED verdict can be claimed without a run.
This is the most actionable bucket when it fills: a PERMISSION_REQUIRED row is
a scope to request, not a capability to abandon.

## C. Documented but unverified

**All fourteen candidates.** In priority order:

| candidate | dimension | what it decides |
|---|---|---|
| `field.insights.attribution_setting` | FIELD | whether stored conversions can be made comparable at all |
| `field.adset.attribution_spec` | FIELD | whether a reporting change separates from a performance change |
| `config.action_breakdowns.action_type` | REPORTING_CONFIG | whether result composition is reconstructable |
| `field.campaign.budget_remaining` | FIELD | "spend fell" vs "the budget ran out" |
| `field.adset.auction_config` | FIELD | whether CPM movement is auction pressure or bid strategy |
| `field.insights.ad_relevance` | FIELD | whether the fatigue signals are populated or permanently null |
| `field.adset.learning_stage_info` | FIELD | whether a LEARNING regime is observed or invented |
| `breakdown.impression_device` | BREAKDOWN | whether placement separates from device |
| `breakdown.hourly` | BREAKDOWN | whether intra-day pacing is measured or inferred |
| `config.unified_attribution` | REPORTING_CONFIG | whether the option exists — **probed, never adopted** |
| 4 × `baseline.*` | TOKEN_ACCESS / ENTITY_LEVEL | that the objects are readable at all |

## D. Needing a different object level or query structure

Two are known from the API's own shape and are already encoded:

- **Ad-relevance rankings are ad-level only.** Production already respects
  this (`syncAccount.ts` adds them to ad-level requests only), and the
  candidate probes at `level: 'ad'`.
- **`attribution_spec` is an ad-set node field, not an insights field.** It is
  probed as `kind: 'node', level: 'adset'`.

That second one is not theory. The probe's **first draft addressed every node
read to the ad account**, so `attribution_spec` would have been asked of an ad
account, refused correctly, and recorded as UNAVAILABLE — a perfectly readable
ad-set field written off. Its own test caught it before it ever ran.

Anything else in this bucket requires the run.

## E. Materially changing the Measurement Kernel

One row governs this, and its answer is not yet known.

**If `field.insights.attribution_setting` returns AVAILABLE with the field
present**, then stored conversions can carry the window they were counted
under, Phase 1.3's migration has its justification, and comparability across
workspaces becomes achievable.

**If it does not**, the kernel design must change, because conversion
comparability cannot then be established from this API surface — and the honest
consequence is that CPA comparisons between workspaces must be withdrawn from
the product rather than shown with a caveat.

`config.unified_attribution` is probed to learn whether the parameter is
*accepted*. It is deliberately **not adopted**: switching it on changes the
conversion numbers already stored, and §32 forbids replacing a production
number without a discrepancy report first.

## F. Information unavailable through the current data model

The gap is established from source and does not depend on the probe:
`DailyStat` carries `entityType, entityId, date` + 20 numbers + `createdAt`,
and **no** attribution window, currency, timezone, API version or freshness.
See `METRIC_LINEAGE.md`.

Which *new* fields deserve storage is a separate question that this report
deliberately does not answer. Per your instruction: semantics, grain, temporal
meaning and compatibility come before any schema proposal. `budget_remaining`,
for instance, is a **point-in-time** value with no history — storing it in a
daily table would fabricate a daily series out of whatever moment the sync
happened to run. That is a data-model design decision, not a field list.

## G. Genuine strategic intelligence value

Not assigned. Tiers are assigned **after** the token result, never before: a
Tier-S idea this token cannot read is Tier D in practice. Assigning tiers now
would be ranking a wish list.

---

## Phase gate

Per your instruction, work stops here. Nothing in Phase 1.3 (migration) or
beyond has been started, and no production measurement behaviour was changed —
verified: `git diff` for this phase touches only the probe, its test, its
runner script, and these documents.

**The next decision needs one thing: someone with a token running one command.**
