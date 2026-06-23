-- AlterTable
ALTER TABLE "ad_accounts" ADD COLUMN     "lifetime_spend_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lifetime_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "daily_stats" ADD COLUMN     "cost_per_message" DOUBLE PRECISION,
ADD COLUMN     "revenue_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unique_clicks" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unique_ctr" DOUBLE PRECISION;
