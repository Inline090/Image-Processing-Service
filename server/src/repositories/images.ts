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

export async function findImageById(id: string): Promise<ImageRow | null> {
  const { rows } = await pool.query<ImageRow>('SELECT * FROM images WHERE id = $1', [id]);

  return rows[0] ?? null;
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

export async function listImages(limit: number, offset: number): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    'SELECT * FROM images ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );

  return rows;
}

export async function countImages(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM images',
  );

  return Number(rows[0]?.count ?? 0);
}
