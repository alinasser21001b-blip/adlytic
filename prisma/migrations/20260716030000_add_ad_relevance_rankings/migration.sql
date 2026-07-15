-- Ad relevance rankings (Meta's own quality/engagement/conversion grades).
-- Additive + nullable: inert on existing rows, safe to deploy with no backfill.
ALTER TABLE "ads" ADD COLUMN "quality_ranking" TEXT;
ALTER TABLE "ads" ADD COLUMN "engagement_ranking" TEXT;
ALTER TABLE "ads" ADD COLUMN "conversion_ranking" TEXT;
ALTER TABLE "ads" ADD COLUMN "rankings_synced_at" TIMESTAMP(3);
