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

// The conflict clause is a no-op update, which exists only so the statement always
// returns the row: two callbacks arriving together would otherwise have one of them
// fail on the unique pair rather than finding the link the other just made.
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
