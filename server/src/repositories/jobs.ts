import { pool } from '../db/pool.js';
import type { JobRow } from '../db/types.js';

export type NewJob = {
  imageId: string;
  userId: string;
  options: unknown;
  optionsHash: string;

  batchId?: string | null;
};

// The partial unique index rejects a second live job for the same user and options, so one
// picture uploaded twice with the same transform shares a single job.
export async function createJob({
  imageId,
  userId,
  options,
  optionsHash,
  batchId = null,
}: NewJob): Promise<JobRow | null> {
  // The unique index cannot know about time, so an entry past its time to live is cleared here
  // rather than being left to block a fresh job until the next prune.
  await pool.query(
    `DELETE FROM jobs
      WHERE user_id = $1 AND options_hash = $2 AND status = 'ready' AND cache_until < now()`,
    [userId, optionsHash],
  );

  const { rows } = await pool.query<JobRow>(
    `INSERT INTO jobs (image_id, user_id, options, options_hash, batch_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, options_hash)
       WHERE status IN ('pending', 'processing', 'ready')
       DO NOTHING
     RETURNING *`,
    [imageId, userId, JSON.stringify(options), optionsHash, batchId],
  );

  return rows[0] ?? null;
}

export async function findJobsByBatchForUser(batchId: string, userId: string): Promise<JobRow[]> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM jobs
     WHERE batch_id = $1 AND user_id = $2
     ORDER BY created_at ASC, id ASC`,
    [batchId, userId],
  );

  return rows;
}

export type JobBatch = {
  batchId: string;
  userId: string;
};

export async function findJobBatch(jobId: string): Promise<JobBatch | null> {
  const { rows } = await pool.query<{ batch_id: string | null; user_id: string }>(
    'SELECT batch_id, user_id FROM jobs WHERE id = $1',
    [jobId],
  );

  const row = rows[0];

  if (row === undefined || row.batch_id === null) {
    return null;
  }

  return { batchId: row.batch_id, userId: row.user_id };
}

export async function countOutstandingInBatch(
  batchId: string,
  maxAttempts: number,
): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM jobs
      WHERE batch_id = $1
        AND (status IN ('pending', 'processing') OR (status = 'failed' AND attempts < $2))`,
    [batchId, maxAttempts],
  );

  return rows[0]?.count ?? 0;
}

// The first worker to stamp the batch sends the email; a second one updates nothing.
export async function claimBatchAnnouncement(batchId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE jobs SET notified_at = now() WHERE batch_id = $1 AND notified_at IS NULL',
    [batchId],
  );

  return rowCount !== null && rowCount > 0;
}

// An entry whose time to live has passed is not live, so it neither answers a request nor blocks a
// fresh job for the same key.
export async function findLiveJob(userId: string, optionsHash: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM jobs
     WHERE user_id = $1 AND options_hash = $2
       AND (
         status IN ('pending', 'processing')
         OR (status = 'ready' AND (cache_until IS NULL OR cache_until > now()))
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, optionsHash],
  );

  return rows[0] ?? null;
}

// An entry past its time to live is not served, and the worker deletes it.
export async function findReadyJob(userId: string, optionsHash: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM jobs
     WHERE user_id = $1 AND options_hash = $2 AND status = 'ready'
       AND (cache_until IS NULL OR cache_until > now())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, optionsHash],
  );

  return rows[0] ?? null;
}

// Deletes the entries that have expired. Rows only: the stored object belongs to the image, which
// still points at it, so nothing a user can see is removed here.
export async function pruneExpiredCache(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM jobs
      WHERE status = 'ready' AND cache_until IS NOT NULL AND cache_until < now()`,
  );

  return rowCount ?? 0;
}

export async function findJobByIdForUser(id: string, userId: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );

  return rows[0] ?? null;
}

export type JobResult = {
  processedKey: string;
  format: string;
  mimeType: string;
  width: number;
  height: number;
};

// Longer than the queue visibility timeout, so a live worker is never robbed of its job.
const STALE_CLAIM_SECONDS = 600;

// Only the consumer that wins this update runs the job.
export async function markJobProcessing(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE jobs
     SET status = 'processing', attempts = attempts + 1, updated_at = now()
     WHERE id = $1
       AND (
         status IN ('pending', 'failed')
         OR (status = 'processing' AND updated_at < now() - make_interval(secs => $2))
       )`,
    [id, STALE_CLAIM_SECONDS],
  );

  return rowCount === 1;
}

export async function markJobReady(
  id: string,
  result: JobResult,
  cacheTtlDays: number,
): Promise<void> {
  // The job row and the image row move together, or the list shows a stale result.
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE jobs
       SET status = 'ready',
           processed_key = $2,
           format = $3,
           width = $4,
           height = $5,
           cache_until = now() + make_interval(days => $6::int),
           updated_at = now()
       WHERE id = $1`,
      [id, result.processedKey, result.format, result.width, result.height, cacheTtlDays],
    );
    await client.query(
      `UPDATE images
       SET processed_key = $2, processed_mime_type = $3, status = 'ready'
       WHERE id = (SELECT image_id FROM jobs WHERE id = $1)`,
      [id, result.processedKey, result.mimeType],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markJobFailed(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [id, error],
  );
}
