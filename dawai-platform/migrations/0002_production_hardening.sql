-- Production hardening: tracking, recovery, devices, consents, integrity

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_owner_user_unique
  ON pharmacies(owner_user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS device_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('WEB', 'IOS', 'ANDROID')),
  token_hash text NOT NULL,
  push_token text NOT NULL,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token_hash)
);
CREATE INDEX IF NOT EXISTS device_tokens_user_active_idx
  ON device_tokens(user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_consents (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (
    consent_type IN ('PRIVACY_POLICY', 'TERMS_OF_SERVICE', 'PHARMACY_TERMS', 'MARKETING')
  ),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  UNIQUE(user_id, consent_type, document_version)
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx
  ON user_consents(user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id text PRIMARY KEY,
  outbox_id text NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('SENT', 'FAILED', 'SKIPPED')),
  provider_response text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_delivery_logs_outbox_idx
  ON notification_delivery_logs(outbox_id, created_at DESC);

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_idempotency_idx
  ON notification_outbox(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;
