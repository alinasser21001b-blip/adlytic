CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('PATIENT', 'PHARMACY', 'ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text NOT NULL,
  locale text NOT NULL DEFAULT 'ar-IQ',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  device_label text,
  ip_hash text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_area text,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  notification_preferences jsonb NOT NULL DEFAULT '{"inApp":true,"push":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacies (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  pharmacist_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  license_number text NOT NULL,
  license_issuer text NOT NULL DEFAULT 'Iraqi Pharmacists Syndicate',
  license_expires_at date,
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  verification_reason text,
  verified_at timestamptz,
  verified_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_license_unique
  ON pharmacies(license_number);

CREATE TABLE IF NOT EXISTS pharmacy_branches (
  id text PRIMARY KEY,
  pharmacy_id text NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  governorate text NOT NULL,
  district text NOT NULL,
  address text NOT NULL,
  landmark text,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone text NOT NULL DEFAULT 'Asia/Baghdad',
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  pickup_enabled boolean NOT NULL DEFAULT true,
  delivery_enabled boolean NOT NULL DEFAULT false,
  accepting_requests boolean NOT NULL DEFAULT false,
  operational_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (operational_status IN ('ACTIVE', 'PAUSED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_branches_location_idx
  ON pharmacy_branches(latitude, longitude);
CREATE INDEX IF NOT EXISTS pharmacy_branches_pharmacy_idx
  ON pharmacy_branches(pharmacy_id);

CREATE TABLE IF NOT EXISTS verification_documents (
  id text PRIMARY KEY,
  pharmacy_id text NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  secure_file_id text,
  document_type text NOT NULL CHECK (document_type IN ('LICENSE', 'PHARMACIST_ID', 'OTHER')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medicines (
  id text PRIMARY KEY,
  generic_name text NOT NULL,
  classification text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (classification IN ('OTC', 'PRESCRIPTION', 'CONTROLLED', 'UNKNOWN')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medicine_presentations (
  id text PRIMARY KEY,
  medicine_id text NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  strength text NOT NULL,
  dosage_form text NOT NULL,
  pack_size text,
  barcode text,
  gudea_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medicine_presentations_medicine_idx
  ON medicine_presentations(medicine_id);

CREATE TABLE IF NOT EXISTS medicine_aliases (
  id text PRIMARY KEY,
  presentation_id text NOT NULL REFERENCES medicine_presentations(id) ON DELETE CASCADE,
  alias text NOT NULL,
  locale text NOT NULL DEFAULT 'ar',
  normalized_alias text NOT NULL
);
CREATE INDEX IF NOT EXISTS medicine_aliases_search_idx
  ON medicine_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS secure_files (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('PRESCRIPTION', 'PHARMACY_LICENSE', 'PHARMACIST_ID')),
  request_id text,
  pharmacy_id text REFERENCES pharmacies(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  nonce text NOT NULL,
  auth_tag text NOT NULL,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'DELETED')),
  delete_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS secure_files_retention_idx
  ON secure_files(delete_at) WHERE status = 'READY';

CREATE TABLE IF NOT EXISTS medicine_requests (
  id text PRIMARY KEY,
  public_reference text NOT NULL UNIQUE,
  patient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'NEEDS_CLARIFICATION', 'ACTIVE', 'HOLD_PENDING', 'RESERVED', 'READY', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'NO_MATCH', 'BLOCKED')),
  medicine_name text NOT NULL,
  presentation_id text REFERENCES medicine_presentations(id),
  strength text,
  dosage_form text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 20),
  urgency text NOT NULL DEFAULT 'TODAY' CHECK (urgency IN ('NOW', 'TODAY', 'TOMORROW')),
  prescription_file_id text REFERENCES secure_files(id),
  prescription_status text NOT NULL DEFAULT 'NOT_PROVIDED'
    CHECK (prescription_status IN ('NOT_PROVIDED', 'PROVIDED', 'REVIEW_REQUIRED', 'VERIFIED')),
  area text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_km integer NOT NULL DEFAULT 2 CHECK (radius_km IN (2, 5, 10)),
  pickup_preferred boolean NOT NULL DEFAULT true,
  delivery_preferred boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medicine_requests_patient_idx
  ON medicine_requests(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS medicine_requests_active_expiry_idx
  ON medicine_requests(expires_at) WHERE status IN ('ACTIVE', 'HOLD_PENDING');

CREATE TABLE IF NOT EXISTS request_dispatches (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES medicine_requests(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  distance_km double precision NOT NULL CHECK (distance_km >= 0),
  match_score double precision NOT NULL,
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'VIEWED', 'RESPONDED', 'DECLINED', 'EXPIRED')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  UNIQUE(request_id, branch_id)
);
CREATE INDEX IF NOT EXISTS request_dispatches_branch_idx
  ON request_dispatches(branch_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS pharmacy_offers (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES medicine_requests(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'HOLD_PENDING', 'HELD', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED', 'FULFILLED', 'FAILED')),
  offer_type text NOT NULL CHECK (offer_type IN ('EXACT', 'PARTIAL', 'ALTERNATIVE_REVIEW_REQUIRED', 'ORDERABLE')),
  offered_brand text NOT NULL,
  offered_strength text NOT NULL,
  offered_form text NOT NULL,
  available_quantity integer NOT NULL CHECK (available_quantity > 0),
  price_iqd integer NOT NULL CHECK (price_iqd >= 0),
  pickup_enabled boolean NOT NULL DEFAULT true,
  delivery_enabled boolean NOT NULL DEFAULT false,
  preparation_minutes integer NOT NULL DEFAULT 10 CHECK (preparation_minutes BETWEEN 0 AND 1440),
  note text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_offers_request_idx
  ON pharmacy_offers(request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_offers_one_active_branch_idx
  ON pharmacy_offers(request_id, branch_id)
  WHERE status IN ('ACTIVE', 'HOLD_PENDING', 'HELD');

CREATE TABLE IF NOT EXISTS reservations (
  id text PRIMARY KEY,
  public_reference text NOT NULL UNIQUE,
  request_id text NOT NULL REFERENCES medicine_requests(id) ON DELETE CASCADE,
  offer_id text NOT NULL REFERENCES pharmacy_offers(id) ON DELETE CASCADE,
  patient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING_ACK'
    CHECK (status IN ('PENDING_ACK', 'ACTIVE', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED', 'NO_SHOW')),
  acknowledgement_deadline timestamptz NOT NULL,
  acknowledged_at timestamptz,
  hold_expires_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_live_request_idx
  ON reservations(request_id)
  WHERE status IN ('PENDING_ACK', 'ACTIVE', 'READY');
CREATE INDEX IF NOT EXISTS reservations_branch_idx
  ON reservations(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_expiry_idx
  ON reservations(acknowledgement_deadline, hold_expires_at)
  WHERE status IN ('PENDING_ACK', 'ACTIVE', 'READY');

CREATE TABLE IF NOT EXISTS availability_signals (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  presentation_id text REFERENCES medicine_presentations(id),
  medicine_name text NOT NULL,
  source text NOT NULL CHECK (source IN ('PHARMACIST_CONFIRMATION', 'MANUAL_STOCK', 'POS_SYNC', 'REALTIME_SYNC')),
  state text NOT NULL CHECK (state IN ('AVAILABLE', 'LOW', 'UNAVAILABLE', 'ORDERABLE')),
  quantity integer,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS availability_signals_lookup_idx
  ON availability_signals(medicine_name, expires_at DESC);

CREATE TABLE IF NOT EXISTS saved_pharmacies (
  patient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(patient_id, branch_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  resource_type text,
  resource_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  safe_payload jsonb NOT NULL,
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'WEB_PUSH', 'APNS', 'FCM', 'SMS')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON notification_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  reservation_id text NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  patient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reliability_metrics (
  branch_id text PRIMARY KEY REFERENCES pharmacy_branches(id) ON DELETE CASCADE,
  response_rate double precision NOT NULL DEFAULT 0 CHECK (response_rate BETWEEN 0 AND 1),
  average_response_seconds integer NOT NULL DEFAULT 0,
  successful_reservations integer NOT NULL DEFAULT 0,
  completed_requests integer NOT NULL DEFAULT 0,
  confirmed_not_found integer NOT NULL DEFAULT 0,
  cancellation_rate double precision NOT NULL DEFAULT 0 CHECK (cancellation_rate BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  reporter_user_id text NOT NULL REFERENCES users(id),
  target_type text NOT NULL CHECK (target_type IN ('USER', 'PHARMACY', 'REQUEST', 'RESERVATION')),
  target_id text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  resolution text,
  resolved_by text REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id),
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  result text NOT NULL CHECK (result IN ('SUCCESS', 'DENIED', 'FAILED')),
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx ON audit_events(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  principal_id text NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  resource_id text NOT NULL,
  request_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(principal_id, operation, key)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx
  ON idempotency_keys(expires_at);

INSERT INTO medicines (id, generic_name, classification)
VALUES
  ('med-paracetamol', 'Paracetamol', 'OTC'),
  ('med-amoxicillin-clavulanate', 'Amoxicillin / Clavulanic acid', 'PRESCRIPTION')
ON CONFLICT (id) DO NOTHING;

INSERT INTO medicine_presentations
  (id, medicine_id, brand_name, strength, dosage_form, pack_size)
VALUES
  ('pres-panadol-extra-24', 'med-paracetamol', 'Panadol Extra', '500 mg / 65 mg', 'أقراص', '24 قرص'),
  ('pres-augmentin-625-14', 'med-amoxicillin-clavulanate', 'Augmentin', '625 mg', 'أقراص', '14 قرص')
ON CONFLICT (id) DO NOTHING;

INSERT INTO medicine_aliases (id, presentation_id, alias, locale, normalized_alias)
VALUES
  ('alias-panadol-en', 'pres-panadol-extra-24', 'Panadol Extra', 'en', 'panadol extra'),
  ('alias-panadol-ar', 'pres-panadol-extra-24', 'بنادول اكسترا', 'ar', 'بنادول اكسترا'),
  ('alias-augmentin-en', 'pres-augmentin-625-14', 'Augmentin 625', 'en', 'augmentin 625'),
  ('alias-augmentin-ar', 'pres-augmentin-625-14', 'اوجمنتين 625', 'ar', 'اوجمنتين 625')
ON CONFLICT (id) DO NOTHING;
