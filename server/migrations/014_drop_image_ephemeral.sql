-- The cap now refuses an upload rather than keeping an unlisted scratch copy, so the
-- marker has no readers left.
ALTER TABLE images DROP COLUMN IF EXISTS ephemeral;
