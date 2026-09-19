-- A guest's upload allowance is spent, not borrowed: the counter only ever goes
-- up, so deleting history cannot refund quota and hand out unlimited uploads.
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_upload_count INTEGER NOT NULL DEFAULT 0;

-- Backfill from what guests are still holding, so introducing the column does not
-- silently reset the cap for sessions that are already partway through it.
UPDATE users
SET guest_upload_count = (SELECT count(*) FROM images WHERE images.user_id = users.id)
WHERE is_guest = true AND guest_upload_count = 0;
