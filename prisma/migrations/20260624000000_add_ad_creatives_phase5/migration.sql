-- Phase 5 Step 1: Normalized + deduped creative metadata.
--   * New table  : ad_creatives                    (one row per Meta creative)
--   * New column : ads.creative_id                 (FK into ad_creatives)
-- Existing data: untouched. `ads.creative_json` is intentionally left in place
-- as a legacy denormalized cache; new code reads from `ad_creatives`.

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "external_creative_id" TEXT NOT NULL,
    "name" TEXT,
    "thumbnail_url" TEXT,
    "image_hash" TEXT,
    "video_id" TEXT,
    "primary_text" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "call_to_action_type" TEXT,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_creatives_ad_account_id_external_creative_id_key" ON "ad_creatives"("ad_account_id", "external_creative_id");

-- CreateIndex
CREATE INDEX "ad_creatives_ad_account_id_idx" ON "ad_creatives"("ad_account_id");

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ads" ADD COLUMN "creative_id" TEXT;

-- CreateIndex
CREATE INDEX "ads_creative_id_idx" ON "ads"("creative_id");

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
