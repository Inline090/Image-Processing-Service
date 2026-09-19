import { pool } from '../db/pool.js';
import type { ImageRow } from '../db/types.js';

export type NewImage = {
  userId: string;
  originalKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string | null;
};

export async function createImage({
  userId,
  originalKey,
  mimeType,
  sizeBytes,
  originalFilename,
}: NewImage): Promise<ImageRow> {
  const { rows } = await pool.query<ImageRow>(
    `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, originalKey, mimeType, sizeBytes, originalFilename],
  );

  const image = rows[0];
  if (image === undefined) {
    throw new Error('Insert returned no row');
  }
  return image;
}

export async function findImageByIdForUser(id: string, userId: string): Promise<ImageRow | null> {
  const { rows } = await pool.query<ImageRow>(
    'SELECT * FROM images WHERE id = $1 AND user_id = $2',
    [id, userId],
  );

  return rows[0] ?? null;
}

export async function listImagesForUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    `SELECT * FROM images
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return rows;
}

export async function countImagesForUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM images WHERE user_id = $1',
    [userId],
  );

  return Number(rows[0]?.count ?? 0);
}

// Both delete helpers return the removed rows so the caller can clean up the
// objects they point at. Deleting an image cascades to its jobs.
export async function deleteImageForUser(id: string, userId: string): Promise<ImageRow | null> {
  const { rows } = await pool.query<ImageRow>(
    'DELETE FROM images WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId],
  );

  return rows[0] ?? null;
}

export async function deleteAllImagesForUser(userId: string): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    'DELETE FROM images WHERE user_id = $1 RETURNING *',
    [userId],
  );

  return rows;
}

export async function markImageReady(id: string, processedKey: string): Promise<ImageRow> {
  const { rows } = await pool.query<ImageRow>(
    `UPDATE images
     SET processed_key = $2, status = 'ready'
     WHERE id = $1
     RETURNING *`,
    [id, processedKey],
  );

  const image = rows[0];
  if (image === undefined) {
    throw new Error('Update returned no row');
  }
  return image;
}
