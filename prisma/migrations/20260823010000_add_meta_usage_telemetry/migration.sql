-- Durable Meta usage telemetry. ADDITIVE ONLY: three new tables, no column
-- altered, no row touched, nothing dropped. Safe to apply while the previous
-- release is still serving.
--
-- No historical backfill. Days before measurement begins stay UNKNOWN — a
-- zero written here would be indistinguishable from an observed zero, which
-- is the exact defect this table exists to remove.

CREATE TABLE "meta_usage_daily" (
    "date" DATE NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorByCategory" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meta_usage_daily_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "meta_usage_outcomes" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "category" TEXT,
    CONSTRAINT "meta_usage_outcomes_pkey" PRIMARY KEY ("id")
);

-- The read pattern is "newest N terminal outcomes" and the prune pattern is
-- "delete everything older than the newest N"; both are ordered scans on at.
CREATE INDEX "meta_usage_outcomes_at_idx" ON "meta_usage_outcomes"("at");

CREATE TABLE "meta_usage_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "measurementStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latestObservedAt" TIMESTAMP(3),
    "appUsage" JSONB,
    "adAccountUsage" JSONB,
    "businessUseCase" JSONB,
    CONSTRAINT "meta_usage_state_pkey" PRIMARY KEY ("id")
);
