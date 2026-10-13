CREATE TABLE IF NOT EXISTS account_deletion_requests (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS account_deletion_requests_date ON account_deletion_requests(requested_at);
