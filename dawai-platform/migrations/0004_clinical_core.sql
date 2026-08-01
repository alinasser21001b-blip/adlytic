-- Clinical core: the adherence data graph the blueprint names as Dawai's moat.
-- Adds the Clinical module (family proxy consent, dose schedules, dose events),
-- the passive-inventory ledger (no ERP), the attention system that replaces
-- notification spam, and the AI/OCR audit trail. PGlite-safe.

-- ── Family proxy: two-sided, scoped, revocable consent ───────────────────────
-- The son who buys for his mother is the true Iraqi market unit, but a proxy
-- link is never silent: the patient grants it, sees it, and can revoke it.
-- Scopes are additive and least-privilege (view < order < confirm).
CREATE TABLE IF NOT EXISTS family_members (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id text REFERENCES users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  relation text NOT NULL,
  proxy_scope text NOT NULL DEFAULT 'VIEW'
    CHECK (proxy_scope IN ('VIEW', 'ORDER', 'CONFIRM')),
  -- NULL until the member (or a witnessing pharmacist) accepts: no silent linkage.
  consent_granted_at timestamptz,
  consent_witnessed_by text REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (member_user_id IS NULL OR member_user_id <> owner_user_id)
);
CREATE INDEX IF NOT EXISTS family_members_owner_idx
  ON family_members(owner_user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS family_members_member_idx
  ON family_members(member_user_id) WHERE revoked_at IS NULL;

-- ── Dose schedules: pharmacist-confirmed sig, never AI-authored ──────────────
-- sig_text_ar is template + pharmacist-approved content; sig_source records
-- provenance so every instruction is auditable to a source.
CREATE TABLE IF NOT EXISTS dose_schedules (
  id text PRIMARY KEY,
  patient_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_member_id text REFERENCES family_members(id) ON DELETE SET NULL,
  medicine_id text REFERENCES medicines(id) ON DELETE SET NULL,
  medicine_name text NOT NULL,
  strength text,
  sig_text_ar text NOT NULL,
  -- Lowest-trust default: forgetting the column must never assert that a
  -- pharmacist authored the instruction.
  sig_source text NOT NULL DEFAULT 'PATIENT_SELF_REPORT'
    CHECK (sig_source IN ('PHARMACIST', 'MONOGRAPH_TEMPLATE', 'PATIENT_SELF_REPORT')),
  confirmed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  times_of_day jsonb NOT NULL DEFAULT '[]'::jsonb,
  doses_per_day integer NOT NULL DEFAULT 1 CHECK (doses_per_day BETWEEN 1 AND 12),
  quantity_dispensed integer CHECK (quantity_dispensed IS NULL OR quantity_dispensed > 0),
  dispensed_at timestamptz,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  -- Patient can silence a reorder suggestion without abandoning the schedule.
  reorder_snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dose_schedules_patient_idx
  ON dose_schedules(patient_user_id) WHERE active;

-- ── Dose events: APPEND-ONLY. Clinical confirmations are never overwritten ───
-- Offline devices replay these with a client_event_id; the unique index makes
-- replay idempotent without server round-trips.
CREATE TABLE IF NOT EXISTS dose_events (
  id text PRIMARY KEY,
  dose_schedule_id text NOT NULL REFERENCES dose_schedules(id) ON DELETE CASCADE,
  patient_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('TAKEN', 'MISSED', 'SNOOZED', 'UNKNOWN')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  -- Who confirmed: the patient, or a proxy holding CONFIRM scope.
  confirmed_by_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_via_family_member_id text REFERENCES family_members(id) ON DELETE SET NULL,
  client_event_id text,
  recorded_offline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dose_events_client_dedupe_idx
  ON dose_events(dose_schedule_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dose_events_schedule_idx
  ON dose_events(dose_schedule_id, scheduled_at DESC);

-- ── Passive inventory: an append-only ledger, NOT an ERP ─────────────────────
-- on-hand = sum(delta_qty). Additive deltas (never absolute overwrites) so two
-- offline devices selling concurrently both apply correctly on sync.
CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  medicine_id text REFERENCES medicines(id) ON DELETE SET NULL,
  medicine_name text NOT NULL,
  delta_qty integer NOT NULL CHECK (delta_qty <> 0),
  reason text NOT NULL CHECK (reason IN ('SALE', 'PURCHASE', 'ADJUST', 'RETURN', 'COUNT')),
  ref_type text,
  ref_id text,
  client_event_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_client_dedupe_idx
  ON stock_movements(branch_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_ledger_idx
  ON stock_movements(branch_id, medicine_name, occurred_at DESC);

-- ── SKU trust: gates whether a SKU is forecast-ready ─────────────────────────
-- Low-trust SKUs are excluded from forecasting entirely rather than shown with
-- a caveat — a wrong stock promise is worse than no promise.
CREATE TABLE IF NOT EXISTS sku_trust (
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  medicine_name text NOT NULL,
  movement_count integer NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  last_variance integer NOT NULL DEFAULT 0,
  trust_score numeric(4, 3) NOT NULL DEFAULT 0
    CHECK (trust_score >= 0 AND trust_score <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, medicine_name)
);

-- ── Attention events: replaces notification floods ───────────────────────────
-- One priority ladder drives the Pill Bar. SEV_ALERT never auto-dismisses.
CREATE TABLE IF NOT EXISTS attention_events (
  id text PRIMARY KEY,
  recipient_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority text NOT NULL
    CHECK (priority IN ('SEV_ALERT', 'ACTION_REQUIRED', 'IN_PROGRESS', 'SUGGESTION')),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  resource_type text,
  resource_id text,
  -- Frequency capping: suppress repeats of the same kind within a window.
  dedupe_key text,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attention_events_live_idx
  ON attention_events(recipient_user_id, created_at DESC)
  WHERE dismissed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attention_events_dedupe_idx
  ON attention_events(recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dismissed_at IS NULL;

-- ── Model output log: every AI/OCR output auditable, with its gate decision ──
CREATE TABLE IF NOT EXISTS model_output_log (
  id text PRIMARY KEY,
  pipeline text NOT NULL,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  input_ref text,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4, 3),
  model_version text NOT NULL DEFAULT 'unset',
  gated boolean NOT NULL DEFAULT true,
  resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_output_log_pipeline_idx
  ON model_output_log(pipeline, created_at DESC);
