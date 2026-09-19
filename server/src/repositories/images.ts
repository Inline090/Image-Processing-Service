import { pool } from '../db/pool.js';
import type { ImageRow } from '../db/types.js';

export type NewImage = {
  userId: string;
  originalKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string | null;
  /** Outside the history cap: the scratch slot, replaced by the next upload. */
  ephemeral?: boolean;
};

export async function createImage({
  userId,
  originalKey,
  mimeType,
  sizeBytes,
  originalFilename,
  ephemeral = false,
}: NewImage): Promise<ImageRow> {
  const { rows } = await pool.query<ImageRow>(
    `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename, ephemeral)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, originalKey, mimeType, sizeBytes, originalFilename, ephemeral],
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

// History is what the user is shown, so the cap and the listing have to agree on
// what counts: an ephemeral row exists only to carry a transform past a full
// history and is never listed.
export async function listImagesForUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    `SELECT * FROM images
     WHERE user_id = $1 AND ephemeral = false
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return rows;
}

export async function countHistoryForUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM images WHERE user_id = $1 AND ephemeral = false',
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
  const { rows } = await pool.query<ImageRow>('DELETE FROM images WHERE user_id = $1 RETURNING *', [
    userId,
  ]);

  return rows;
}

// Clearing the scratch slot is what keeps a full history bounded. A scratch that
// is still being transformed is left alone - deleting its row would make the
// worker fail against an image that no longer exists - and the next upload
// collects it instead.
export async function deleteSettledEphemeralForUser(
  userId: string,
  keepId: string,
): Promise<ImageRow[]> {
  const { rows } = await pool.query<ImageRow>(
    `DELETE FROM images
     WHERE user_id = $1
       AND ephemeral = true
       AND id <> $2
       AND NOT EXISTS (
         SELECT 1 FROM jobs
         WHERE jobs.image_id = images.id AND jobs.status IN ('pending', 'processing')
       )
     RETURNING *`,
    [userId, keepId],
  );

  return rows;
}
