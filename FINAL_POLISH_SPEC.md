# Final Polish — Unified Spec: IQD Repair + Dashboard UX

> Two independent epics, one pass. **Part 1** is backend currency math; **Part 2**
> is strictly presentational frontend. They share no files, so parallel execution
> is safe. As with prior phases: this document is the spec; Corsair implements,
> I review diffs against the invariants. **EXISTS** = already in production (do
> not recreate); **GAP/HARDEN** = Corsair's actual scope.

---

# PART 1 — IQD Repair (Backend / Currency Logic)

## 1.1 Current-state map

| Concern | File | Symbol |
|---|---|---|
| Canonical factor resolver | `src/lib/currency.ts` | `currencyMinorFactorFor` (IQD→1, else 100), `resolveCurrencyMinorFactor`, `currencyFactorNeedsHeal` |
| Write-time scaling (the cordon) | `src/mappers/insightMapper.ts` | `mapMetaInsight` — `spendMinor`, `cpc`, `cpm`, `revenueMinor`, `roas` |
| Heal + rescale | `src/lib/iqdRepair.ts` | `healAccountCurrencyAndSpend`, `rescaleIqdSpendFromRaw`, `healLifetimeSpendMinor`, `campaignRowOverscaled` |
| Per-account heal hook | `src/workers/syncAccount.ts` | calls `healAccountCurrencyAndSpend` each sync |

## 1.2 The double-scaling model (how the bug class works)

Meta returns money in **major** units ("1200" IQD, "12.50" USD). The mapper
multiplies by `currencyMinorFactor` exactly once (`insightMapper.ts:61`):
`spendMinor = round(spendMajor × factor)`. The bug class = a row scaled with the
**wrong** factor (100 instead of 1 for IQD) → spend inflated ×100 ("12 IQD"
class symptom). Protection is already layered:

1. **Resolver never lets schema default win** (`currency.ts:26`): IQD always
   resolves to 1 even if the DB row still says 100.
2. **Heal-on-sync** (`iqdRepair.ts:240`): when stored factor disagrees with
   canonical, factor is corrected AND historical rows are rescaled from
   `raw_insights` (account) / heuristics (campaign) / pattern (lifetime).
3. **Idempotent rescale** uses `OVERSCALE_TOLERANCE` (0.02) so a correct row is
   never re-divided.

## 1.3 KEY FINDING — ROAS is already double-scale-safe (by construction)

ROAS is a **dimensionless ratio**, so the currency factor cancels. Verified in
`insightMapper.ts:91`:
```
computedRoas = revenueMinor / spendMinor
             = (revMajor × factor) / (spendMajor × factor)   // factor cancels
```
and `metaRoas` (`pickPurchaseRoas`) is Meta's own ratio — never scaled. **ROAS
cannot be over/under-scaled by a wrong factor.** Therefore:

- **No ROAS math fix is required.** The deliverable for ROAS is a **guard test**
  (HARDEN), not a code change: assert `mapMetaInsight` yields identical `roas`
  for the same row under `factor=1` and `factor=100`. This locks the invariant
  so a future refactor can't accidentally make ROAS factor-dependent.

## 1.4 GAP / HARDEN — the genuine residual risks

### G1 (HARDEN) — Campaign rescale is heuristic, not raw-backed
`rescaleIqdAccountRows` rescales **account** rows by comparing against
`raw_insights` (ground truth). But `rescaleIqdCampaignRows` has no raw backup and
relies on `campaignRowOverscaled()` heuristics (`iqdRepair.ts:55-66`): CPM
thresholds (`> 200_000`), `spend >= 10_000` when CPM null, etc. Risks:
- **False negative:** a genuinely high-CPM IQD campaign below threshold stays
  overscaled.
- **False positive:** a legitimately large-spend campaign gets divided by 100.

**Spec:** do NOT loosen thresholds blindly. Instead:
1. Prefer raw-backed truth where it exists — if `raw_insights` rows exist at
   `entityType=CAMPAIGN`, rescale those exactly like account rows (raw compare),
   and fall back to the heuristic ONLY for campaigns with no raw rows.
2. For the heuristic path, add a **two-signal confirmation** (both spend-magnitude
   AND cpm-ratio must agree) before dividing, to cut false positives.
3. Log every heuristic rescale with before/after to `console.info` for audit
   (no token/PII; safe).

### G2 (HARDEN) — Mapper trusts caller's factor blindly
`mapMetaInsight` applies whatever `opts.currencyMinorFactor` it's handed. INV-3
depends on every caller resolving via `resolveCurrencyMinorFactor`. **Spec:** add
a cheap assertion at the sync call site (NOT in the mapper — keep the cordon
pure) that the factor passed for an IQD account is 1, throwing/​logging if a
caller ever passes 100. Defense-in-depth against a future caller regression.

### G3 (verify-only) — `revenueMinor` rescale gated on `> 0`
`rescaleMonetaryFields` only rescales `revenueMinor` when `> 0`
(`iqdRepair.ts:45`). Correct (zero revenue needs no rescale), but confirm no row
has a legitimately overscaled revenue that reads as 0 after a prior bad pass.
Audit query only; likely no change.

### G4 (precision) — `Math.round` on minor units
For IQD (factor=1), `spendMinor = round(spendMajor)` drops fractional IQD. IQD has
no subunit, so this is correct, not lossy. **Confirm** Meta never returns
fractional IQD spend that matters; if it does, that's a product decision, not a
bug. No code change expected.

## 1.5 Part 1 invariants (review checklist)

| ID | Invariant |
|---|---|
| C-1 | Money scaled **exactly once**, at the mapper, by the resolved factor. |
| C-2 | IQD factor is **always 1**; schema default 100 must never win (resolver enforces). |
| C-3 | ROAS stays a pure ratio — factor-invariant; never multiply ROAS by a factor. |
| C-4 | Rescale is idempotent (tolerance-guarded); a correct row is never re-divided. |
| C-5 | No schema change — heal mutates data/values only, never columns or keys. |

## 1.6 Part 1 scope summary
- **No new currency math.** The double-scaling defense already exists and works.
- Corsair's real work: **G1** (raw-back campaign rescale + two-signal heuristic),
  **G2** (call-site factor assertion), **G3/G4** (audit only), and the **ROAS
  factor-invariance guard test** (§1.3).

---

# PART 2 — Dashboard UX (Frontend, strictly presentational)

> **HARD CONSTRAINT (non-negotiable):** every change below is presentational.
> NONE may touch: CMO Feed V2 data bindings (`cmoFeedV2`/`cmoFeedMeta`), the
> dedupe/window logic, or the `escHtml()` XSS hardening. No change may read or
> reshape DTO data, alter currency state, or remove an `escHtml` call. If a
> "UX win" requires touching data flow, it is OUT of scope for this epic.

## 2.1 Current-state map

| Surface | `dashboardPage.ts` | Note |
|---|---|---|
| Loading / reveal | `loading-state` → `dashboard-content` (init §17) | full-screen spinner→content swap |
| Currency format | `fmtCurrencyMinor` :477, `fmtCurrencyMajor` :482 | IQD `minorFractionDigits=0`, else 2 |
| Empty states | `init` no-workspace :1106, `dashData.empty` :1138, CMO feed empty :1006 | several distinct strings already |
| Hero cards | `renderHero` :563 | bound to DTO/insights — **do not touch bindings** |
| CMO Feed render | `renderBrainSection` :998 | **V2 bindings + escHtml — frozen** |

## 2.2 Quick-win UX changes (presentational only)

### U1 — Number grouping consistency (`fmtCurrencyMinor` :480)
`toLocaleString('en-US', …)` defaults to grouping ON → `1,234,567 IQD`. This is
*display-only* and safe to adjust. **Spec:** make grouping explicit and
intentional (`useGrouping: true` for readability) — but the **only** allowed edit
is the options object passed to `toLocaleString`. Do not change `state.minorFactor`,
the division, or the `currency` suffix. Confirm IQD (0 fraction digits) and
USD/EUR (2 digits) both still render correctly. This is a formatting nicety, not
a math change → cannot affect C-1..C-5.

### U2 — Empty-state visual hierarchy
Empty states exist but are plain. **Spec (markup/CSS only):** for the three
existing empty blocks (no-workspace :1109, `dashData.empty` :1141, CMO feed
:1006) standardize on the existing `.empty-state`/`.empty-icon`/`.empty-title`/
`.empty-text` pattern (already used at :1141). The CMO-feed empty string stays
exactly as-is text-wise; only wrap it in the shared empty-state classes for
visual consistency. **Must not** change the *condition* that selects empty vs
populated (that condition reads V2 data — frozen). Only restyle the branch that
already fires.

### U3 — Loading skeleton instead of blank spinner
**Spec (presentational):** replace the binary spinner→content swap with skeleton
placeholder blocks sized to the hero/KPI grid, removed on reveal (§17). Pure DOM
scaffolding shown before data arrives; it renders NO data, so it cannot touch
bindings or escaping. Skeletons must be torn down in the same place the spinner
hides today.

### U4 — Keyboard shortcuts (additive listeners, read-only)
**Spec:** add a `keydown` listener offering: `r` = re-run `init()` (refresh),
`/` = focus the existing search/filter input if present, `?` = toggle a shortcuts
help overlay. **Boundaries:** listeners are additive; they may call existing
functions (`init`) or toggle visibility, but must NOT mutate DTO data, re-render
feed items with new logic, or bypass `escHtml`. The help overlay is static markup
authored at build time (no user/DTO data interpolated → no escaping concern).
Guard against firing while focus is in an input/textarea.

### U5 — Spacing & visual hierarchy (CSS only)
**Spec:** confine to `extraHead` CSS — card padding, hero-value font-weight/size
hierarchy, section gaps, subtle hover elevation. **Zero** JS changes. Must not
alter any element `id` the JS queries (e.g. `hero-30-val`, `brain-cmo-feed`,
`loading-state`) — renaming/removing those breaks bindings. CSS class additions
and property tweaks only.

## 2.3 Explicitly OUT of scope (Part 2)
- Any read of `cmoFeedV2`, `cmoFeedMeta`, `dashData.*`, or currency state.
- Any change to `renderHero`, `renderBrainSection`, `buildTickerItems`,
  `hydrateCurrencyState` **logic** (CSS/markup on their output is fine only if it
  doesn't touch queried ids or bindings).
- Removing/relocating any `escHtml()` call.
- New API calls, new DTO fields, or dedupe/window changes.

## 2.4 Part 2 invariants (review checklist)

| ID | Invariant |
|---|---|
| U-1 | No edit reads or reshapes DTO data; all changes are markup/CSS/listeners. |
| U-2 | Every existing `escHtml()` call remains; no raw interpolation introduced. |
| U-3 | No element `id` queried by JS is renamed or removed. |
| U-4 | CMO Feed V2 bindings, dedupe, and window logic are byte-identical after the change. |
| U-5 | Keyboard listeners are additive, input-focus-guarded, and call only existing functions. |

---

# Parallel execution & review

- **Part 1** (Corsair-A): `src/lib/iqdRepair.ts` (+ a call-site assertion in
  `syncAccount.ts`) + a mapper guard test. Touches backend only.
- **Part 2** (Corsair-B): `src/web/pages/dashboardPage.ts` markup/CSS/listeners
  only. Touches frontend only.
- **No shared files** → no merge conflict; safe to run in parallel.

I will review each diff against its invariant table (C-1..C-5 / U-1..U-5) before
any commit. Two open confirmations before kickoff:
1. **G4** — does Meta ever return fractional IQD spend you care about? (decides
   if `Math.round` is final.)
2. **U1** — keep thousands grouping ON for IQD (`1,234,567 IQD`), or OFF
   (`1234567 IQD`)? Pure display preference — your call.
