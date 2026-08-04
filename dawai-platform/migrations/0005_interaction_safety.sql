-- Drug-interaction safety with severity tiering (blueprint MM-X2).
-- Open-data tier: DDInter 2.0 + openFDA labels, normalized via RxNorm upstream.
-- Enterprise datasets (DrugBank/FDB/Micromedex) are deliberately avoided at
-- this stage; the schema does not assume any one provider.

CREATE TABLE IF NOT EXISTS interaction_dataset_meta (
  id text PRIMARY KEY,
  source text NOT NULL,
  version text NOT NULL,
  -- Staleness is a safety property: a dataset older than the service's max age
  -- yields UNAVAILABLE rather than a clear result.
  updated_at timestamptz NOT NULL DEFAULT now(),
  ingredient_count integer NOT NULL DEFAULT 0
);

-- Coverage is explicit. An ingredient absent from this table cannot be
-- evaluated, and a regimen containing one is reported UNAVAILABLE — never
-- cleared on the covered subset.
CREATE TABLE IF NOT EXISTS interaction_ingredients (
  ingredient text PRIMARY KEY,
  rxnorm_cui text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drug_interactions (
  id text PRIMARY KEY,
  -- Stored with ingredient_a < ingredient_b so a pair has exactly one row.
  ingredient_a text NOT NULL,
  ingredient_b text NOT NULL,
  severity text NOT NULL
    CHECK (severity IN ('CONTRAINDICATED', 'SEVERE', 'MODERATE', 'MINOR')),
  summary_ar text NOT NULL,
  -- Every claim is receipted: the pharmacist sees where it came from.
  source text NOT NULL,
  source_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ingredient_a < ingredient_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS drug_interactions_pair_idx
  ON drug_interactions(ingredient_a, ingredient_b);
CREATE INDEX IF NOT EXISTS drug_interactions_lookup_idx
  ON drug_interactions(ingredient_a, severity);

-- Every check is recorded, including the ones that returned UNAVAILABLE.
-- Regulatory defensibility depends on being able to show what the system knew
-- and told the pharmacist at dispense time.
CREATE TABLE IF NOT EXISTS interaction_checks (
  id text PRIMARY KEY,
  patient_user_id text REFERENCES users(id) ON DELETE SET NULL,
  checked_by_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL
    CHECK (outcome IN ('CLEAR', 'INFO', 'INTERRUPT', 'UNAVAILABLE')),
  unavailable_reason text
    CHECK (unavailable_reason IS NULL OR unavailable_reason IN
      ('NO_COVERAGE', 'DATASET_STALE', 'LOOKUP_FAILED')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Override is only ever populated for an INTERRUPT outcome, and only with a
  -- typed clinical reason. Override rate is a KPI the blueprint tracks.
  overridden_at timestamptz,
  override_reason text,
  override_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (overridden_at IS NULL OR outcome = 'INTERRUPT'),
  CHECK (overridden_at IS NULL OR length(trim(override_reason)) >= 10)
);
CREATE INDEX IF NOT EXISTS interaction_checks_patient_idx
  ON interaction_checks(patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interaction_checks_outcome_idx
  ON interaction_checks(outcome, created_at DESC);
