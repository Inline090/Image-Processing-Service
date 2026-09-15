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
