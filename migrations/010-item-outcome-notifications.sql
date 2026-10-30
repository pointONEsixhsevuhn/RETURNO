CREATE TABLE item_outcome_notifications (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 outcome TEXT NOT NULL CHECK(outcome IN ('Claimed','Returned')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX item_outcome_notifications_pending_post
 ON item_outcome_notifications(post_id) WHERE reviewed_at IS NULL;
CREATE INDEX item_outcome_notifications_inbox
 ON item_outcome_notifications(reviewed_at, created_at DESC);
