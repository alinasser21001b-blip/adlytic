-- Adlytic Check V2 — payments. Additive only. Amounts are integer IQD.

CREATE TABLE payment_orders (
  id               TEXT PRIMARY KEY,          -- our order id, sent to the gateway as the external reference
  user_id          TEXT NOT NULL,
  product_id       TEXT NOT NULL,
  units            INTEGER NOT NULL CHECK (units > 0),
  amount_iqd       INTEGER NOT NULL CHECK (amount_iqd > 0),
  price_version    TEXT NOT NULL,
  provider         TEXT NOT NULL,
  provider_tx_id   TEXT,
  status           TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'expired')),
  idempotency_key  TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  credited_at      INTEGER,
  UNIQUE (user_id, idempotency_key)
);
CREATE UNIQUE INDEX payment_orders_provider_tx ON payment_orders (provider, provider_tx_id) WHERE provider_tx_id IS NOT NULL;
CREATE INDEX payment_orders_status ON payment_orders (status, created_at);
CREATE INDEX payment_orders_user ON payment_orders (user_id, created_at);

-- Every gateway interaction, verified or not. Raw payloads are never stored — only a hash.
CREATE TABLE payment_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         TEXT,
  provider         TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('init', 'redirect', 'webhook', 'inquiry', 'reconcile')),
  provider_status  TEXT,
  verified         INTEGER NOT NULL,
  payload_hash     TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX payment_events_order ON payment_events (order_id, created_at);

CREATE TABLE reconciliation_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  checked      INTEGER NOT NULL DEFAULT 0,
  credited     INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  mismatches   INTEGER NOT NULL DEFAULT 0
);
