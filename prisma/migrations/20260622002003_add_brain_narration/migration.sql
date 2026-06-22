-- AlterTable
ALTER TABLE "campaign_brain_snapshots" ADD COLUMN     "narration_generated_at" TIMESTAMP(3),
ADD COLUMN     "narration_json" JSONB;
