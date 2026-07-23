-- Ad-set destination_type — the authoritative click-to-message signal.
-- Under Meta's ODAX, messages campaigns are created as OUTCOME_ENGAGEMENT;
-- when the ad set also optimizes LINK_CLICKS/POST_ENGAGEMENT, objective and
-- optimization_goal BOTH mislabel the campaign as engagement. destination_type
-- (MESSENGER / WHATSAPP / INSTAGRAM_DIRECT) is what actually says "this ad
-- opens a chat". Additive + nullable: inert on existing rows; the regular
-- ad-set sync upsert backfills it on the next run per account.
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "destination_type" TEXT;
