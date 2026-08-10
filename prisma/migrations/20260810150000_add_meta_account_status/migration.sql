-- Meta account-level delivery status (the "unpaid bills" gate).
--
-- account_status was fetched once at connect time and thrown away, so an
-- account Meta suspended for an unsettled balance kept rendering all its
-- campaigns as delivering. These columns give the classifier the upstream
-- fact; the sync worker refreshes them on every run.
--
-- ADD COLUMN, nullable, no default: catalog-only change, no heap rewrite,
-- reversible with DROP COLUMN. NULL means "not yet synced" and is treated
-- as no-hold — absence of evidence is not evidence of a halt.
ALTER TABLE "ad_accounts" ADD COLUMN "meta_account_status" INTEGER;
ALTER TABLE "ad_accounts" ADD COLUMN "meta_disable_reason" INTEGER;
