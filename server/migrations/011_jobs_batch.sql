-- A bulk request creates one job per image and tags them all with one batch id, so the
-- status of the whole request can be read back in a single query. The single-image
-- transform leaves it null, which is most rows.
--
-- Not a foreign key to a batches table: the batch has no life of its own beyond
-- grouping its jobs, so a second table would only add a row to join through.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Partial, because most rows are null and there is no point indexing those.
CREATE INDEX IF NOT EXISTS jobs_batch_idx ON jobs (batch_id) WHERE batch_id IS NOT NULL;
