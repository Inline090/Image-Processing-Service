-- The cache was keyed on the image's id, so the same picture uploaded twice was two rows,
-- two keys and two jobs. The key becomes the digest of the stored bytes, which is a property
-- of the picture rather than of the row it happens to live in.
--
-- Rows that predate this keep a null digest and are still keyed on their id, because
-- recovering the old bytes would mean reading every object back out of S3.
ALTER TABLE images ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- One live job per user and options, rather than per image and options. Two uploads of the
-- same file with the same options now share one job and one stored result.
--
-- Existing duplicates are resolved before the constraint is created: the best row of each set
-- is kept, a finished one beating one still in flight, and the losers are marked failed rather
-- than deleted so the history stays readable.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, options_hash
           ORDER BY (status = 'ready') DESC, created_at DESC
         ) AS rn
  FROM jobs
  WHERE status IN ('pending', 'processing', 'ready')
)
UPDATE jobs
SET status = 'failed',
    error = 'Superseded by a duplicate job for the same options',
    updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_live_unique_user_idx
  ON jobs (user_id, options_hash)
  WHERE status IN ('pending', 'processing', 'ready');

-- The older per-image constraint is left in place. It cannot conflict with this one: the same
-- image is always the same user, so anything it would reject is rejected here first.
