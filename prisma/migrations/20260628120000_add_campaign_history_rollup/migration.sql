-- Reconcile Q1: Campaign.endedAt deferred — drop column added in prior partial work.
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "ended_at";

-- Materialized rollup table (§2.4) — upserted by low-frequency background job.
CREATE TYPE "CampaignHistoryWindowKey" AS ENUM ('ALL_TIME', 'LAST_90D', 'LAST_30D');

CREATE TABLE "campaign_history_rollups" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "objective" TEXT,
    "window_key" "CampaignHistoryWindowKey" NOT NULL,
    "campaign_count" INTEGER NOT NULL,
    "avg_roas" DOUBLE PRECISION,
    "weighted_roas" DOUBLE PRECISION,
    "avg_cost_per_msg_minor" BIGINT,
    "total_spend_minor" BIGINT NOT NULL,
    "total_revenue_minor" BIGINT NOT NULL,
    "total_messages" BIGINT NOT NULL,
    "total_purchases" BIGINT NOT NULL,
    "currency" TEXT,
    "currency_minor_factor" INTEGER,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_history_rollups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_history_rollups_workspace_id_objective_window_key_key" ON "campaign_history_rollups"("workspace_id", "objective", "window_key");
CREATE INDEX "campaign_history_rollups_workspace_id_window_key_idx" ON "campaign_history_rollups"("workspace_id", "window_key");
