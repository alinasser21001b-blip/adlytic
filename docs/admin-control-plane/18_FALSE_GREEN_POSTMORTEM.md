# 18 — Why the visual gate passed a page that was broken

```
OLD_VISUAL_GATE_RESULT = INVALIDATED_BY_LIVE_SCREENSHOT
```

A production screenshot of `/admin/meta` showed raw serialized JSON, unexplained
technical field names, and a page whose content stopped in the top third. The
browser acceptance harness had reported **zero findings** on that same page.

This is what went wrong, in the order it mattered.

## 1. The page had no opinion about its own content

```js
Object.keys(payload).slice(0, 12).map(k => {
  let v = payload[k];
  if (v && typeof v === 'object') v = JSON.stringify(v);   // ← the defect
  return `<dt>${k}</dt><dd>${v}</dd>`;
});
```

That is a key-dumper, not a UI. It renders whatever the API returns, labelled
with whatever the API calls it.

**This is the root cause, and it is not a data problem.** A page with no fixed
content cannot be verified, because there is nothing to assert. Any payload
change silently becomes the interface. No fixture, however accurate, catches a
regression in a component that has already agreed to display anything.

Everything below made it worse. This made it undetectable.

## 2. The fixture was written from memory

The harness served `{ callCount: 1284, appUsage: { call_count: 12, total_time: 5 } }`.

Neither field exists on `MetaUsageStats`. The real payload is:

```
redisAvailable, callThreshold, errorRateGatePct,
counts             { 12 fields }
errorBreakdown15d  { 6 fields }
latest             { 4 fields }
```

Three nested objects, where the fixture had one small one. `JSON.stringify` of
the fixture produced a short unremarkable string; of the real payload, three
blobs long enough to burst their container.

**Fixed structurally.** Fixtures are TypeScript now and import the service's own
return types. A shape change is a compile error — the only drift protection
that does not depend on someone remembering.

## 3. The audit measured structure, never comprehension

It checked overflow, unresolved skeletons, status-chip treatment, sparse cards
and label legibility. Not one assertion asked whether a human could read the
result. "Is this raw JSON" was never a question it knew how to pose.

**Six composition checks added**: raw JSON outside a disclosure, content
occupancy, truncated primary labels, legacy shell leakage, meters that render
nothing, and card-vs-content alignment.

## 4. The overflow check measured the wrong box

It compared element rectangles against the **viewport**. The JSON strings burst
out of their card and into the page margin while staying on screen, so nothing
fired.

**Fixed**: card edges are now compared against their own children. That check
immediately found a second, older defect — every table in every card sat 13px
outside it, because the card-padding CSS used `:not()` selectors whose
specificity beat the table rule.

## 5. Scenarios described states the services cannot produce

`partial_data` hand-wrote `attention: []` beside a blocked workspace. The
Control Center therefore rendered *"nothing needs intervention"* directly above
a failed account — a contradiction no real snapshot contains, because
`adminOpsHealth` pushes an ERROR item for every blocked connection.

**Fixed**: fixtures derive attention from the workspaces they describe, and a
test refuses any scenario whose attention queue contradicts its own rows.

## The pattern

Four of the five are the same mistake wearing different clothes: **the
verification described the system instead of deriving from it.** A remembered
payload shape, a hand-written attention list, a hand-kept selector list for the
occupancy metric, a viewport substituted for a container.

Two more instances surfaced during this pass and were fixed the same way: the
occupancy metric measured a selector list that omitted the graph container and
reported the page 20% full; and the legibility metric divided by width when
`preserveAspectRatio: meet` scales to whichever axis constrains, reporting 23px
for labels rendering at 4px.

## What did not change

The architecture. One Control Plane, six domains, the capability registry, the
parity gate, the Graphify adapter, all three graph modes, the read-only
contract and the authorization boundary are untouched. This was a rendering
and verification failure, not a structural one.

## The gate that actually caught it

A human looking at a screenshot. That is now a required step —
`docs/admin-control-plane/19_SCREENSHOT_GATE.md` — and it caught four more
defects on its first run after the automated audit was already clean: dead
meters, misaligned cards, the self-contradiction, and inconsistent page
anatomy.

**Automated checks find what you already thought to ask. Looking finds the
rest.**
