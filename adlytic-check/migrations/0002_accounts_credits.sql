-- Adlytic Check V2 — accounts and credits. Additive only: no V1 table or
-- column is changed or dropped, so the running V1 code keeps working
-- (expand → migrate → switch). All timestamps are UTC epoch milliseconds.

-- An account. Created only from a verified login (Google OIDC `sub`).
-- `activated_at` anchors the free-quota refill clock (server time).
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  activated_at  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))
);

-- Verified external identities. No e-mail address is stored.
CREATE TABLE identities (
  provider        TEXT NOT NULL,
  subject         TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  email_verified  INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities (user_id);

-- Logged-in sessions; `id` is SHA-256 of the HttpOnly cookie token.
CREATE TABLE auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER
);
CREATE INDEX auth_sessions_user ON auth_sessions (user_id);

-- One-time login transactions (state + nonce + PKCE verifier), bound to the
-- guest session that started them — that binding is the proof of ownership
-- used to move the guest's reports into the account.
CREATE TABLE oauth_transactions (
  state_hash     TEXT PRIMARY KEY,
  visitor_id     TEXT NOT NULL,
  code_verifier  TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  return_to      TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  used_at        INTEGER
);

-- Free quota: 2 on activation, +1 per 24 h from activation, never above 2
-- counting units held by in-flight checks. Refills are applied lazily from
-- `refill_anchor` (the last processed refill instant) at every event.
CREATE TABLE free_quota (
  user_id         TEXT PRIMARY KEY,
  available       INTEGER NOT NULL CHECK (available BETWEEN 0 AND 2),
  refill_anchor   INTEGER NOT NULL,
  policy_version  TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- The activation grant can happen once per account, ever.
CREATE TABLE free_grants (
  user_id     TEXT PRIMARY KEY,
  granted_at  INTEGER NOT NULL,
  amount      INTEGER NOT NULL
);

-- Purchased checks. Separate from the free bucket; never consumed without
-- explicit consent carrying the current price version.
CREATE TABLE paid_balance (
  user_id     TEXT PRIMARY KEY,
  available   INTEGER NOT NULL CHECK (available >= 0),
  updated_at  INTEGER NOT NULL
);

-- Append-only record of every unit movement. (reason, ref, bucket) is unique,
-- so a retried settlement can never move a unit twice.
CREATE TABLE credit_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  bucket      TEXT NOT NULL CHECK (bucket IN ('free', 'paid')),
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (reason, ref, bucket)
);
CREATE INDEX credit_ledger_user ON credit_ledger (user_id, created_at);

-- A check row doubles as the credit reservation (status pending = held,
-- reservation_expires_at = lease). These columns are NULL for V1 guest checks.
ALTER TABLE analyses ADD COLUMN user_id TEXT;
ALTER TABLE analyses ADD COLUMN credit_bucket TEXT CHECK (credit_bucket IN ('free', 'paid'));
ALTER TABLE analyses ADD COLUMN price_version TEXT;
CREATE INDEX analyses_user_created ON analyses (user_id, created_at);
CREATE INDEX analyses_user_pending ON analyses (user_id, credit_bucket, status, reservation_expires_at);
