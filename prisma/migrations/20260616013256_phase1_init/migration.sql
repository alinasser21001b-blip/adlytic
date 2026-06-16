-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('META');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'AD_SET', 'AD');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "IssueCode" AS ENUM ('LOW_CTR', 'HIGH_CPM', 'HIGH_FREQUENCY', 'AUDIENCE_FATIGUE', 'DECLINING_RESULTS', 'BUDGET_BURNING_FAST', 'LOW_REACH', 'RISING_COST_PER_RESULT', 'STALLED_DELIVERY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'AR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "industry_profile_id" TEXT,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'META',
    "external_account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "currency_minor_factor" INTEGER NOT NULL DEFAULT 100,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "access_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "daily_budget" BIGINT,
    "lifetime_budget" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sets" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "external_adset_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "daily_budget" BIGINT,
    "optimization_goal" TEXT,
    "targeting_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL,
    "ad_set_id" TEXT NOT NULL,
    "external_ad_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "creative_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_insights" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "raw_json" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" BIGINT NOT NULL DEFAULT 0,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "reach" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "messages" BIGINT NOT NULL DEFAULT 0,
    "purchases" BIGINT NOT NULL DEFAULT 0,
    "leads" BIGINT NOT NULL DEFAULT 0,
    "conversions" BIGINT NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "cpm" DOUBLE PRECISION,
    "frequency" DOUBLE PRECISION,
    "roas" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_trends" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ctr_trend" DOUBLE PRECISION,
    "cpm_trend" DOUBLE PRECISION,
    "frequency_trend" DOUBLE PRECISION,
    "results_trend" DOUBLE PRECISION,
    "spend_trend" DOUBLE PRECISION,
    "window_days" INTEGER NOT NULL DEFAULT 14,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detected_issues" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "issue_code" "IssueCode" NOT NULL,
    "severity" "Severity" NOT NULL,
    "evidence_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detected_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_rules" (
    "id" TEXT NOT NULL,
    "issue_code" "IssueCode" NOT NULL,
    "locale" "Locale" NOT NULL,
    "industry_profile_id" TEXT,
    "title" TEXT NOT NULL,
    "causes_json" JSONB NOT NULL,
    "recommendations_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "priority" "RecommendationPriority" NOT NULL,
    "action_code" TEXT NOT NULL,
    "source_issues_json" JSONB NOT NULL,
    "details_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_scores" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown_json" JSONB NOT NULL,
    "algorithm_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "knowledge_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workspaces_industry_profile_id_idx" ON "workspaces"("industry_profile_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "ad_accounts_workspace_id_idx" ON "ad_accounts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_accounts_platform_external_account_id_key" ON "ad_accounts"("platform", "external_account_id");

-- CreateIndex
CREATE INDEX "campaigns_ad_account_id_idx" ON "campaigns"("ad_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_ad_account_id_external_campaign_id_key" ON "campaigns"("ad_account_id", "external_campaign_id");

-- CreateIndex
CREATE INDEX "ad_sets_campaign_id_idx" ON "ad_sets"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_sets_campaign_id_external_adset_id_key" ON "ad_sets"("campaign_id", "external_adset_id");

-- CreateIndex
CREATE INDEX "ads_ad_set_id_idx" ON "ads"("ad_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_ad_set_id_external_ad_id_key" ON "ads"("ad_set_id", "external_ad_id");

-- CreateIndex
CREATE INDEX "raw_insights_entity_type_entity_id_date_idx" ON "raw_insights"("entity_type", "entity_id", "date");

-- CreateIndex
CREATE INDEX "daily_stats_entity_id_date_idx" ON "daily_stats"("entity_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_entity_type_entity_id_date_key" ON "daily_stats"("entity_type", "entity_id", "date");

-- CreateIndex
CREATE INDEX "metric_trends_entity_id_date_idx" ON "metric_trends"("entity_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_trends_entity_type_entity_id_date_key" ON "metric_trends"("entity_type", "entity_id", "date");

-- CreateIndex
CREATE INDEX "detected_issues_entity_type_entity_id_date_idx" ON "detected_issues"("entity_type", "entity_id", "date");

-- CreateIndex
CREATE INDEX "detected_issues_issue_code_idx" ON "detected_issues"("issue_code");

-- CreateIndex
CREATE INDEX "knowledge_rules_issue_code_idx" ON "knowledge_rules"("issue_code");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_rules_issue_code_locale_industry_profile_id_key" ON "knowledge_rules"("issue_code", "locale", "industry_profile_id");

-- CreateIndex
CREATE INDEX "recommendations_entity_type_entity_id_date_idx" ON "recommendations"("entity_type", "entity_id", "date");

-- CreateIndex
CREATE INDEX "recommendations_priority_idx" ON "recommendations"("priority");

-- CreateIndex
CREATE INDEX "health_scores_entity_id_date_idx" ON "health_scores"("entity_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "health_scores_entity_type_entity_id_date_algorithm_version_key" ON "health_scores"("entity_type", "entity_id", "date", "algorithm_version");

-- CreateIndex
CREATE UNIQUE INDEX "industry_profiles_name_key" ON "industry_profiles"("name");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_industry_profile_id_fkey" FOREIGN KEY ("industry_profile_id") REFERENCES "industry_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_rules" ADD CONSTRAINT "knowledge_rules_industry_profile_id_fkey" FOREIGN KEY ("industry_profile_id") REFERENCES "industry_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
