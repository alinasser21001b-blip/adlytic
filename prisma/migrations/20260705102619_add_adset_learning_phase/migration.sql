-- AlterTable
ALTER TABLE "ad_sets" ADD COLUMN     "learning_phase_status" TEXT;

-- RenameIndex
ALTER INDEX "campaign_history_snapshots_workspace_id_objective_final_roas_id" RENAME TO "campaign_history_snapshots_workspace_id_objective_final_roa_idx";
