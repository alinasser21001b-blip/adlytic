-- Creative-health dashboard stage index.
-- The stage scans ACTIVE ads that Meta has graded (rankings_synced_at IS NOT
-- NULL) for a single account. This composite index lets Postgres prune to
-- graded active ads directly instead of filtering the full ads scan, keeping
-- the enrichment stage well under its timeout budget on busy accounts.
-- Additive + idempotent: safe to deploy with no backfill and no lock concern
-- on the tiny ads volumes involved.
CREATE INDEX IF NOT EXISTS "ads_status_rankings_synced_at_idx"
  ON "ads" ("status", "rankings_synced_at");
