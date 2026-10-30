ALTER TABLE pending_registrations ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
ALTER TABLE pending_registrations ADD COLUMN privacy_version TEXT NOT NULL DEFAULT '';
CREATE TABLE policy_acceptances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
