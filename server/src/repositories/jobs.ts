import { pool } from '../db/pool.js';
import type { JobRow } from '../db/types.js';

export type NewJob = {
  imageId: string;
  userId: string;
  options: unknown;
  optionsHash: string;
};

/**
 * Queues a job, unless one is already live for this image and these options.
 *
 * Returns null when the unique index refused the row, which means another request got
 * there first. The caller is expected to adopt that job rather than start the same
 * work again - see findLiveJob.
 */
export async function createJob({
  imageId,
  userId,
  options,
  optionsHash,
}: NewJob): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `INSERT INTO jobs (image_id, user_id, options, options_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (image_id, options_hash)
       WHERE status IN ('pending', 'processing', 'ready')
       DO NOTHING
     RETURNING *`,
    [imageId, userId, JSON.stringify(options), optionsHash],
  );

  return rows[0] ?? null;
}

/**
 * The live job for this image and these options.
 *
 * This is how the loser of an insert race learns what it lost to. The ordering only
 * breaks a tie - the unique index guarantees there is at most one.
 */
export async function findLiveJob(imageId: string, optionsHash: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM jobs
     WHERE image_id = $1 AND options_hash = $2 AND status IN ('pending', 'processing', 'ready')
     ORDER BY created_at DESC
     LIMIT 1`,
    [imageId, optionsHash],
  );

  return rows[0] ?? null;
}

export async function findReadyJob(imageId: string, optionsHash: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM jobs
     WHERE image_id = $1 AND options_hash = $2 AND status = 'ready'
     ORDER BY created_at DESC
     LIMIT 1`,
    [imageId, optionsHash],
  );

  return rows[0] ?? null;
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

// How long a claim is trusted. Past this the previous holder is assumed to have died
// and the job may be taken again. Must be comfortably longer than
// SQS_VISIBILITY_TIMEOUT, or a busy worker would have its job taken out from under it.
const STALE_CLAIM_SECONDS = 600;

/**
 * Takes the job for this consumer, and reports whether the attempt was won.
 *
 * The queue delivers a message at least once, so two consumers can be handed the same
 * job. This condition is what makes the take exclusive: a job can be taken when it is
 * new, when an earlier attempt failed, or when the existing claim has gone stale. Any
 * other case means somebody else owns it, and the caller must leave the message alone
 * rather than process the same image a second time.
 */
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

export async function markJobReady(id: string, result: JobResult): Promise<void> {
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
           updated_at = now()
       WHERE id = $1`,
      [id, result.processedKey, result.format, result.width, result.height],
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
