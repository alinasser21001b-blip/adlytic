-- Adlytic Check V2 — which kind of media a check analysed ('image', 'video', 'text').
-- Additive; NULL for rows written before this migration. No media is ever stored.
ALTER TABLE analyses ADD COLUMN media_kind TEXT;
