-- Shared, bounded sensitive-request throttling for serverless instances.
-- Apply after 001-retorno-schema.sql in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash TEXT PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at BIGINT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_rate_limits_expiry
  ON request_rate_limits(expires_at);

ALTER TABLE request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON request_rate_limits FROM anon, authenticated;
