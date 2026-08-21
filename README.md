# Adlytic

Meta Ads intelligence platform for Iraqi SMBs (Arabic-first). Turns raw Meta Ads data into
one explainable chain — normalized data → semantics → objective → anomaly → diagnosis →
evidence → decision → LLM explanation → DTO → server-rendered dashboard.

Stack: TypeScript (strict) on Node, [Hono](https://hono.dev) for the API, Prisma 7 +
PostgreSQL (`@prisma/adapter-pg`), BullMQ + Redis for background sync, deployed on Railway.
There is no React/SPA frontend — pages are server-rendered HTML from TypeScript template
literals in `src/web/pages/*.ts`.

## Pipeline

    Meta Graph API
      └─ mappers/insightMapper.ts (the ingestion cordon — Meta field names stop here)
          └─ workers/syncAccount.ts (per-account advisory-locked sync) → daily_stats
              └─ analytics/* (semantics, funnel, anomaly, health, recommendation)
                  └─ services/getDashboard.ts → DashboardDTO
                      └─ web/pages/*.ts → server-rendered HTML

See [`docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md`](docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md)
for the full chain, the canonical ownership table (who owns each decision, what feeds it,
who's allowed to read it), and the locked, test-enforced rules in `docs/ANALYTICS_RULES.md`.

## Setup

    npm install
    cp .env.example .env        # fill in DATABASE_URL and the other required variables
    npm run db:migrate          # applies prisma/migrations (prisma migrate dev)
    npm run start:dev           # API + in-process workers, tsx --env-file=.env

`npm run seed-demo` seeds a demo workspace if you want fixture data without a live Meta
connection. `npm run db:studio` opens Prisma Studio.

## Tests

    npm run test:all

Runs every suite listed in `package.json`'s `test:all` script (~30 standalone `tsx`
scripts, no test framework — each uses a small sync/async `check()` harness with
`node:assert/strict`). Run it twice before trusting a change: some suites are structural
(reading source text) and can be order-sensitive with build artifacts.

    npx tsc --noEmit            # strict typecheck
    npm run test:e2e            # Playwright, browser-driven

## Architecture invariants

The full, current set lives in `docs/ANALYTICS_RULES.md` (ten rules, each enforced by a
fitness test in `test_analytics_architecture.ts`) and
`docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md` (ownership beyond the
analytics layer: Meta cordon, sync concurrency, purge, anomaly/diagnosis/decision
ownership, V5's status, DTO purity). The short version:

1. One canonical resolver per decision — campaign purpose, result semantics, Meta action
   counting, anomaly, diagnosis, and recommendation each have exactly one owner; nothing
   downstream re-derives them.
2. The AI/LLM layer explains and narrates; it never calculates a KPI, classifies a
   campaign, chooses a funnel stage, or overrides a deterministic diagnosis.
3. `UNKNOWN` / `INSUFFICIENT_DATA` / `NOT_APPLICABLE` are first-class states, never
   silently collapsed into a fabricated `0` or a guessed default.
4. The UI formats and visualizes; it does not decide canonical metric identity, objective
   semantics, or intelligence output.
