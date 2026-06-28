-- Manual WhatsApp account activation (Phase 2 pivot).
-- New signups default inactive; backfill grants access to all existing users.

ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "activated_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "activated_by" TEXT;

UPDATE "users" SET "is_active" = true;

CREATE INDEX "users_is_active_idx" ON "users"("is_active");
