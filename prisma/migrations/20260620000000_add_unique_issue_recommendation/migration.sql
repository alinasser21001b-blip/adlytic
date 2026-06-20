-- Deduplicate detected_issues before adding unique constraint.
-- Keeps the most recently created row per (entity_type, entity_id, date, issue_code).
DELETE FROM detected_issues
WHERE id NOT IN (
  SELECT DISTINCT ON (entity_type, entity_id, date, issue_code) id
  FROM detected_issues
  ORDER BY entity_type, entity_id, date, issue_code, created_at DESC
);

-- Unique constraint: one issue code per entity per day.
CREATE UNIQUE INDEX IF NOT EXISTS "detected_issues_entity_type_entity_id_date_issue_code_key"
  ON "detected_issues"("entity_type", "entity_id", "date", "issue_code");

-- Deduplicate recommendations before adding unique constraint.
DELETE FROM recommendations
WHERE id NOT IN (
  SELECT DISTINCT ON (entity_type, entity_id, date, action_code) id
  FROM recommendations
  ORDER BY entity_type, entity_id, date, action_code, created_at DESC
);

-- Unique constraint: one action code per entity per day.
CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_entity_type_entity_id_date_action_code_key"
  ON "recommendations"("entity_type", "entity_id", "date", "action_code");
