# 12 — Design System

**Important**: `docs/design/*` and `platform/packages/design` describe the **Blueprint v3 / `platform/` design system**, generated from `platform/packages/design/src/tokens/*` and consumed (so far) only by `platform/apps/patient`. `dawai-platform/src/styles.css` is hand-written CSS **not sourced from these tokens** — verify current values in `styles.css` directly before assuming a change to `platform/packages/design` affects the shipped app. It does not.

## Philosophy (`docs/design/DESIGN_TOKENS.md`, `docs/dawai/UI_KIT_ELEVATION_PROMPT.md`)

- **Tokens, not hex.** "A component names a role and receives a value; no component writes a hex." 15 semantic color roles per persona (`surface`, `surfaceRaised`, `surfaceSunken`, `line`, `ink`, `inkMuted`, `inkSubtle`, `accent`, `onAccent`, `success`/`onSuccess`, `warning`/`onWarning`, `alert`/`onAlert`). Three personas share the same 15 role names with different values: **patient** (documented, in scope), **pharmacy** (dense/dark/high-contrast, target emotion "fast" — out of scope for current handoff), **owner** (neutral/tabular, target emotion "certain" — out of scope).
- **Contrast is measured, not asserted.** Every color pair is computed with the WCAG relative-luminance formula on every build; a pair below the floor (4.5:1 body text, 3:1 large text/UI boundaries) fails the build. All 17 measured pairs listed in `DESIGN_TOKENS.md` currently pass.
- **`success`/`onSuccess`/`onWarning`/`onAlert` roles are never used directly in code ("never — see R-5")** — flagged explicitly in the token table; there's a rule R-5 elsewhere in the design docs restricting their use (worth reading `docs/design/README.md`/`COMPONENT_INVENTORY.md` for the full rule before using these tokens).
- **Typography barring by clinical sensitivity**: `display`, `poster`, `caption` roles are explicitly barred from carrying clinical content ("no — barred by type"); only `code`, `title`, `headline`, `body` may render clinical text. This is a content-safety rule expressed as a type-system rule.
- **Letter-spacing is always 0, unconditionally**, because Arabic is a connected script and tracking breaks glyph joins — not adjustable per component. `docs/dawai/BLUEPRINT_EXECUTION.md` records this being fixed from a prior violation (`-0.035em` on `h1`, `0.06em` on `.overline` → both set to `0`).

## RTL

`platform/packages/design/src/rtl.ts` (+ `rtl.test.ts`) is the RTL logic package: presumably logical-property mapping (start/end vs left/right), mirroring rules for icons/directional UI, and RTL-aware layout primitives. `arabic.ts` (+ `arabic.test.ts`) handles Arabic-specific text concerns — the readiness report references Arabic normalization for search (alef variants, taa marbuta, tatweel, harakat, Arabic-Indic digit folding; case folding is explicitly a no-op, not applied, since Arabic has no case) as a tested unit-level rule in the Blueprint v3 testing strategy.

`dawai-platform`'s actual RTL implementation lives directly in `src/styles.css` and JSX `dir="rtl"` usage — not audited line-by-line in this pass; if RTL bugs are reported in the shipped app, they are in `styles.css`, not in `@dawai/design`.

## Accessibility

`platform/packages/design/src/a11y.ts` (+ `a11y.test.ts`) — presumably contrast validation, focus management, `aria-live` region helpers. Concretely observed in the shipped app: `PillBar.tsx` uses `role="alert"`/`aria-live="assertive"` for `SEV_ALERT`, `status`/`polite` for everything else (`10-clinical-safety.md` §6). `docs/dawai/APP_STORE_READINESS.md` §8 notes VoiceOver-with-Arabic and Dynamic Type real-device passes are an **external, unverified step** — not yet confirmed working.

## Animation

`platform/packages/design/src/tokens/motion.ts` — motion tokens. Confirmed concrete rule: the Pill Bar morphs over 380ms and **must cross-fade instead of morph under `prefers-reduced-motion`** — this reduced-motion fallback is implemented in the shipped `PillBar.tsx`, independent of the token package.

## Loading / empty / error / offline UX contract

`docs/design/SCREEN_INVENTORY.md` mandates, per screen, a **required-states table**: `loading` (skeleton shape matching real content), `empty` (an explanation plus, for a "teaching" variant, exactly one action — and a distinct "quiet/success" empty state that deliberately shows *no* action when there's genuinely nothing to do), `offline` (must state whether content is read-only and how stale it is), `error` (must state what failed, whether the user's in-progress work survived, and offer exactly one recovery action). This "five-state contract" (`platform/packages/design/src/ux/contract.ts`, `ux/contract.test.ts`) is enforced by `platform/tools/ux-check.mjs` against any screen claiming a contract. `dawai-platform`'s pages were not confirmed to follow this exact five-state discipline in this pass — treat it as the target standard for new screens in either codebase, since it's a sound UX practice independent of which product track it originated in.

## Component inventory

`docs/design/COMPONENT_INVENTORY.md` (505 lines, not fully read in this pass) catalogues the v3 component library. `docs/dawai/UI_KIT_ELEVATION_PROMPT.md` and `docs/dawai/UI_REVIEW_AND_DEVELOPMENT_GUIDE.md` (2192 lines) are extensive UI critique/guidance documents for the shipped `dawai-platform` UI specifically — these are the right starting point for elevating `dawai-platform`'s actual component quality, as distinct from `COMPONENT_INVENTORY.md` which documents the separate v3 component set.

## Practical guidance

- Changing a token in `platform/packages/design/src/tokens/*` affects only `platform/apps/patient` (and any future app built on that stack) — it has zero effect on `dawai-platform/src/styles.css`.
- If asked to "make Dawai's design consistent," first determine which of the two UIs is meant — they currently have independent, non-shared token systems. Unifying them is an open decision (`19-open-decisions.md`), not a mechanical task.
