-- Coordinates signup-email delivery across serverless instances.
-- A stale reservation can be replaced after one minute if a function exits early.
CREATE TABLE IF NOT EXISTS email_delivery_reservations (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose = 'signup'),
  reserved_at BIGINT NOT NULL,
  PRIMARY KEY (email, purpose)
);

ALTER TABLE email_delivery_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_delivery_reservations FROM anon, authenticated;
