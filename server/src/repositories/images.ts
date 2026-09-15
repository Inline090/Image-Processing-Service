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
