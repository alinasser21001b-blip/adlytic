-- CreateTable
CREATE TABLE "recommendation_executions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "metrics_snapshot" JSONB NOT NULL,
    "user_action" "UserActionStatus" NOT NULL DEFAULT 'PENDING',
    "executed_at" TIMESTAMP(3),
    "success_score" DOUBLE PRECISION,
    "evaluation_version" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_executions_recommendation_id_key" ON "recommendation_executions"("recommendation_id");

-- CreateIndex
CREATE INDEX "recommendation_executions_workspace_id_idx" ON "recommendation_executions"("workspace_id");

-- CreateIndex
CREATE INDEX "recommendation_executions_user_action_evaluated_at_idx" ON "recommendation_executions"("user_action", "evaluated_at");

-- AddForeignKey
ALTER TABLE "recommendation_executions" ADD CONSTRAINT "recommendation_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_executions" ADD CONSTRAINT "recommendation_executions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
