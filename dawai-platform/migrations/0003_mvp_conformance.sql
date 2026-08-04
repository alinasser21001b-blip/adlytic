-- MVP product/architecture conformance hardening (PGlite-safe).

-- Staged dispatch (3+3): second batch waits before notify.
ALTER TABLE request_dispatches
  ADD COLUMN IF NOT EXISTS notify_after timestamptz;

-- Coarse location signal separate from exact matching coordinates.
ALTER TABLE medicine_requests
  ADD COLUMN IF NOT EXISTS coarse_geohash text;

-- Distinguishes prescription vs box/pack photo without altering purpose CHECK.
ALTER TABLE secure_files
  ADD COLUMN IF NOT EXISTS attachment_kind text NOT NULL DEFAULT 'PRESCRIPTION'
    CHECK (attachment_kind IN ('PRESCRIPTION', 'BOX_IMAGE'));
