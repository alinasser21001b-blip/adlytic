-- Meta usage durability: replaces Redis-only tier-upgrade tracking with a
-- durable store, so readiness reads real numbers in any environment where
-- REDIS_URL is unset (this has always been true in production — Redis is
-- optional there, and Meta usage tracking was the one consumer with no
-- functioning fallback: absence read as hard zeros forever, not degraded
-- service). See src/services/metaUsageTracker.ts.
-- Additive only — no existing table is touched.

CREATE TABLE "meta_usage_daily_counters" (
    "date" DATE NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "err_token_count" INTEGER NOT NULL DEFAULT 0,
    "err_rate_limit_count" INTEGER NOT NULL DEFAULT 0,
    "err_permission_count" INTEGER NOT NULL DEFAULT 0,
    "err_invalid_params_count" INTEGER NOT NULL DEFAULT 0,
    "err_server_count" INTEGER NOT NULL DEFAULT 0,
    "err_other_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_usage_daily_counters_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "meta_usage_recent_calls" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "meta_usage_recent_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_usage_recent_calls_created_at_idx"
    ON "meta_usage_recent_calls"("created_at");

CREATE TABLE "meta_usage_latest_snapshot" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "app_usage" JSONB,
    "ad_account_usage" JSONB,
    "business_use_case" JSONB,
    "last_tier" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_usage_latest_snapshot_pkey" PRIMARY KEY ("id")
);
