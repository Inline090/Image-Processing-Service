-- A finished job is the cache entry, so it needs a time to live. An entry past its expiry is
-- ignored by the cache lookup and then deleted, which stops the table growing forever and stops a
-- pipeline version bump leaving rows nothing can reach.
--
-- Entries that already exist are given a full window from now rather than expiring on deploy, so a
-- release does not empty the cache.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cache_until timestamptz;

UPDATE jobs
SET cache_until = now() + interval '7 days'
WHERE status = 'ready' AND cache_until IS NULL;

-- Only finished jobs can expire, so the index covers just those rows.
CREATE INDEX IF NOT EXISTS jobs_cache_until_idx ON jobs (cache_until) WHERE status = 'ready';
