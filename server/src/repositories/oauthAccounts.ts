import { pool } from '../db/pool.js';
import type { OAuthAccountRow } from '../db/types.js';

export async function findAccount(
  provider: string,
  providerId: string,
): Promise<OAuthAccountRow | null> {
  const { rows } = await pool.query<OAuthAccountRow>(
    'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_id = $2',
    [provider, providerId],
  );

  return rows[0] ?? null;
}

// A no-op update on conflict, so the row always comes back.
export async function linkAccount(
  userId: string,
  provider: string,
  providerId: string,
): Promise<OAuthAccountRow> {
  const { rows } = await pool.query<OAuthAccountRow>(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_id) DO UPDATE SET provider = EXCLUDED.provider
     RETURNING *`,
    [userId, provider, providerId],
  );

  const account = rows[0];
  if (account === undefined) {
    throw new Error('Insert returned no row');
  }

  return account;
}
