import { pool } from '../db/pool.js';

export async function findGuestUploadCount(usageKey: string): Promise<number> {
  const { rows } = await pool.query<{ upload_count: number }>(
    'SELECT upload_count FROM guest_usage WHERE usage_key = $1',
    [usageKey],
  );

  return rows[0]?.upload_count ?? 0;
}

// Claim and check in one statement, so two requests cannot both take the last slot.
export async function reserveGuestUploads(
  usageKey: string,
  count: number,
  limit: number,
): Promise<number | null> {
  if (count <= 0) {
    return null;
  }

  const { rows } = await pool.query<{ upload_count: number }>(
    `INSERT INTO guest_usage (usage_key, upload_count)
     SELECT $1::text, $2::int WHERE $2::int <= $3::int
     ON CONFLICT (usage_key) DO UPDATE
       SET upload_count = guest_usage.upload_count + EXCLUDED.upload_count,
           updated_at = now()
       WHERE guest_usage.upload_count + EXCLUDED.upload_count <= $3::int
     RETURNING upload_count`,
    [usageKey, count, limit],
  );

  return rows[0]?.upload_count ?? null;
}

export async function refundGuestUploads(usageKey: string | null, count: number): Promise<void> {
  if (usageKey === null || count <= 0) {
    return;
  }

  await pool.query(
    `UPDATE guest_usage
        SET upload_count = GREATEST(0, upload_count - $2::int),
            updated_at = now()
      WHERE usage_key = $1`,
    [usageKey, count],
  );
}
