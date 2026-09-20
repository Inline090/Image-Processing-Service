-- One live job per (image, options), counting pending, processing and ready.
--
-- Two identical requests arriving together both miss the cache in the API and both
-- insert. Without this constraint that is two jobs, two queue messages and two stored
-- results for one answer. That is not hypothetical: the dev database holds two ready
-- jobs for the same image and options, 71ms apart.
--
-- `failed` is deliberately outside the index. A job that failed has to be able to be
-- asked for again, and a constraint that covered it would refuse the retry.

-- Existing duplicates have to be resolved before the constraint can be created. The
-- best row of each pair is kept - a finished one beats one still in flight - and the
-- losers are marked failed rather than deleted, so the history stays readable.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY image_id, options_hash
           ORDER BY (status = 'ready') DESC, created_at DESC
         ) AS rn
  FROM jobs
  WHERE status IN ('pending', 'processing', 'ready')
)
UPDATE jobs
SET status = 'failed',
    error = 'Superseded by a duplicate job for the same image and options',
    updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_live_unique_idx
  ON jobs (image_id, options_hash)
  WHERE status IN ('pending', 'processing', 'ready');
