-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('V1_RULES', 'V5_INTELLIGENCE');

-- CreateEnum
CREATE TYPE "UserActionStatus" AS ENUM ('PENDING', 'EXECUTED', 'IGNORED');

-- DropForeignKey
ALTER TABLE "campaign_issues" DROP CONSTRAINT "campaign_issues_report_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_recommendations" DROP CONSTRAINT "campaign_recommendations_report_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_signals" DROP CONSTRAINT "campaign_signals_report_id_fkey";

-- AlterTable
ALTER TABLE "campaign_intelligence_reports" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaign_issues" ALTER COLUMN "evidence" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaign_recommendations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaign_signals" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "recommendation_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "verdict" TEXT NOT NULL,
    "generated_by" "RecommendationSource" NOT NULL DEFAULT 'V1_RULES',
    "metrics_snapshot" JSONB NOT NULL,
    "user_action" "UserActionStatus" NOT NULL DEFAULT 'PENDING',
    "action_applied_at" TIMESTAMP(3),
    "performance_delta" DOUBLE PRECISION,
    "is_successful" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_logs_workspace_id_idx" ON "recommendation_logs"("workspace_id");

-- CreateIndex
CREATE INDEX "recommendation_logs_workspace_id_created_at_idx" ON "recommendation_logs"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "campaign_signals" ADD CONSTRAINT "campaign_signals_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_issues" ADD CONSTRAINT "campaign_issues_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recommendations" ADD CONSTRAINT "campaign_recommendations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
