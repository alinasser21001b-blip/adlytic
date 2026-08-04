-- Round-2 review: fixes for defects introduced by the round-1 fixes.

-- ── A clean reconciliation must be recordable ───────────────────────────────
-- SKU trust rises on a spot-count, but a count that MATCHES the ledger has
-- delta 0 — which the delta_qty <> 0 CHECK rejected. Only a count that
-- DISAGREED could be recorded, so the reconciliation signal was inverted:
-- trust could never rise by confirming the ledger was right.
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_delta_qty_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_delta_qty_check
  CHECK (delta_qty <> 0 OR reason = 'COUNT');

-- ── Backfill the ledger key ─────────────────────────────────────────────────
-- Case/orthography folding was applied to new writes only, orphaning every
-- pre-existing row: one SKU's history split across two keys, and its trust row
-- reset to zero. Fold historical rows onto the same key and merge the trust
-- rows rather than letting the unique constraint pick an arbitrary winner.
UPDATE stock_movements SET medicine_name = lower(btrim(medicine_name))
 WHERE medicine_name <> lower(btrim(medicine_name));

-- Merge duplicate trust rows: keep the densest history, the most recent count,
-- and the WORST variance — never launder a bad reconciliation by merging.
CREATE TEMP TABLE sku_trust_merged AS
  SELECT branch_id,
         lower(btrim(medicine_name)) AS medicine_name,
         SUM(movement_count) AS movement_count,
         MAX(last_counted_at) AS last_counted_at,
         MAX(ABS(last_variance)) AS last_variance,
         MIN(trust_score) AS trust_score
    FROM sku_trust
   GROUP BY branch_id, lower(btrim(medicine_name));

DELETE FROM sku_trust;
INSERT INTO sku_trust
  (branch_id, medicine_name, movement_count, last_counted_at, last_variance, trust_score, updated_at)
SELECT branch_id, medicine_name, movement_count, last_counted_at, last_variance, trust_score, now()
  FROM sku_trust_merged;
DROP TABLE sku_trust_merged;

-- ── Make the unique live-pair index creatable ───────────────────────────────
-- 0006 added a unique index on live (owner, member) pairs, but on a database
-- that already holds duplicates the CREATE fails and the whole deploy aborts —
-- on exactly the data the index exists to prevent. Revoke the extra links
-- first, keeping the least-privileged one, then the index applies cleanly.
UPDATE family_members f
   SET revoked_at = now()
 WHERE f.revoked_at IS NULL
   AND f.member_user_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM family_members keep
      WHERE keep.owner_user_id = f.owner_user_id
        AND keep.member_user_id = f.member_user_id
        AND keep.revoked_at IS NULL
        AND (
          CASE keep.proxy_scope WHEN 'VIEW' THEN 1 WHEN 'ORDER' THEN 2 ELSE 3 END,
          keep.created_at,
          keep.id
        ) < (
          CASE f.proxy_scope WHEN 'VIEW' THEN 1 WHEN 'ORDER' THEN 2 ELSE 3 END,
          f.created_at,
          f.id
        )
   );

-- Retry the index from 0006, which may have been skipped on a dirty database.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_live_pair_idx
  ON family_members(owner_user_id, member_user_id)
  WHERE member_user_id IS NOT NULL AND revoked_at IS NULL;

-- ── Interaction alerts must be clearable ────────────────────────────────────
-- The alert is deduped on the clinical CONDITION, so it keeps the resource_id
-- of the first check that raised it. The override handler therefore has to
-- match on the condition, which means the check must remember it.
ALTER TABLE interaction_checks
  ADD COLUMN IF NOT EXISTS condition_key text;
CREATE INDEX IF NOT EXISTS interaction_checks_condition_idx
  ON interaction_checks(condition_key)
  WHERE condition_key IS NOT NULL;
