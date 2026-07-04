-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiSignalType" AS ENUM ('RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_DISMISSED', 'ALERT_TAPPED', 'ALERT_IGNORED', 'BRIEF_READ', 'BRIEF_SKIPPED', 'MESSAGE_HELPFUL', 'MESSAGE_UNHELPFUL', 'DWELL_TIME', 'CITATION_CLICKED', 'ONBOARDING_STARTED', 'ANOMALY_SILENCED');

-- CreateEnum
CREATE TYPE "AiTerseness" AS ENUM ('TERSE', 'BALANCED', 'DETAILED');

-- CreateEnum
CREATE TYPE "AiPersonality" AS ENUM ('DIRECT', 'ENCOURAGING', 'PROFESSIONAL');

-- AlterEnum
ALTER TYPE "RecommendationSource" ADD VALUE 'AI_AGENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_currency_pref" TEXT,
ADD COLUMN     "ai_dialect" TEXT,
ADD COLUMN     "ai_locale" "Locale",
ADD COLUMN     "ai_personality" "AiPersonality" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "ai_terseness" "AiTerseness" NOT NULL DEFAULT 'BALANCED';

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "ai_conversation_id" TEXT,
ADD COLUMN     "ai_message_id" TEXT,
ADD COLUMN     "reasoning_chain_json" JSONB,
ADD COLUMN     "source" "RecommendationSource" NOT NULL DEFAULT 'V1_RULES';

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'AR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_proactive" BOOLEAN NOT NULL DEFAULT false,
    "trigger_type" TEXT,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls_json" JSONB,
    "tool_results_json" JSONB,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "latency_ms" INTEGER,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_signals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signal_type" "AiSignalType" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ai_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_anomaly_states" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "first_detected_at" TIMESTAMP(3) NOT NULL,
    "last_detected_at" TIMESTAMP(3) NOT NULL,
    "days_anomalous" INTEGER NOT NULL DEFAULT 1,
    "total_alerts" INTEGER NOT NULL DEFAULT 0,
    "merchant_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_anomaly_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_workspace_id_updated_at_idx" ON "ai_conversations"("workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_workspace_id_is_proactive_created_at_idx" ON "ai_conversations"("workspace_id", "is_proactive", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_signals_workspace_id_signal_type_created_at_idx" ON "ai_signals"("workspace_id", "signal_type", "created_at");

-- CreateIndex
CREATE INDEX "ai_signals_user_id_signal_type_created_at_idx" ON "ai_signals"("user_id", "signal_type", "created_at");

-- CreateIndex
CREATE INDEX "ai_signals_target_type_target_id_idx" ON "ai_signals"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ai_anomaly_states_workspace_id_last_detected_at_idx" ON "ai_anomaly_states"("workspace_id", "last_detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_anomaly_states_workspace_id_entity_type_entity_id_metric_key" ON "ai_anomaly_states"("workspace_id", "entity_type", "entity_id", "metric", "direction");

-- CreateIndex
CREATE INDEX "recommendations_source_created_at_idx" ON "recommendations"("source", "created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_signals" ADD CONSTRAINT "ai_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
