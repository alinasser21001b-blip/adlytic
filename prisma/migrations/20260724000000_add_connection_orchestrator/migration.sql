-- Connection Orchestrator — provider-agnostic onboarding state machine
-- plus its append-only audit timeline.

CREATE TYPE "ConnectionProvider" AS ENUM ('META', 'GOOGLE_ADS', 'TIKTOK');

CREATE TYPE "OnboardingState" AS ENUM (
  'REQUEST_CREATED', 'WAITING_EXTERNAL_ACTION', 'CONNECTING',
  'VERIFYING', 'SYNCING', 'READY', 'BLOCKED', 'FAILED'
);

CREATE TYPE "OnboardingEventKind" AS ENUM (
  'STATE_CHANGE', 'STEP_EXECUTED', 'STEP_VERIFIED', 'RECONCILED',
  'CAPABILITY_CHANGE', 'ERROR', 'NOTE'
);

CREATE TABLE "connection_onboardings" (
  "id"                  TEXT NOT NULL,
  "workspace_id"        TEXT NOT NULL,
  "provider"            "ConnectionProvider" NOT NULL DEFAULT 'META',
  "external_account_id" TEXT NOT NULL,
  "state"               "OnboardingState" NOT NULL DEFAULT 'REQUEST_CREATED',
  "plan_json"           JSONB,
  "capabilities_json"   JSONB,
  "current_step_id"     TEXT,
  "attempts"            INTEGER NOT NULL DEFAULT 0,
  "last_error"          TEXT,
  "blocked_requirement" TEXT,
  "next_check_at"       TIMESTAMP(3),
  "waiting_since"       TIMESTAMP(3),
  "last_checked_at"     TIMESTAMP(3),
  "linked_ad_account_id" TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  "completed_at"        TIMESTAMP(3),
  CONSTRAINT "connection_onboardings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connection_onboardings_workspace_id_provider_external_account_id_key"
  ON "connection_onboardings"("workspace_id", "provider", "external_account_id");
CREATE INDEX "connection_onboardings_state_next_check_at_idx"
  ON "connection_onboardings"("state", "next_check_at");
CREATE INDEX "connection_onboardings_workspace_id_idx"
  ON "connection_onboardings"("workspace_id");

ALTER TABLE "connection_onboardings"
  ADD CONSTRAINT "connection_onboardings_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "onboarding_events" (
  "id"             TEXT NOT NULL,
  "onboarding_id"  TEXT NOT NULL,
  "at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind"           "OnboardingEventKind" NOT NULL,
  "from_state"     "OnboardingState",
  "to_state"       "OnboardingState",
  "step_id"        TEXT,
  "message"        TEXT NOT NULL,
  "data_json"      JSONB,
  CONSTRAINT "onboarding_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_events_onboarding_id_at_idx"
  ON "onboarding_events"("onboarding_id", "at");

ALTER TABLE "onboarding_events"
  ADD CONSTRAINT "onboarding_events_onboarding_id_fkey"
  FOREIGN KEY ("onboarding_id") REFERENCES "connection_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
