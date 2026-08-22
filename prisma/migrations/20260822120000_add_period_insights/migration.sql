-- Meta period facts: values Meta computes for a whole span (reach, frequency)
-- which cannot be reconstructed from daily rows. Keyed by the exact entity and
-- the exact span, so a non-matching read is a miss and the caller reports
-- UNKNOWN rather than substituting a daily-derived stand-in.
CREATE TABLE "period_insights" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "since" DATE NOT NULL,
    "until" DATE NOT NULL,
    "reach" BIGINT,
    "frequency" DOUBLE PRECISION,
    "impressions" BIGINT,
    "provenance" TEXT NOT NULL DEFAULT 'META_PERIOD_FACT',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "period_insights_entity_type_entity_id_since_until_key"
    ON "period_insights"("entity_type", "entity_id", "since", "until");

CREATE INDEX "period_insights_entity_id_since_until_idx"
    ON "period_insights"("entity_id", "since", "until");
