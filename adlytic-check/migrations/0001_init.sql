-- Adlytic Check — initial schema. All timestamps are UTC epoch milliseconds.

-- Anonymous visitor. `id` is SHA-256(cookie token); the raw token only ever
-- lives in the visitor's HttpOnly cookie.
CREATE TABLE visitors (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

-- One row per submitted check. A row is both the quota reservation and the
-- report: status pending → completed | failed, every transition conditional.
-- Completed rows count toward the weekly quota even after the report is
-- deleted (deleted_at) — deleting a report never refunds usage.
CREATE TABLE analyses (
  id                       TEXT PRIMARY KEY,
  visitor_id               TEXT NOT NULL,
  idempotency_key          TEXT NOT NULL,
  input_hash               TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  mode                     TEXT NOT NULL CHECK (mode IN ('image_and_text', 'image_only', 'text_only')),
  industry                 TEXT NOT NULL,
  goal                     TEXT NOT NULL,
  created_at               INTEGER NOT NULL,
  reservation_expires_at   INTEGER NOT NULL,
  expires_at               INTEGER NOT NULL,
  completed_at             INTEGER,
  report_json              TEXT,
  error_code               TEXT,
  provider_calls           INTEGER NOT NULL DEFAULT 0,
  model                    TEXT,
  latency_ms               INTEGER,
  input_tokens             INTEGER,
  output_tokens            INTEGER,
  share_token_hash         TEXT,
  share_created_at         INTEGER,
  deleted_at               INTEGER,
  UNIQUE (visitor_id, idempotency_key)
);
CREATE INDEX analyses_visitor_created ON analyses (visitor_id, created_at);
CREATE INDEX analyses_expires ON analyses (expires_at);
CREATE UNIQUE INDEX analyses_share_token ON analyses (share_token_hash) WHERE share_token_hash IS NOT NULL;

-- Service-wide daily provider-call ceiling (UTC day). Every real provider
-- call increments this — including failed calls and repair retries.
CREATE TABLE daily_usage (
  day             TEXT PRIMARY KEY,
  provider_calls  INTEGER NOT NULL DEFAULT 0
);

-- Fixed-window counters for abuse limits (session creation, events).
-- Keys are HMACs or visitor ids — never a raw IP.
CREATE TABLE rate_buckets (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Minimal product events: allowlisted names, no ad text, no image data.
CREATE TABLE product_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  visitor_id   TEXT,
  analysis_id  TEXT,
  created_at   INTEGER NOT NULL,
  props        TEXT
);
CREATE INDEX product_events_name_created ON product_events (name, created_at);
CREATE INDEX product_events_visitor ON product_events (visitor_id, created_at);
