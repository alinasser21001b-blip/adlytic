-- Smart Refresh Engine: dirty-state per entity + per-run observability log.
-- Additive only — no existing table is touched.
CREATE TABLE IF NOT EXISTS "refresh_states" (
  "id" TEXT NOT NULL,
  "entity_type" "EntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "is_dirty" BOOLEAN NOT NULL DEFAULT false,
  "last_calculated_at" TIMESTAMP(3),
  "last_meta_sync_at" TIMESTAMP(3),
  "last_user_change_at" TIMESTAMP(3),
  "last_recommendation_execution_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refresh_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_states_entity_type_entity_id_key"
  ON "refresh_states" ("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "refresh_logs" (
  "id" TEXT NOT NULL,
  "ad_account_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "source_event" JSONB NOT NULL,
  "components_updated" JSONB NOT NULL,
  "component_durations" JSONB NOT NULL,
  "skipped" JSONB NOT NULL,
  "errors" JSONB NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "refresh_logs_ad_account_id_created_at_idx"
  ON "refresh_logs" ("ad_account_id", "created_at");
