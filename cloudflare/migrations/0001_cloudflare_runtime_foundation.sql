PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS erp_runtime_documents (
  namespace TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS erp_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  command_name TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  result_payload TEXT CHECK (result_payload IS NULL OR json_valid(result_payload)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_erp_idempotency_created_at
  ON erp_idempotency_keys(created_at);

CREATE TABLE IF NOT EXISTS private_object_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  owner_scope TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  source_document TEXT,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'deleted')),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_private_object_owner
  ON private_object_metadata(owner_scope, owner_id, created_at);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  deduplication_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  last_error_code TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_background_jobs_ready
  ON background_jobs(status, available_at);

CREATE TABLE IF NOT EXISTS delivery_tracking_consents (
  id TEXT PRIMARY KEY NOT NULL,
  delivery_job_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'revoked')),
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  revoked_at TEXT,
  revoked_by TEXT,
  revocation_idempotency_key TEXT UNIQUE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_tracking_consent_assignment
  ON delivery_tracking_consents(delivery_job_id, employee_id, status);

CREATE TABLE IF NOT EXISTS delivery_tracking_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  delivery_job_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  consent_id TEXT NOT NULL REFERENCES delivery_tracking_consents(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'stopped', 'expired')),
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  public_token_hash TEXT UNIQUE,
  share_expires_at TEXT,
  share_revoked_at TEXT,
  retention_purge_after TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_one_active_employee
  ON delivery_tracking_sessions(employee_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_one_active_delivery
  ON delivery_tracking_sessions(delivery_job_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS delivery_tracking_points (
  session_id TEXT NOT NULL REFERENCES delivery_tracking_sessions(id) ON DELETE CASCADE,
  client_point_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters REAL,
  heading_degrees REAL,
  speed_meters_per_second REAL,
  quality TEXT NOT NULL CHECK (quality IN ('accepted', 'suspect')),
  suspect_reason TEXT,
  PRIMARY KEY (session_id, client_point_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_tracking_points_timeline
  ON delivery_tracking_points(session_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_tracking_points_retention
  ON delivery_tracking_points(received_at);

CREATE TABLE IF NOT EXISTS delivery_tracking_events (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT REFERENCES delivery_tracking_sessions(id),
  delivery_job_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_tracking_events_timeline
  ON delivery_tracking_events(occurred_at);
