import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

// The token only ever leaves in the email; the row keeps a digest of it.
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createLoginToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.loginTokenMinutes * 60 * 1000);

  await pool.query('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1, $2, $3)', [
    digest(token),
    email,
    expiresAt,
  ]);

  return token;
}

// One statement, so a link cannot be redeemed twice or after it expires.
export async function consumeLoginToken(token: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>(
    `UPDATE login_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING email`,
    [digest(token)],
  );

  return rows[0]?.email ?? null;
}

// True when a link was sent to this address a moment ago, so one inbox cannot be flooded.
export async function sentRecently(email: string, seconds: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM login_tokens
      WHERE email = $1 AND created_at > now() - make_interval(secs => $2)
      LIMIT 1`,
    [email, seconds],
  );

  return rows.length > 0;
}
