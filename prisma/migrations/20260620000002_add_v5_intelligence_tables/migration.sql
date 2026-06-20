-- V5 Intelligence Tables — Phase 1 Shadowing
-- These tables run alongside the existing detected_issues / recommendations /
-- health_scores tables. Nothing reads from them yet. Strangler Fig Phase 1.

CREATE TABLE "campaign_intelligence_reports" (
  "id"            TEXT        NOT NULL,
  "ad_account_id" TEXT        NOT NULL,
  "date"          DATE        NOT NULL,
  "health_score"  FLOAT       NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_intelligence_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_intelligence_reports_ad_account_id_date_key"
  ON "campaign_intelligence_reports"("ad_account_id", "date");
CREATE INDEX "campaign_intelligence_reports_ad_account_id_date_idx"
  ON "campaign_intelligence_reports"("ad_account_id", "date");

CREATE TABLE "campaign_signals" (
  "id"            TEXT        NOT NULL,
  "report_id"     TEXT        NOT NULL,
  "entity_id"     TEXT        NOT NULL,
  "signal_type"   TEXT        NOT NULL,
  "signal_value"  FLOAT       NOT NULL,
  "signal_weight" FLOAT       NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_signals_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE
);
CREATE INDEX "campaign_signals_report_id_idx"  ON "campaign_signals"("report_id");
CREATE INDEX "campaign_signals_entity_id_idx"  ON "campaign_signals"("entity_id");
CREATE INDEX "campaign_signals_signal_type_idx" ON "campaign_signals"("signal_type");

CREATE TABLE "campaign_issues" (
  "id"         TEXT        NOT NULL,
  "report_id"  TEXT        NOT NULL,
  "entity_id"  TEXT        NOT NULL,
  "issue_code" TEXT        NOT NULL,
  "severity"   TEXT        NOT NULL,
  "strength"   FLOAT       NOT NULL,
  "evidence"   TEXT[]      NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_issues_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE
);
CREATE INDEX "campaign_issues_report_id_idx" ON "campaign_issues"("report_id");
CREATE INDEX "campaign_issues_entity_id_idx" ON "campaign_issues"("entity_id");

CREATE TABLE "campaign_recommendations" (
  "id"          TEXT        NOT NULL,
  "report_id"   TEXT        NOT NULL,
  "entity_id"   TEXT        NOT NULL,
  "action_code" TEXT        NOT NULL,
  "priority"    TEXT        NOT NULL,
  "strength"    FLOAT       NOT NULL,
  "text"        TEXT        NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_recommendations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_recommendations_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "campaign_intelligence_reports"("id") ON DELETE CASCADE
);
CREATE INDEX "campaign_recommendations_report_id_idx" ON "campaign_recommendations"("report_id");
CREATE INDEX "campaign_recommendations_entity_id_idx" ON "campaign_recommendations"("entity_id");
