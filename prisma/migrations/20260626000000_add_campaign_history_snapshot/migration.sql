-- Additive: Campaign.endedAt + immutable post-mortem snapshots
ALTER TABLE "campaigns" ADD COLUMN "ended_at" TIMESTAMP(3);

CREATE TABLE "campaign_history_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "final_status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "lifetime_spend_minor" BIGINT NOT NULL,
    "impressions" BIGINT NOT NULL,
    "reach" BIGINT NOT NULL,
    "clicks" BIGINT NOT NULL,
    "messages" BIGINT NOT NULL,
    "purchases" BIGINT NOT NULL,
    "leads" BIGINT NOT NULL,
    "revenue_minor" BIGINT NOT NULL,
    "final_roas" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "currency_minor_factor" INTEGER NOT NULL,
    "breakdown_json" JSONB,
    "creative_json" JSONB,
    "final_brain_json" JSONB,
    "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_history_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_history_snapshots_campaign_id_key" ON "campaign_history_snapshots"("campaign_id");
CREATE INDEX "campaign_history_snapshots_workspace_id_ended_at_idx" ON "campaign_history_snapshots"("workspace_id", "ended_at");
CREATE INDEX "campaign_history_snapshots_workspace_id_objective_final_roas_idx" ON "campaign_history_snapshots"("workspace_id", "objective", "final_roas");

ALTER TABLE "campaign_history_snapshots" ADD CONSTRAINT "campaign_history_snapshots_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
