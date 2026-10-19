-- Adlytic Check V2 — prompt-cache usage per check, and the report a re-check compares against.
-- Additive; NULL for rows written before this migration.
ALTER TABLE analyses ADD COLUMN cache_write_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN cache_read_tokens INTEGER;
-- The earlier report of the same owner this check was compared with (never another owner's).
ALTER TABLE analyses ADD COLUMN parent_id TEXT;
CREATE INDEX analyses_parent ON analyses (parent_id) WHERE parent_id IS NOT NULL;
