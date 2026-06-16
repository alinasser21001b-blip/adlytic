# Adlytic — Phase 1 (Recovered)

Ads Intelligence Platform. Phase 1 builds the engine chain that turns Meta
Ads data into a dashboard verdict: raw insights → analytics → rules →
knowledge → recommendation → versioned health score → DashboardDTO → HTML.

## Pipeline

    Meta API
      └─ syncAccount worker
          └─ raw_insights → daily_stats
              └─ AnalyticsEngine → metric_trends
                  └─ RulesEngine → detected_issues
                      └─ RecommendationEngine → recommendations
                          └─ HealthScoreEngine v2 → health_scores
                              └─ getDashboard() → DashboardDTO
                                  └─ dashboard_wired.html

## Setup

    npm install
    cp .env.example .env        # then edit DATABASE_URL
    npx prisma generate
    npx prisma migrate dev --name phase1_init
    npx prisma db seed
    npm run test:all            # 241 assertions across 8 suites

## IMPORTANT — health scores

The seed writes placeholder health scores (82 / 91) with algorithmVersion=1.
These are NOT final. HealthScoreEngine v2 (algorithmVersion=2) OVERWRITES them
when you run `npm run engines:run` in Step 13.3, producing the honest values:
Furniture ≈ 51, Cosmetics ≈ 67, Healthy fixture ≈ 88.

## Step 13 — Verification Against Reality

See STEP_13_RUNBOOK.md. Run it in order. The rule: if reality disagrees with
the code, fix the code — not the test.

## Architecture invariants

1. Each engine owns one write-table, reads upstream only.
2. Composition is data (compositionRules.ts), not code.
3. Knowledge is a dictionary, not a brain (no AI, no invention).
4. Health score is explanation, not truth (always carries breakdownJson).
5. DashboardDTO is the product boundary; the HTML knows only its shape.
6. v1 health scores remain queryable forever; v2 coexists via algorithmVersion.
