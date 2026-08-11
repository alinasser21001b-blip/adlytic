# GATE 1 — Capability evidence, locked

**Baseline: `ec69edc`.** Nothing past this line moves until a real probe run
exists.

## Frozen until real capability data lands

- no schema migration
- no Meta field expansion
- no attribution migration
- no forecasting
- no diagnosis engine
- no scenario engine

## The three disciplines this gate establishes

These are properties of **Adlytic**, not of the probe. Anything built later
inherits them or does not ship.

### 1. Evidence discipline

```
NOT_TESTED  ≠  UNKNOWN  ≠  UNAVAILABLE
we never       we asked and     Meta says
asked          did not          it does not
               understand       exist
               the refusal
```

Collapsing these is how a system starts lying about how much it knows. A rate
limit is not an absence. An unasked question is not a refusal.

### 2. Security discipline

Token resolution goes through the path that already exists
(`resolveAccountToken` → `decryptToken`), never a reimplementation. Decrypt
failures stay loud: a key mismatch and an expired token are different
incidents with different fixes.

Verified read-only, mechanically: `POST|PUT|PATCH|DELETE` and
`prisma.*.create|update|delete|upsert` both return **0** across
`scripts/run-capability-probe.ts` and `src/services/metaCapabilityProbe.ts`.

### 3. Measurement discipline

A capability claim exists only after a real request returned the field. Not
after the documentation says so. Not after the request succeeded — after the
**field arrived**.

## The rule the Brain inherits

```
no evidence              → no claim
weak evidence            → weak confidence
conflicting evidence     → show the conflict, do not average it away
missing context          → lower confidence
no identifiable          → hypothesis, not fact
  causal path
```

## One correction to carry forward

The proposed `Observation` struct listed `confidence` as a field.

**`confidence` does not belong on an observation.** An observation is what
Meta said. Confidence is a property of an *inference about* observations. Put
it on the raw record and an intelligence output has been given the costume of
a measurement — the exact category error the architecture exists to prevent,
and the one already guarded by `test_analytics_architecture.ts`.

What an observation legitimately carries is the raw material confidence is
later *computed from*:

```
Observation
├── value, metric, entity
├── time range · timezone            ← which calendar this belongs to
├── attribution context              ← THE gap; see METRIC_LINEAGE.md
├── currency · minor factor          ← as-of-write, not re-derived downstream
├── API version · source
├── breakdown · filters
├── retrieved_at · completeness      ← facts about the retrieval
└── (confidence lives one layer up)
```

Everything above `completeness` is a fact Meta or the request supplied.
Confidence is derived at the signal layer, from freshness, completeness,
sample size and context agreement — and it must stay derivable, so that
changing how confidence is computed never rewrites history.

## The environmental constraint, measured

`graph.facebook.com` → `CONNECT tunnel failed, response 403`. Organization
egress policy. Reported, not worked around; `/root/.ccr/README.md` says
plainly not to route around it. **This is not an Adlytic problem and must not
be solved inside Adlytic.**

## To open Gate 2

Run, on a host permitted to reach Meta:

```bash
WORKSPACE_ID=ws_…  npx tsx scripts/run-capability-probe.ts
```

It overwrites `META_CAPABILITY_MATRIX.md` and `META_CAPABILITY_PROBE_REPORT.md`
with real rows. Return the files or the commit — **never the token**.

Then the first question is not "what do we add?" but **"what changed in our
model of a campaign because of what we found?"**
