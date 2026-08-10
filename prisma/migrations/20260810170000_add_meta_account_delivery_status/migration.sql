-- Meta ad-account delivery gate (account_status / disable_reason).
-- Campaigns can stay effective_status=ACTIVE while the account is unsettled
-- (unpaid balance). Persisting these lets classifyCampaignDelivery refuse the
-- false "تعمل" badge.
ALTER TABLE "ad_accounts" ADD COLUMN "meta_account_status" INTEGER;
ALTER TABLE "ad_accounts" ADD COLUMN "meta_disable_reason" INTEGER;
