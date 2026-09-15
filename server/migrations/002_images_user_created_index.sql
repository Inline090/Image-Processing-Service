CREATE INDEX IF NOT EXISTS images_user_created_idx ON images (user_id, created_at DESC);
