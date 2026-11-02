-- Outcome evidence remains in the private Storage bucket and is referenced only by admins.
ALTER TABLE item_outcome_notifications ADD COLUMN IF NOT EXISTS proof_image TEXT;
