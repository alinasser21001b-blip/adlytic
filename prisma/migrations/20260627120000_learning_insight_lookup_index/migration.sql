-- Speed up campaign-level learning-phase narration lookups (application dedupe).
-- NOT a unique constraint: daily brain snapshots require one row per (campaign, day).
-- Canonical learning narration is enforced in brainNarrationCron + BrainPersistence.
CREATE INDEX IF NOT EXISTS "campaign_brain_snapshots_campaign_learning_idx"
ON "campaign_brain_snapshots" ("campaign_id")
WHERE "action" = 'KEEP_COLLECTING';
