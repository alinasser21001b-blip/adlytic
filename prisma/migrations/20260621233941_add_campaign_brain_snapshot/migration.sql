-- CreateTable
CREATE TABLE "campaign_brain_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "tick_date" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "pattern_signature" TEXT NOT NULL,
    "final_score" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_brain_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_brain_snapshots_workspace_id_tick_date_idx" ON "campaign_brain_snapshots"("workspace_id", "tick_date");

-- CreateIndex
CREATE INDEX "campaign_brain_snapshots_workspace_id_priority_action_idx" ON "campaign_brain_snapshots"("workspace_id", "priority", "action");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_brain_snapshots_campaign_id_tick_date_key" ON "campaign_brain_snapshots"("campaign_id", "tick_date");
