-- Add token_version to users for JWT revocation support.
-- Default 0 — existing users get version 0; their current (base64) tokens
-- will be rejected on first use after this migration because they are not
-- JWTs. Users will be prompted to log in again, which issues a valid JWT.

ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
