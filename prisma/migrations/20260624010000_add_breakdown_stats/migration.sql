-- Phase 5 Pass C: BreakdownStat — per-day metrics sliced by a single Meta
-- breakdown dimension (age, gender, publisher_platform, platform_position).
-- Unique on (entity, date, breakdownKey, breakdownValue) so re-running the
-- sync over the same window converges via upsert.

-- CreateTable
CREATE TABLE "breakdown_stats" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "breakdown_key" TEXT NOT NULL,
    "breakdown_value" TEXT NOT NULL,
    "spend" BIGINT NOT NULL DEFAULT 0,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "messages" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breakdown_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breakdown_stats_entity_type_entity_id_date_breakdown_key_v_key" ON "breakdown_stats"("entity_type", "entity_id", "date", "breakdown_key", "breakdown_value");

-- CreateIndex
CREATE INDEX "breakdown_stats_entity_type_entity_id_breakdown_key_date_idx" ON "breakdown_stats"("entity_type", "entity_id", "breakdown_key", "date");
