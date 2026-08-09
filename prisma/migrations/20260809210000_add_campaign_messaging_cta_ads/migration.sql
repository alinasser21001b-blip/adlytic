-- Count of the campaign's ads whose creative CTA opens a chat. A synced fact
-- counted from AdCreative.call_to_action_type at discovery time, never
-- inferred. Backfilled from creatives already on disk so campaigns discovered
-- before this column exists don't wait a sync cycle for their signal.
ALTER TABLE "campaigns" ADD COLUMN "messaging_cta_ads" INTEGER NOT NULL DEFAULT 0;

UPDATE "campaigns" c
SET "messaging_cta_ads" = sub.n
FROM (
  SELECT ads."ad_set_id" AS ad_set_id, s."campaign_id" AS campaign_id, COUNT(*) AS n
  FROM "ads" ads
  JOIN "ad_sets" s ON s."id" = ads."ad_set_id"
  JOIN "ad_creatives" cr ON cr."id" = ads."creative_id"
  WHERE cr."call_to_action_type" IN
    ('WHATSAPP_MESSAGE', 'MESSAGE_PAGE', 'SEND_MESSAGE', 'INSTAGRAM_MESSAGE')
  GROUP BY ads."ad_set_id", s."campaign_id"
) sub
WHERE c."id" = sub.campaign_id;
