-- Integrity hardening from the adversarial review of the clinical core.

-- ── Offline basket safety ───────────────────────────────────────────────────
-- The dedupe key was (branch_id, client_event_id), i.e. branch-wide. A device
-- syncing a multi-line sale under one client event id would have every line
-- after the first silently swallowed by ON CONFLICT DO NOTHING and reported as
-- a duplicate. Scope it to the row's subject, matching the dose_events index.
DROP INDEX IF EXISTS stock_movements_client_dedupe_idx;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_client_dedupe_idx
  ON stock_movements(branch_id, medicine_name, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- ── Attention dedupe must account for expiry ─────────────────────────────────
-- The partial index ignored expires_at while the read path filtered on it, so
-- an expired-but-undismissed event stayed in the index and permanently blocked
-- the same condition from being raised again. Expiry now closes the event.
DROP INDEX IF EXISTS attention_events_dedupe_idx;
CREATE UNIQUE INDEX IF NOT EXISTS attention_events_dedupe_idx
  ON attention_events(recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dismissed_at IS NULL AND expires_at IS NULL;

-- A severe safety alert must not be able to expire on a timer: the whole point
-- of SEV_ALERT is that it clears only when its cause is resolved. Without this,
-- setting expires_at would route around the 409 that blocks dismissal.
-- Dropped first because Postgres has no ADD CONSTRAINT IF NOT EXISTS, and this
-- was the ONE statement in seven migration files that could not survive being
-- applied twice. It did not have to be: the ledger that prevents that is fixed
-- (see rowCountOf in db/client.ts), and a migration that fails a re-run is a
-- boot failure waiting for the next thing that goes wrong with the ledger.
ALTER TABLE attention_events
  DROP CONSTRAINT IF EXISTS attention_sev_never_expires;
ALTER TABLE attention_events
  ADD CONSTRAINT attention_sev_never_expires
  CHECK (priority <> 'SEV_ALERT' OR expires_at IS NULL);

-- ── Deterministic proxy authority ───────────────────────────────────────────
-- requirePatientAuthority selected one live link with LIMIT 1 and no ORDER BY.
-- Nothing prevented several granted links between the same pair, so the
-- effective scope was whichever row the planner happened to return. One live
-- link per (owner, member) makes the scope deterministic by construction.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_live_pair_idx
  ON family_members(owner_user_id, member_user_id)
  WHERE member_user_id IS NOT NULL AND revoked_at IS NULL;

-- ── Units per administration ────────────────────────────────────────────────
-- Days-of-cover divided dispensed units by administrations per day, assuming
-- one unit per dose. Persist the real value so a 2-tablet regimen is not
-- reported as lasting twice as long as it does.
ALTER TABLE dose_schedules
  ADD COLUMN IF NOT EXISTS units_per_dose integer NOT NULL DEFAULT 1
    CHECK (units_per_dose BETWEEN 1 AND 20);
