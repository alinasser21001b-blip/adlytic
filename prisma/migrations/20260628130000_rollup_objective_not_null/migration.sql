-- §2.4 NULL-uniqueness fix: objective NOT NULL with "__ALL__" sentinel for account-wide aggregate.
UPDATE "campaign_history_rollups" SET "objective" = '__ALL__' WHERE "objective" IS NULL;

ALTER TABLE "campaign_history_rollups" ALTER COLUMN "objective" SET NOT NULL;
