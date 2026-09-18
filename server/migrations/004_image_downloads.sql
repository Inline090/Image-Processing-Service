ALTER TABLE images ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS processed_mime_type TEXT;
