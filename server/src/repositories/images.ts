import { pool } from '../db/pool.js';
import type { ImageRow } from '../db/types.js';

export type NewImage = {
  userId: string;
  originalKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string | null;
  contentHash: string;
};

export async function createImage({
  userId,
  originalKey,
  mimeType,
  sizeBytes,
  originalFilename,
  contentHash,
}: NewImage): Promise<ImageRow> {
  const { rows } = await pool.query<ImageRow>(
    `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, originalKey, mimeType, sizeBytes, originalFilename, contentHash],
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

export async function findImagesByIdsForUser(ids: string[], userId: string): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    'SELECT * FROM images WHERE id = ANY($1::uuid[]) AND user_id = $2',
    [ids, userId],
  );

  return rows;
}

// Everything the user owns, newest first.
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

export async function countHistoryForUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM images WHERE user_id = $1',
    [userId],
  );

  return Number(rows[0]?.count ?? 0);
}

// Points a second upload of one picture at the result a cached job already stored.
export async function linkImageToResult(
  id: string,
  processedKey: string,
  processedMimeType: string,
): Promise<void> {
  await pool.query(
    `UPDATE images
        SET processed_key = $2, processed_mime_type = $3, status = 'ready'
      WHERE id = $1`,
    [id, processedKey, processedMimeType],
  );
}

// True when another image still points at this result, which is what happens once one
// picture has been uploaded twice. Deleting the object would break the other row.
export async function isResultShared(processedKey: string, exceptImageId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM images WHERE processed_key = $1 AND id <> $2 LIMIT 1',
    [processedKey, exceptImageId],
  );

  return rows.length > 0;
}

export async function deleteImageForUser(id: string, userId: string): Promise<ImageRow | null> {
  const { rows } = await pool.query<ImageRow>(
    'DELETE FROM images WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId],
  );

  return rows[0] ?? null;
}

export async function deleteAllImagesForUser(userId: string): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>('DELETE FROM images WHERE user_id = $1 RETURNING *', [
    userId,
  ]);

  return rows;
}
