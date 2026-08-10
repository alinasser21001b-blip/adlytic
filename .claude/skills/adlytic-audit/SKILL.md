---
name: adlytic-audit
description: Conventions, invariants and defect patterns for auditing or repairing the Adlytic codebase. Load before changing analytics semantics, page rendering, auth routes, or token crypto.
---

# Adlytic — audit & repair conventions

Written during the audit that produced `AUDIT-REPORT.md`. It records what the
codebase actually is, the invariants that must survive a change, and the
defect shapes that have recurred — so the next session recognises them in
minutes instead of finding them again.

## Stack, as built

- **TypeScript, strict: true**, `tsc --noEmit` currently clean.
- **Hono** on Node. One file — `src/api/server.ts` — registers **132 routes**
  (109 under `/api`, 23 HTML pages).
- **Prisma 7 + PostgreSQL**, **BullMQ + Redis** for sync workers, **Railway**
  for deploy, **Stripe** for billing, **Anthropic + OpenAI** for the agent.
- **No React and no bundler.** Pages are server-rendered HTML built from
  TypeScript template literals; browser JS lives *inside* those literals.
  (The brief for this audit assumed React Native and `*.tsx`; there are none.)
- Tests are **56 standalone `tsx` / `node` scripts** at the repo root, run by
  name. There is no jest/vitest and therefore **no coverage number** — see
  "Measuring" below for what to report instead.

## Invariants — breaking one of these is a defect, not a style choice

### Analytics semantics
- `insightMapper.ts` is the **only** place Meta field names may appear. Every
  other module speaks the domain vocabulary. This is the cordon.
- `campaignObjective` ≠ `optimizationGoal` ≠ `destinationType` ≠
  `purposeFamily` ≠ `resultKey` ≠ `businessOutcome` ≠ `unit`. Never collapse
  two of them.
- **Results are never summed across units.** 84 conversations + 12 orders is
  not 96 of anything. `MixedResultTotal` deliberately has no total field.
- The frontend renders the DTO. It does not compute ratios, choose a purpose,
  pick a funnel stage, or substitute one objective's counter for another's.
- Never invent a currency or a minor-unit scale. If the account currency is
  unknown, render `—`. (A guessed `USD` / `×100` once printed 40,000 IQD as
  "USD 400.00".)
- Never manufacture a historical value or silently rewrite one.

Enforced by `test_analytics_architecture.ts` (27 assertions),
`test_result_semantics.ts`, `test_attribution_semantics.ts`,
`test_health_single_source.ts`.

### Authorisation
- **`app.use('/api/*')` is an ACTIVE-USER gate, not an auth gate.** Every
  failure path calls `next()` — no header, bad token, revoked token all reach
  the handler. Authentication is enforced **per route**, by hand.
- Each handler resolves its caller with `getUserId()` or
  `requirePlatformAdmin()`; each workspace-scoped handler proves membership
  with `checkMember(userId, workspaceId)`.
- Enforced by `test_route_authz.ts`. Add a route → add its check, or the
  build fails. A genuinely public route goes in `PUBLIC_BY_DESIGN` **with a
  reason**, and if it takes a signed payload it must verify the signature.

### Token crypto
- AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY` (64 hex). Missing key is fatal
  at boot in production, plaintext in dev.
- A decrypt failure throws `TokenDecryptError` and must **never** be
  softened into a Meta 190 — key mismatch and token expiry are different
  incidents with different fixes.
- **There is no `key_version` column.** Until there is, a key change is
  unrecoverable and its blast radius can only be measured by attempting every
  decryption (`scripts/count-undecryptable-tokens.ts`).

### Meta API
- Read-only against live ad accounts, always. No budget writes, no state
  changes — in code and in testing.
- Call volume and error rate are tracked in `src/services/metaUsageTracker.ts`
  against the 500-call / 15%-error policy. Do not add a call path that
  bypasses it.

### Arabic / RTL
- `<html lang="ar" dir="rtl">`, locale defaults to AR, every customer is an
  Iraqi SMB owner.
- **The server-rendered default must be Arabic.** Shipping English markup and
  swapping it in JS means the product is Arabic only while its JavaScript is
  working — which excludes first paint and every error path. Enforced by
  `test_no_english_in_ar_pages.mjs`.
- Dates use `toLocaleDateString('ar-u-nu-latn')` — Arabic month names, Latin
  numerals — because metrics are Latin and one screen must not mix numeral
  systems. Enforced by `test_page_scripts.mjs`.
- `lang="en"` operator consoles (`/admin/observability`,
  `/admin/meta-readiness`) are English on purpose and out of scope.

### Design system
- Tokens live once, in `layout.ts`'s `:root`. A page may link `TOKENS_CSS`;
  no page may redeclare a token. (Five pages once carried private dark-theme
  copies and stayed black for months after the product went light.)
- `--border` is a separator; `--border-control` is the boundary of an
  interactive control and must clear 3:1 on all three surfaces.
- Contrast is measured against **every** surface a colour can sit on, not
  just `--bg`.
- All four rules enforced by `test_page_scripts.mjs`.

## Defect patterns that have recurred here

1. **Backticks and `${...}` inside a TS template literal.** The browser JS is
   an opaque string to `tsc`; a stray backtick compiles fine and takes the
   whole page down at runtime. This has happened seven times. Run
   `test_page_scripts.mjs` before every commit that touches a page file.
2. **CSS-variable values in places that cannot resolve them.**
   `<meta content="var(--bg)">` never worked in any browser; `manifest.json`
   is JSON and holds a literal. Inline-SVG `stroke="var(--x)"` *does* resolve
   — verify before reporting.
3. **Duplicate element ids.** `url(#id)` and `getElementById` both bind to the
   first match in document order. A duplicate inside a `display:none` subtree
   silently wins and the visible element gets nothing.
4. **A monitor that reports "all clear" when it has no data.** Absence of
   findings is not evidence of health. Same shape as a health score of 0 for
   an unconnected account.
5. **Two formatting or aggregation paths for one number.** The campaigns page
   totals daily insight rows while its cards show per-campaign windows; if
   they diverge nothing notices.
6. **A "fix" that trades one failure for another.** Five topbar iterations
   each solved the visible symptom and created the next. Measure at every
   breakpoint before and after.
7. **Independent booleans for mutually exclusive UI states.** Nine separate
   `style.display` writes across five regions, no owner — so production can
   and did show loading, error, stale and partial at once.

## Working rules

- **Reproduce before fixing.** Every fitness test added here was first proven
  to *fail* on the real regression; a test that has never gone red is
  decoration.
- **Measure, don't assume.** Screenshot at real widths, probe in Chromium,
  count with a script. A confident wrong comment was written this session and
  only a screenshot caught it.
- Do not reset, stash, revert, or delete another agent's worktree changes.
- Gated without explicit approval: encryption/keys/auth behaviour, database
  migrations, structural refactors, anything touching the Meta API client.

## Measuring

There is no coverage tool, so report these instead — all reproducible:

```bash
npx tsc --noEmit                              # type errors
grep -rn ": any\|as any\|@ts-ignore" src/ | wc -l
npx tsx scripts/render-pages.mts              # render every page
node test_page_scripts.mjs                    # parse + design-system gates
node test_no_english_in_ar_pages.mjs          # i18n gate
npx tsx test_route_authz.ts                   # route authorisation
node test_mobile_viewport.mjs                 # 12 widths in Chromium (~10 min)
ls -la .mobile-pages/*.html                   # served page weight
```

Production (`adlytic.net`) is **not reachable** from the audit sandbox — the
egress proxy answers 403 to CONNECT. Any claim about live behaviour must come
from running the server locally, not from asserting what production does.
