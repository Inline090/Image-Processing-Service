-- A batch is announced once. The stamp lives on the batch's own jobs rather than in a
-- separate table, and the claim is a single UPDATE across them: the first worker to
-- reach it stamps every row, and a second worker that arrives at the same moment waits
-- on the row locks, re-checks the condition and updates nothing.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notified_at timestamptz;
