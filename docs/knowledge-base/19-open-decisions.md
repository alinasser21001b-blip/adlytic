# 19 — Open Decisions & Contradictions

## 1. [MAJOR CONTRADICTION] Two non-interoperating "Dawai" implementations, with at least one direct factual conflict

**The contradiction.** `docs/technical/01-system-architecture.html` (Blueprint v3 Phase 0, generated from `docs/technical/model.js`, internally validated 11/11) states as a hard "Must never" rule for `clinical-engine`: *"Perform any interaction check — Phase 0 has none (D16)"* and *"Ever return a clear result; in Phase 0 it returns only ALLOWED or REFUSED, never SAFE."* Meanwhile `dawai-platform/migrations/0005_interaction_safety.sql` through `0007_review_round2.sql`, plus `server/services/interactions.ts` and `server/routes/clinical.ts`'s `/interaction-check*` endpoints, **build and ship exactly the interaction-checking system Blueprint v3 says does not exist**, complete with a `CLEAR/INFO/INTERRUPT/UNAVAILABLE` outcome enum.

**Why this isn't a simple "one doc is stale" situation.** These are not sequential drafts of the same document — they are two structurally different codebases (`platform/` vs `dawai-platform/`) with different entity names, different auth mechanisms (phone+OTP vs email+password), different screen inventories, and different validated test suites. `docs/design/SCREEN_INVENTORY.md` is explicitly generated from `docs/product/v3/phase0.js` and reports only 22-of-133 v3 screens implemented — implying `platform/apps/patient` is the (partial) implementation target for v3, not `dawai-platform`. There is no source-control or product-brief evidence read in this pass that formally declares one track superseded by the other, beyond `docs/product/DAWAI_PRODUCT_BLUEPRINT.md`'s own header marking the *v1 product blueprint* (not the technical architecture) "SUPERSEDED by Blueprint v3."

**What we know for certain:**
- `dawai-platform` is tested, builds, passes its E2E suite, and is declared "Pilot MVP READY" as of 2026-07-31 (`docs/dawai/FINAL_MVP_READINESS.md`).
- Blueprint v3 / `platform/` is architecturally self-consistent and validated (`docs/technical/11-validation-report.html`, 11/11 checks) but has 111-of-133 screens **not implemented**, 11 named product gaps (BD-1…BD-11) blocking further screens, and no evidence in this repo of a running server implementing its 67-endpoint contract.
- `docs/dawai/BLUEPRINT_EXECUTION.md` (which documents the clinical-core migrations that add interaction safety) tracks progress against *"Dawai — Engineering-Ready Blueprint for a Smart Pharmacy Platform (Baghdad-First)"* — i.e. `PRODUCT_BLUEPRINT_AR.md`, not Blueprint v3. So `dawai-platform`'s clinical-core wave was never claiming Blueprint v3 conformance in the first place; the two simply describe different products that happen to share a name and a general problem space.

**This needs a human decision**, not an engineering fix: is `platform/` (a) the actual next-generation replacement for `dawai-platform` that should eventually retire it, (b) a design/architecture R&D exercise whose *patterns* (state-machine engine, navigation graph, design tokens) should be selectively backported into `dawai-platform` without adopting the v3 entity model wholesale, or (c) an abandoned exploration that should be archived? Until answered, **do not build new `dawai-platform` features against `docs/technical/*.html` or `docs/design/*` contracts** — they are not that product's spec.

## 2. Guardian vs. peer-consent authority model — real product gap, not just a naming difference

Blueprint v3 distinguishes **Guardianship** (unilateral authority over a dependent who cannot consent — e.g. a young child) from **PeerGrant** (mutual, requires the grantee's approval — the adult-child-for-elderly-parent case). `dawai-platform`'s `family_members` table only implements the mutual-consent model (`consent_granted_at` always required, from the member or a witnessing pharmacist). **If the pilot needs a parent managing a minor's medication without that minor's consent, the current schema has no clean way to express it** — every proxy link requires an acceptance step. Needs a product decision: is unilateral guardianship in scope for the pilot, and if so, does it get bolted onto `family_members` (e.g. an `age_of_subject`-gated auto-consent path) or does it wait?

## 3. Design system unification

Two independent token/CSS systems exist with no sharing (`12-design-system.md`). Open question: should `dawai-platform` migrate to consume `@dawai/design` tokens, should `platform/apps/patient` eventually replace `dawai-platform`'s patient UI, or should the two remain permanently separate (e.g. if `platform/` targets native and `dawai-platform` stays web-only)? No doc reviewed states an intended end state.

## 4. Gender-inclusive Arabic copy — flagged, not resolved

`docs/product/review/INDEPENDENT_REVIEW.md` finding #1 (survived adversarial verification, MAJOR severity) identifies that v1's Arabic copy is universally masculine second-person with no gender field in onboarding. The review proposes two concrete fixes (add an optional gender field + ship masculine/feminine string variants, or rewrite to gender-neutral nominal constructions) but does not choose between them, and no doc reviewed in this pass confirms either fix landed. Needs a product decision before further Arabic copy is written at scale in either codebase.

## 5. Multi-node outbox claiming strategy

Noted as PARTIAL in `FINAL_MVP_READINESS.md` — optimistic claiming is fine for one worker but not proven safe for N workers. Needs an explicit decision (e.g. adopt `SELECT ... FOR UPDATE SKIP LOCKED`) before horizontal scaling of `worker.ts`, not left implicit.

## 6. Whether `TimelinePages.tsx` fully implements the clinical timeline UI

Flagged as unverified in `18-technical-debt.md` item 7 — resolve by reading the file directly; not treated as either "done" or "missing" here to avoid asserting an unverified claim.

## 7. Admin file-decryption access — policy vs. code control

`FINAL_MVP_READINESS.md` notes admins can decrypt any prescription file by role, and calls this an "ops need procedure" item rather than a code defect. Open decision: should this instead become a code-level control (e.g. requiring a second-admin approval, or removing blanket decrypt access and requiring per-file audited elevation) before pilot scale increases, or is an operational procedure (logging + access review) sufficient? Not decided in any doc reviewed.

## 8. Blueprint v1 vs. PRODUCT_BLUEPRINT_AR.md vs. Blueprint v3 — which is "the" product blueprint going forward

Three documents each claim to define the product: `docs/product/DAWAI_PRODUCT_BLUEPRINT.md` (v1, self-declared superseded by v3 for product decisions, but still the source the independent review critiques and whose vocabulary `FINAL_MVP_READINESS.md` cross-references), `docs/dawai/PRODUCT_BLUEPRINT_AR.md` (Arabic, the blueprint `dawai-platform`'s README explicitly points to and `BLUEPRINT_EXECUTION.md` implements against), and `docs/product/v3/blueprint-v3.html` (v3, target of `platform/`). This knowledge base treats `PRODUCT_BLUEPRINT_AR.md` + `ARCHITECTURE.md` as authoritative for `dawai-platform` (since that's what the running code actually implements) and v3 as authoritative only for the `platform/` tree — but no single document in the repo states this reconciliation explicitly. Recommend a human write a one-paragraph canonical statement of which blueprint governs which codebase, and add it to `dawai-platform/README.md` and a `platform/README.md` (the latter does not appear to exist — see `20-next-priorities.md`).
