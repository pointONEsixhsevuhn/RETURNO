ALTER TABLE posts ADD COLUMN contact_details TEXT NOT NULL DEFAULT '';
UPDATE posts SET contact_details = contact_email WHERE contact_email <> '';
UPDATE posts SET contact_details = contact_phone WHERE contact_email = '';
UPDATE posts SET contact_details = contact_email || ' / ' || contact_phone WHERE contact_email <> '' AND contact_phone <> '';
