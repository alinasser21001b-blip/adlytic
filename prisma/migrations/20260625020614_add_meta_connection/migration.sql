-- CreateEnum
CREATE TYPE "MetaTokenType" AS ENUM ('LONG_LIVED_USER', 'SYSTEM_USER', 'DIRECT');

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'NEEDS_REGRANT');

-- CreateEnum
CREATE TYPE "MetaTokenSource" AS ENUM ('USER_OAUTH', 'SYSTEM_USER', 'DIRECT_TOKEN', 'MANUAL');

-- AlterTable
ALTER TABLE "ad_accounts" ADD COLUMN     "connection_id" TEXT,
ADD COLUMN     "token_source" "MetaTokenSource" NOT NULL DEFAULT 'USER_OAUTH';

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "business_name" TEXT,
    "system_user_id" TEXT,
    "access_token_encrypted" TEXT,
    "token_type" "MetaTokenType" NOT NULL DEFAULT 'LONG_LIVED_USER',
    "token_expires_at" TIMESTAMP(3),
    "granted_scopes" TEXT[],
    "granted_asset_ids" TEXT[],
    "config_id" TEXT,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_connections_workspace_id_idx" ON "meta_connections"("workspace_id");

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_workspace_id_business_id_key" ON "meta_connections"("workspace_id", "business_id");

-- CreateIndex
CREATE INDEX "ad_accounts_connection_id_idx" ON "ad_accounts"("connection_id");

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "breakdown_stats_entity_type_entity_id_date_breakdown_key_v_key" RENAME TO "breakdown_stats_entity_type_entity_id_date_breakdown_key_br_key";
