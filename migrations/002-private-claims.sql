CREATE TABLE claims (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
 claimant_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 20 AND 2000),
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX claims_pending_student_post ON claims(post_id,claimant_id) WHERE status='Pending';
CREATE INDEX claims_claimant_created ON claims(claimant_id,created_at);
