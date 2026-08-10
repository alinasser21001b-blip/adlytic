-- Token encryption key versioning (AUDIT-REPORT.md D-1).
--
-- Both token columns store a bare iv:tag:ciphertext envelope with nothing
-- saying which TOKEN_ENCRYPTION_KEY produced it. The consequence is that a
-- key change cannot be staged: there is no way to write new rows under key B
-- while still reading key A, so any rotation is instantaneous, total, and —
-- if the previous key value was not retained — unrecoverable.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION:
--   · ADD COLUMN only. Nothing is dropped, renamed, or rewritten.
--   · Nullable with NO DEFAULT, so PostgreSQL records a catalog change and
--     does not rewrite the heap. Safe on a live table of any size.
--   · Existing rows stay NULL, which the application reads as "generation 1
--     by assumption" — the same key that is opening them today. No backfill,
--     so no window in which a row claims a generation it was not encrypted
--     under.
--   · Fully reversible: DROP COLUMN restores the previous shape exactly.
ALTER TABLE "ad_accounts"      ADD COLUMN "access_token_key_version" INTEGER;
ALTER TABLE "meta_connections" ADD COLUMN "access_token_key_version" INTEGER;
