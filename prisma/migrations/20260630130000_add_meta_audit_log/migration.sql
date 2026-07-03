-- Meta account lifecycle audit log (P1-10).
-- Append-only history of connect / disconnect / token-expired / reconnect-required
-- events per workspace. Additive and non-destructive: no existing table changes.

-- CreateEnum
CREATE TYPE "MetaAuditEvent" AS ENUM ('CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'RECONNECT_REQUIRED');

-- CreateTable
CREATE TABLE "meta_audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event" "MetaAuditEvent" NOT NULL,
    "ad_account_id" TEXT,
    "external_account_id" TEXT,
    "actor_user_id" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_audit_logs_workspace_id_created_at_idx" ON "meta_audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "meta_audit_logs_event_created_at_idx" ON "meta_audit_logs"("event", "created_at");
