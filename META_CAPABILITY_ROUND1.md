# META CAPABILITY — ROUND 1 EVIDENCE (2026-08-19)

The first real probe run against a live authorised workspace. Frozen here as
observed evidence, not summarised into a conclusion.

**Read this file as a record of one run**, not a statement about Meta. Every
verdict is conditional on: that account, that token, that day, `v20.0`, and an
app in **development mode** — a constraint that can itself suppress fields.

---

## PROVEN_USABLE — accepted **and the field came back**

| capability | what it unblocks |
|---|---|
| `baseline.account.insights` | account-level reporting; the ladder's floor holds |
| `field.insights.attribution_setting` | **measurement context per row** |
| `field.campaign.budget_remaining` | budget-exhaustion as a *falsifiable* delivery hypothesis |
| `config.unified_attribution` | unified attribution config is readable |

`attribution_setting` is the significant one. Before this run it was **not
requested anywhere in production** and every capability claim about it was
untested, which is why measurement-aware reasoning was recorded as blocked.
That block is now lifted — by evidence, not by decision.

## ACCEPTED_BUT_UNPOPULATED — Meta accepted the request and returned nothing

| capability |
|---|
| `baseline.campaign.insights` |
| `breakdown.impression_device` |
| `breakdown.hourly` |
| `config.action_breakdowns.action_type` |

**These are NOT available capabilities, and they are NOT unavailable ones.**
The request was legal; the data was absent. The most likely cause is the probe
window itself — a single day, two days back, on one entity — but *likely* is
not *known*, and this run cannot separate:

```text
the account genuinely has no data for that dimension
the entity had no delivery in that one-day window
the breakdown needs delivery volume Meta will not report below a threshold
the app's development mode suppresses it
```

Collapsing these into `AVAILABLE` would manufacture a capability. Collapsing
them into `UNAVAILABLE` would abandon a real one. They stay in their own class.

## NOT_TESTED — we never asked

| capability | why |
|---|---|
| `baseline.adset.node` | discovery found no adset |
| `baseline.ad.insights` | discovery found no ad |
| `field.insights.ad_relevance` | needs an ad |
| `field.adset.attribution_spec` | needs an adset |
| `field.adset.auction_config` | needs an adset |
| `field.adset.learning_stage_info` | needs an adset |

**This is a finding about our probe, not about Meta.** The strict discovery
chain `campaign → adsets → ads` stopped at the first campaign, and if that
campaign held no adsets the chain truncated — taking six candidates with it.

> **AMENDED after the second run.** This section originally closed by saying
> the runner had been fixed with an account-level fallback. That was true of
> the repository and false of production: the second run reported the same 16
> calls, which `test_probe_discovery.ts` proves is the strict chain's
> signature and unreachable by the fallback build. The fallback was pushed and
> never deployed, and has since been replaced by unconditional account-level
> discovery with a recorded trace.
>
> The paragraph is left visible rather than deleted, because "the code is
> fixed" and "the fix is running" being written as the same sentence is the
> defect this whole investigation is about. See
> `META_PROBE_DISCOVERY_FORENSICS.md`.

---

## What this run does NOT establish

```text
✗ that any PROVEN_USABLE field is POPULATED across entities or time
    one row on one day is not a distribution
✗ that any field VARIES enough to carry signal
    a constant is available and useless in equal measure
✗ that any of it is DISCRIMINATIVE between competing explanations
✗ that development mode did not suppress the unpopulated four
✗ anything about the other ~14 client accounts
```

The ladder from the session's earlier work stands unchanged and only its
first rung has been climbed:

```text
AVAILABLE  →  POPULATED  →  VARIABLE  →  DISCRIMINATIVE  →  DECISION-USEFUL
    ✓            ?             ?              ?                  ?
```
