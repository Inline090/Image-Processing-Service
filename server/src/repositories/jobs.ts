import { pool } from '../db/pool.js';
import type { JobRow } from '../db/types.js';

export type NewJob = {
  imageId: string;
  userId: string;
  options: unknown;
  optionsHash: string;
};

export async function createJob({
  imageId,
  userId,
  options,
  optionsHash,
}: NewJob): Promise<JobRow> {
  const { rows } = await pool.query<JobRow>(
    `INSERT INTO jobs (image_id, user_id, options, options_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [imageId, userId, JSON.stringify(options), optionsHash],
  );

  const job = rows[0];
  if (job === undefined) {
    throw new Error('Insert returned no row');
  }
  return job;
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

export async function markJobProcessing(id: string): Promise<void> {
  await pool.query(
    `UPDATE jobs
     SET status = 'processing', attempts = attempts + 1, updated_at = now()
     WHERE id = $1`,
    [id],
  );
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
