import { pool } from '../db/pool.js';
import type { ImageRow } from '../db/types.js';

export type NewImage = {
  userId: string;
  originalKey: string;
  mimeType: string;
  sizeBytes: number;
};

export async function createImage({
  userId,
  originalKey,
  mimeType,
  sizeBytes,
}: NewImage): Promise<ImageRow> {
  const { rows } = await pool.query<ImageRow>(
    `INSERT INTO images (user_id, original_key, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, originalKey, mimeType, sizeBytes],
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
